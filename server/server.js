import "dotenv/config";
import express from "express";
import path from "node:path";
import fs from "node:fs";
import { fileURLToPath } from "node:url";
import trainsRouter from "./routes/trains.js";
import photosRouter, { PHOTOS_DIR } from "./routes/photos.js";
import { startTelegramBot } from "./services/telegramBot.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();
const PORT = process.env.PORT || 3001;

//Ensure the photos directory exists (rclone/Telegram both write here).
fs.mkdirSync(PHOTOS_DIR, { recursive: true });

app.use("/api/trains", trainsRouter);
app.use("/api/photos", photosRouter);
app.use("/photos", express.static(PHOTOS_DIR, { maxAge: "1h" }));

//Display schedule + behavior config, read by the client on boot.
app.get("/api/config", (req, res) => {
    res.json({
        station: process.env.ORIGIN_STATION || "Metropark",
        destination: process.env.DEST_STATION || "New York Penn",
        walkMinutes: Number(process.env.WALK_MINUTES || 12),
        dashboardStart: process.env.DASHBOARD_START || "6:50",
        dashboardEnd: process.env.DASHBOARD_END || "9:30",
        weekdaysOnly: process.env.WEEKDAYS_ONLY !== "false",
        pollSeconds: Number(process.env.POLL_SECONDS || 45),
        photoSeconds: Number(process.env.PHOTO_SECONDS || 20),
    });
});

// In production the server serves the built client, so the Pi runs one process.
const dist = path.join(__dirname, "..", "client", "dist");
if (fs.existsSync(dist)) {
    app.use(express.static(dist));
    app.get(/^(?!\/api|\/photos).*/, (req, res) =>
    res.sendFile(path.join(dist, "index.html"))
);
}

app.listen(PORT, () => {
console.log(`[server] listening on http://localhost:${PORT}`);
console.log(`[server] photos dir:${PHOTOS_DIR}`);
console.log(`[server] train data: ${process.env.NJT_USERNAME ? "LIVE (NJT RailData)" : "MOCK (set NJT_USERNAME/NJT_PASSWORD in .env for live)"}`
);
});

startTelegramBot(PHOTOS_DIR);

