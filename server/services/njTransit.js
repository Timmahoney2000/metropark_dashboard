/**
 * NJ TransitRailData API adapter.
 * Verified against NJTRANSIT_RailData_API_V2.pdf (the portal's reference doc).
 * 
 * NOTE: the portal's HTML docs page lists the host as "raildata.njt.gov",
 * which does not resolve. The PDF gives the real hosts:
 * Test: https://testraildata.njtransit.com/api/TrainData
 * Production: https://raildata.njtransit.com/api/TrainData
 * NJT asks developers to use Test while building.
 * 
 * CRITICAL RATE LIMIT: getToken is capped at 10 calls per DAY. Tokens last 24 hours. That is why the token is cached on disk and reused, and why the 401-retry re-mints at most once.
 */

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const TOKEN_CACHE = path.join(__dirname, "..", ".njt-token.json");

const BASE = process.env.NJT_BASE_URL || "https://testraildata.njtransit.com/api/TrainData";
const STATION = process.env.NJT_STATION_CODE || "MP"; // Metropark
const TOKEN_TTL_MS = 23 * 60 * 60 * 1000;

// Appendix II: at Metropark, railroad track "2" is public track "1".
const TRACK_TRANSLATION = { MP: { "2": "1" } };

export function liveConfigured() {
    return Boolean(process.env.NJT_USERNAME && process.env.NJT_PASSWORD);
}

function readCachedToken() {
    try {
        const c = JSON.parse(fs.readFileSync(TOKEN_CACHE, "utf8"));
        if (c.token && Date.now() - c.mintedAt < TOKEN_TTL_MS) return c.token;
    } catch {
        /* no cache yet */
    }
    return null;
}

async function mintToken() {
    const body = new FormData();
    body.append("username", process.env.NJT_USERNAME);
    body.append("password", process.env.NJT_PASSWORD);
    const res = await fetch(`${BASE}/getToken`, {
        method: "POST",
        headers: { accept: "text/plain" },
        body,
    });
    if (!res.ok) throw new Error(`getToken HTTP ${res.status}`);
    const data = await res.json();
    if (data?.errorMessage) throw new Error(`getToken: ${data.errorMessage}`);
    if (String(data?.Authenticated).toLowerCase() !== "true" || !data?.UserToken) {
        throw new Error("getToken: authentication failed (check credentials)");
    }
    fs.writeFileSync(
        TOKEN_CACHE,
        JSON.stringify({ mintedAt: Date.now(), token: data.UserToken })
    );
    console.log("[njt] minted a new token (daily limit is 10)");
    return data.UserToken;
}

async function fetchSchedule(token) {
    const body = new FormData();
    body.append("token", token);
    body.append("station", STATION);
    return fetch(`${BASE}/getTrainSchedule`, {
        method: "POST",
        headers: { accept: "text/plain" },
        body,
    });
}

export async function getLiveDepartures() {
    let token = readCachedToken() || (await mintToken());
    let res = await fetchSchedule(token);
    if (res.status === 401 || res.status === 403) {
        token = await mintToken();
        res = await fetchSchedule(token);
    }
    if (!res.ok) throw new Error(`getTrainSchedule HTTP ${res.status}`);

    const data = await res.json();
    if (data?.errorMessage) throw new Error(`schedule: ${data.errorMessage}`);
    // An invalid token comes back as a body, not an HTTP error - re-mint once.
    if (typeof data === "object" && data?.errorMessage === "Invalid token.") {
        token = await mintToken();
        const retry = await fetchSchedule(token);
        return shape(await retry.json());
    }
    return shape(data);
}

function shape(data) {
    const items = Array.isArray(data?.ITEMS) ? data.ITEMS : [];
    const departures = items
    .filter(isNJTPassengerTrain)
    .filter(headsToNewYork)
    .map(normalize)
    .filter(Boolean)
    .slice(0, 4);

    return {
        updatedAt: new Date().toISOString(),
        source: "njt",
        station: data?.STATIONNAME || STATION,
        alerts: mapAlerts(data?.STATIONMSGS),
        departures,
    };
}

/** Appendix I: train Id's prefixed A (Amtrak), s (Sepia), X (non-revenue).
 * She cant' ride those on an NJT ticket, so keep only all-digit ID's.
 */

function isNJTPassengerTrain(t) {
    return /^\d+$/.test(String(t?.TRAIN_ID || "").trim());
}

/** Keep only trains that reach New York AFTER stopping at our station. 
 * NJT returns each train's full run, and southbound trains (NY -> Trenton)
 * list New York FIRST - they'd pass the old destination-string check while 
 * actually heading away from the city.
 */
function headsToNewYork(t) {
    const stops = t?.STOPS;
    if (!Array.isArray(stops)) {
        // no stop list: fall back to the destination string.
        return String(t?.DESTINATION || "").toLowerCase().includes("new york");
    }
    const from = stops.findIndex((s) => s?.STATION_2CHAR === STATION);
    const to = stops.findIndex((s) => s?.STATION_2CHAR === "NY");
    return from !== -1 && to -1 && to > from;
}

function normalize(t) {
    const scheduled = parseNjtDate(t.SCHED_DEP_DATE);
    if (!scheduled) return null;

    const secLate = Number(t.SEC_LATE);
    const delayMinutes = Number.isFinite(secLate)
    ? Math.max(0, Math.round(secLate / 60))
    : 0;

    const rawTrack = String(t.TRACK || "").trim();
    const track = TRACK_TRANSLATION[STATION]?.[rawTrack] ?? rawTrack;

    return {
        scheduled: scheduled.toISOString(),
        estimated: new Date(scheduled.getTime() + delayMinutes * 60000).toISOString(),
        train: String(t.TRAIN_ID || ""),
        line: t.LINE || "",
        track: track || null,
        status: statusFrom(t.STATUS, delayMinutes),
        delayMinutes,
        arrivesNYP: findStopArrival(t.STOPS, STATION, "NY"),
        stopsToNY: countStopsBetween(t.STOPS, STATION, "NY"),
    };
}

/**
 *  Pull the estimated arrival time at a given station out of a train's STOPS.
 */
function findStopArrival(stops, fromCode, toCode) {
    if(!Array.isArray(stops)) return null;
    const from = stops.findIndex((s) => s?.STATION_2CHAR === fromCode);
    const to = stops.findIndex((s) => s?.STATION_2CHAR === toCode);
     console.log("[njt] arrival:", { from, to, raw: stops[to]?.TIME, parsed: parseNjtDate(stops[to]?.TIME) });
    if (from === -1 || to === -1 || to <= from) return null;
    const t = parseNjtDate(stop.TIME);
    return t ? t.toISOString() : null;
}

/** Intermediate stops between origin and destination - low count means express */
function countStopsBetween(stops, fromCode, toCode) {
    if (!Array.isArray(stops)) return null;
    const from = stops.findIndex((s) => s?.STATION_2CHAR === fromCode);
    const to = stops.findIndex((s) => s?.STATION_2CHAR === toCode);
    if (from === -1 || to === -1 || to <= from) return null;
    return to - from - 1;
}

/** NJT sends "30-May-2024 11:52:00 AM" - parsed explicitly, no engine guessing. */
function parseNjtDate(s) {
    if (typeof s !== "string") return null;
    const m = 
    /^(\d{1,2})-([A-Za-z]{3})-(\d{4})\s+(\d{1,2}):(\d{2}):(\d{2})\s*(AM|PM)?$/i.exec(
      s.trim()
    );
    if (!m) return null;
    const months = { jan:0, feb:1, mar:2, apr:3, may:4, jun:5, jul:6, aug:7, sep:8, oct:9, nov:10, dec:11 };
    const mo = months[m[2].toLowerCase()];
    if (mo === undefined) return null;
    let hour = Number(m[4]);
    const ap = (m[7] || "").toUpperCase();
    if (ap === "PM" && hour !== 12) hour += 12;
    if (ap === "AM" && hour === 12) hour = 0;
    return new Date(Number(m[3]), mo, Number(m[1]), hour, Number(m[5]), Number(m[6]));
}

function statusFrom(raw, delayMinutes) {
    const s = String(raw || "").toLowerCase();
    if (s.includes("cancel")) return "canceled";
    if (s.includes("all aboard")) return "all-aboard";
    if (s.includes("board") || s.includes("arriv")) return "boarding";
    if (delayMinutes >= 1) return "late";
    return "on-time";
}

/** STATIONSMSGS -> our alert shape. Newest first, cap at 3. */
function mapAlerts(msgs) {
    if (!Array.isArray(msgs)) return [];
    return msgs
    .filter((m) => (m?.MSG_TEXT || "").trim())
    .slice(0, 3)
    .map((m) => ({
        severity: m.MSG_TYPE === "fullscreen" ? "bad" : "info",
        text: String(m.MSG_TEXT).trim(),
    }));
}