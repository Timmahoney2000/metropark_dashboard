import { Router } from "express";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
export const PHOTOS_DIR =
process.env.PHOTOS_DIR || path.join(__dirname, "..", "photos");

const EXT = new Set([".jpg", ".jpeg", ".png", ".webp", ".gif"]);
const MAX_IN_ROTATION = Number(process.env.PHOTO_ROTATION_CAP || 200);

const router = Router();

/**
 * GET /api/photos -> { photos: [{ url, name, addedAt }] } newest first.
 * The client shows index 0 immediately when it detects a new arrival,
 * so "text a photo, it appears" works.
 */

router.get("/", (req, res) => {
    let files = [];
    try {
        files = fs
        .readdirSync(PHOTOS_DIR)
        .filter((f) => EXT.has(path.extname(f).toLowerCase()))
        .map((f) => {
            const st = fs.statSync(path.join(PHOTOS_DIR, f));
            return { name: f, addedAt: st.mtimeMs };
        })
        .sort((a, b) => b.addedAt - a.addedAt)
        .slice(0, MAX_IN_ROTATION);
    } catch (err) {
        console.error("[photos] read error:", err.message);
    }
    res.json({
        photos: files.map((f) => ({
            url: `/photos/${encodeURIComponent(f.name)}`,
            name: f.name,
            addedAt: new Date(f.addedAt).toISOString(),
        })),
    });
}); 

export default router;