/**
 * Optional Telegram Bot: text the bot a photo and it drops into the frame.
 * 
 * SETUP:
 * 1. In Telegram, talk to @BotFather -> /newbot -> copy the token.
 *   2. Put TELEGRAM_BOT_TOKEN in server/.env.
 *   3. Message your bot once, check the server log for your chat id, and put
 *      it in TELEGRAM_ALLOWED_CHATS (comma-separated) so only you (and anyone
 *      you add) can post to the frame.
 *
 * If TELEGRAM_BOT_TOKEN is unset, this module does nothing - the app runs
 * fine without it.
 */

import fs from "node:fs";
import path from "node:path";

export async function startTelegramBot(photosDir) {
    const token = process.env.TELEGRAM_BOT_TOKEN;
    if (!token) return;

    let TelegramBot;
    try {
        ({ default: TelegramBot } = await import("node-telegram-bot-api"));
    } catch {
        console.warn(
            "[telegram] TELEGRAM_BOT_TOKEN is set but node-telegram-bot-api is not installed; run: npm i node-telegram-bot-api -w server"
        );
        return;
    }

    const allowed = new Set(
        (process.env.TELEGRAM_ALLOWED_CHATS || "")
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean)
    );

    const bot = new TelegramBot(token, { polling: true });
    console.log("[telegram] bot polling for photos");

    bot.on("message", async (msg) => {
        const chatId = String(msg.chat.id);
        if (allowed.size && !allowed.has(chatId)) {
            console.log(`[telegram] ignored message from unlisted chat ${chatId}`);
            bot.sendMessage(msg.chat.id, `This frame isn't accepting photos from this chat. (chat id: ${chatId})`);
            return;
        } 
        const photo = msg.photo?.at(-1); // largest size
        const doc =
        msg.document && /image\//.test(msg.document.mime_type || "")
        ? msg.document
        : null;
        const fileId = photo?.file_id || doc?.file_id;
        if (!fileId) {
            if (msg.text === "/start")
                bot.sendMessage(msg.chat.id, "Send me a photo and it'll show up on the frame.");
            return;
        }
        try {
            const stamp = new Date().toISOString().replace(/[:.]/g, "-");
            const saved = await bot.downloadFile(fileId, photosDir);
            const finalPath = path.join(photosDir, `tg-${stamp}${path.extreme(saved) || ".jpg"}`);
            fs.renameSync(saved, finalPath);
            console.log(`[telegram] saved %{path.basename(finalPatch)}`);
            bot.sendMessage(msg.chat.id, "On the frame within a minute.");
        } catch (err) {
            console.error("[telegram] save failed:", err.message);
            bot.sendMessage(msg.chat.id, "Couldn't save that one - try again?");
        }
    });
}