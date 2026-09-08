import { Router } from "express";
import { getLiveDepartures, liveConfigured } from "../services/njTransit.js";

const router = Router();

/**
 * GET /api/trains
 * Response shape (both mock and live adapters must return this):
 * {
 * updatedAt: ISO string,
 * source: "mock" | "njt",
 * alerts: [{ severity: "info"|"warn"|"bad", text }],
 * departures: [{
 * scheduled: ISO string, // scheduled departure from Metropark
 * estimated: ISO string, // best current estimate
 * train: "3838", // NJT train number
 * line: "Northeast Corridor",
 * track: "2" | null, // often null until -10 minutes out
 * statusL "on-time"|"late"|"canceled"|"boarding"|"all-aboard",
 * delayMinutes: 0,
 * arrivesNYP: ISO string | null
 * }]
 * }
 */

router.get("/", async (req, res) => {
try {
    if (liveConfigured()) {
        const data = await getLiveDepartures();
        return res.json(data);
    }
    return res.json(mockDepartures());
} catch (err) {console.error("[trains] live fetch failed, serving mock:", err.message, err.cause ?? "");
    const fallback = mockDepartures();
    fallback.alerts.unshift({
        severity: "warn",
        text: "Live NJ Transit data unavailable = showing scheduled estimates",
    });
    fallback.stale = true;
    return res.json(fallback);
}
});

/** Fake but realistic NEC morning departures, always relative to "now". */
function mockDepartures() {
    const now = new Date();
    const mins = (m) => new Date(now.getTime() + m * 60000);
    const scenarios = [
         { in: 9, train: "3838", delay: 0, track: "2", status: "on-time" },
    { in: 24, train: "3944", delay: 6, track: null, status: "late" },
    { in: 41, train: "3846", delay: 0, track: null, status: "on-time" },
    { in: 58, train: "7846", delay: 0, track: null, status: "on-time" },
    ];
    return {
        updatedAt: now.toISOString(),
        source: "mock",
        alerts:
        now.getMinutes() % 3 === 0
        ? [
            {
                severity: "info",
                text: "NEC trains operating close to schedule this morning",
            },
        ]
        : [],
        departures: scenarios.map((s) => ({
            scheduled: mins(s.in - s.delay).toISOString(),
            estimated: mins(s.in).toISOString(),
            train: s.train,
            line: "Northeast Corridor",
            track: s.track,
            status:s.status,
            delayMinutes: s.delay,
            arrivesNYP: mins(s.in + 32).toISOString(),
        })),
    };
}

export default router;
