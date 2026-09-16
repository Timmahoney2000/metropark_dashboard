import { Router } from "express";
import { getLiveDepartures, liveConfigured } from "../services/njTransit";

const router = Router();

/**
 * GET /api/trains
 * 
 * There is deliberately NO mock/demo fallback here. This board hangs on a 
 * bedroom wall and someone makes real decisions from it, so a plausible-looking
 * fake departure is worse than an empty board. When anything goes wrong we
 * return source: "unavailable" with an empty departures array, and the client
 * says so plainly.
 * 
 * Response shape:
 * {
 * updatedAt: ISO string,
 * source: "njt" | "unavailable",
 * error: string,   // only when source is "unavailable"
 * station: string,
 * alerts: [{ severity: "info"|"warn"|"bad", text }],
 * departures: [{
 * scheduled: ISO string,    // scheduled departure from Metropark
 * estimated: ISO string,    // scheduled + delay
 * train: "3838",            // NJT train number
 * line: "Northeast Corridr",
 * track: "1" | null,        // already translated to the public track
 * status: "on-time"|"late"|"canceled"|"boarding"|"all-aboard",
 * delayMinutes: 0,
 * arrivesNYP: ISO string | null,
 * stopsToNY: number | null     // intermediate stops; ,+ 3 means express
 * }]
 * }
 */
router.get("/", async (req, res) => {
    if (!liveConfigured()) {
        return res.json(
            unavailable("NJ Transit credentials are not configured on this server")
        );
    }

    try {
        const data = await getLiveDepartures();
        return res.json(data);
    } catch (err) {
        console.error("[trains] live fetch failed:", err.message);
        return res.json(unavailable(err.message));
    }
});

/** Explicit "we don't know" state - never fabricated departures. */
function unavailable(error) {
    return {
        updatedAt: new Date().toISOString(),
        source: "unavailable",
        error,
        station: process.env.ORIGIN_STATION || "Metropark",
        alert: [],
        departures: [],
    };
}

export default router;