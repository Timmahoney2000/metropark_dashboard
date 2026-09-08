Metropark Board

A wall-mounted 1920x440 display with two modes:

Commute dashboard — weekday mornings (6:50–9:30 AM): next NJ Transit trains from Metropark to New York Penn, with a "leave in X min" countdown, track number, delay status, and live service alerts.
Photo frame — the rest of the time: a crossfading slideshow of curated photos.

Runs on a Raspberry Pi Zero 2 W behind a stretched-bar LCD. Photos arrive via a synced folder or by texting a private Telegram bot.

Quick start
bash
npm install
npm run dev

Open http://localhost:5173

URL	What it shows
http://localhost:5173	Whichever mode the schedule calls for
http://localhost:5173/?mode=dashboard	Force the departure board
http://localhost:5173/?mode=photos	Force the photo frame

For an accurate preview, open devtools → device toolbar → add a custom device at exactly 1920 × 440.

Without NJ Transit credentials the app runs on realistic mock data, so the whole UI can be built and styled offline.

Commands

Run all of these from the project root.

Command	Purpose
npm run dev	Express (3001) + Vite (5173) together, with hot reload
npm run dev -w server	Express only
npm run dev -w client	Vite only
npm run build	Compile the client into client/dist
npm start	Production: one Express process serving API + built app on 3001

Production requires build-then-start in that order — server.js checks for client/dist once at boot. Port 3001 will keep serving a stale bundle until you rebuild.

Ctrl+C before restarting, or you'll hit EADDRINUSE: address already in use :::3001. To clear a stuck process on Windows:

powershell
Get-Process -Id (Get-NetTCPConnection -LocalPort 3001).OwningProcess | Stop-Process
NJ Transit RailData API

Register at https://developer.njtransit.com and request access to RailData (not GTFS-RAIL — that returns protocol buffers for the whole system and would need decoding and filtering).

Verified details

The portal's HTML docs page lists the host as raildata.njt.gov, which does not resolve. The reference PDF has the real hosts:

Environment	Base URL
Test	https://testraildata.njtransit.com/api/TrainData
Production	https://raildata.njtransit.com/api/TrainData

Your username is the API userid from the approval email (e.g. TIMMAHONEY2000), not your email address. Sending the email address returns {"errorMessage":"Missing user account."}; a wrong password returns {"Authenticated":"False","UserToken":""}.

Rate limits
getToken: 10 calls per day. Tokens last 24 hours. The adapter caches the token to server/.njt-token.json and reuses it for 23 hours. Don't delete that file casually, and don't restart-loop while debugging live mode.
40,000 calls/day for train data — the 45-second polling during the morning window is nowhere near it.
Endpoint used

getTrainSchedule19Rec — the next 19 departures for a station, the same data as DepartureVision.

Field mapping notes

Handled in server/services/njTransit.js:

Dates arrive as 30-May-2024 11:52:00 AM with no timezone offset. Parsed explicitly rather than trusting new Date(). They are Eastern local times, so the host machine's timezone must be America/New_York.
Amtrak and SEPTA trains stop at Metropark. Train IDs prefixed A (Amtrak), S (SEPTA), or X (non-revenue) aren't rideable on an NJT ticket, so only all-digit IDs are kept.
Metropark has a track translation. Appendix II: railroad track 2 is the public track 1 passengers actually use. Showing the raw value would send her to the wrong platform.
SEC_LATE is delay in seconds, as a string.
Destinations appear as New York and New York -SEC.
STATIONMSGS becomes the alert ticker.
arrivesNYP is always null — getTrainSchedule19Rec carries no stop list. Arrival times would need getTrainStopList per train, which isn't worth the extra calls.

Support contact from the PDF: ProductionPasscomm@njtransit.com

Configuration

Copy server/.env.example to server/.env. Everything is optional; with nothing set the app runs on mock data.

bash
# NJ Transit
NJT_USERNAME=YOUR_API_USERID
NJT_PASSWORD=your_password
NJT_BASE_URL=https://raildata.njtransit.com/api/TrainData
NJT_STATION_CODE=MP

# Schedule
DASHBOARD_START=06:50
DASHBOARD_END=09:30
WEEKDAYS_ONLY=true
WALK_MINUTES=12
POLL_SECONDS=45
PHOTO_SECONDS=20

# Photos
PHOTOS_DIR=/home/pi/frame-photos
PHOTO_ROTATION_CAP=200

# Telegram (optional)
TELEGRAM_BOT_TOKEN=
TELEGRAM_ALLOWED_CHATS=

.env is read once at startup — changes require a full restart, not just a file save.

Formatting rules: no spaces around =, no quotes unless the value contains spaces, one KEY=value per line. Variable names are case-sensitive.

.env and .njt-token.json are gitignored. Verify with:

bash
git check-ignore server/.env
Photos

The server watches one folder and serves whatever is in it, newest first. A photo newer than anything previously seen interrupts the slideshow and displays immediately.

Accepted extensions: .jpg .jpeg .png .webp .gif. HEIC is not supported — iPhone's default format needs converting to JPG.

Portrait photos are grouped three-up as a filmstrip so they aren't slivers on a 1920x440 bar; landscape photos display full-bleed, center-cropped.

Telegram bot

Text a photo from anywhere and it appears on the frame within a minute.

Message @BotFather in Telegram → /newbot → copy the token
Set TELEGRAM_BOT_TOKEN in server/.env
Restart; look for [telegram] bot polling for photos
Message the bot, find your chat id in the server log, add it to TELEGRAM_ALLOWED_CHATS

The allowlist matters — Telegram bots are publicly messageable by anyone who finds the name.

If the token is set but node-telegram-bot-api isn't installed, the server logs a warning and runs without it:

bash
npm i node-telegram-bot-api -w server
Google Drive sync

Google Photos API access was restricted in March 2025 — third-party apps can only see content they uploaded themselves, which broke this class of project. Use Drive instead; folder access still works normally.

On the Pi:

bash
sudo apt install rclone
rclone config          # create remote "gdrive"
crontab -e             # add:
*/15 * * * * rclone sync gdrive:Frame /home/pi/frame-photos --max-depth 1 -q

Recommended on a Zero 2 W — resize after sync so Chromium never decodes 12MP originals with 512MB of RAM:

bash
sudo apt install imagemagick
# append to the same cron entry:
&& mogrify -resize '1920x1920>' -quality 85 /home/pi/frame-photos/*.jpg
Raspberry Pi deployment
1. OS and timezone

Flash Raspberry Pi OS (64-bit, with desktop); set hostname, Wi-Fi, SSH, and user in Raspberry Pi Imager before flashing.

bash
sudo timedatectl set-timezone America/New_York

Do this first. NJT sends local times with no offset, and a fresh Pi defaults to UTC — every departure would read four hours off.

2. Dependencies and code
bash
sudo apt update && sudo apt full-upgrade -y
sudo apt install -y chromium-browser git
curl -fsSL https://deb.nodesource.com/setup_22.x | sudo -E bash - && sudo apt install -y nodejs

git clone <your-repo> /home/pi/metropark-commute
cd /home/pi/metropark-commute
npm install && npm run build

Recreate server/.env by hand — it isn't in git.

3. Run as a service

/etc/systemd/system/board-server.service:

ini
[Unit]
Description=Metropark board server
After=network-online.target
Wants=network-online.target

[Service]
User=pi
WorkingDirectory=/home/pi/metropark-commute
ExecStart=/usr/bin/node server/server.js
Restart=always
RestartSec=5

[Install]
WantedBy=multi-user.target
bash
sudo systemctl enable --now board-server
4. Kiosk browser

/home/pi/.config/autostart/kiosk.desktop:

ini
[Desktop Entry]
Type=Application
Name=Kiosk
Exec=chromium-browser --kiosk --incognito --noerrdialogs --disable-session-crashed-bubble --hide-scrollbars --check-for-update-interval=31536000 http://localhost:3001

--incognito also suppresses the "restore pages?" dialog after a power cut.

5. Bedroom housekeeping
bash
# stop the green activity LED blinking at night — /boot/firmware/config.txt:
dtparam=act_led_trigger=none
dtparam=act_led_activelow=on

# disable screen blanking: raspi-config → Display Options → Screen Blanking → No

# nightly reboot for freshness:
0 4 * * * sudo /sbin/reboot

# swap safety net for 512MB of RAM:
sudo dphys-swapfile swapoff
sudo sed -i 's/CONF_SWAPSIZE=.*/CONF_SWAPSIZE=512/' /etc/dphys-swapfile
sudo dphys-swapfile setup && sudo dphys-swapfile swapon
6. The 1920x440 display

Connect via mini-HDMI. If the panel comes up stretched or squished instead of native, add a custom mode to /boot/firmware/cmdline.txt (one line, append with a space):

video=HDMI-A-1:1920x440M@60

If it needs exact timings, check the seller's listing or buyer Q&A for a modeline. Verify with kmsprint or wlr-randr. Budget an evening for this — it's the fiddliest step in the build.

Before mounting, remove the development-only override in client/src/styles.css:

css
html, body, #root {
  cursor: none;   /* uncomment for the wall display */
}
7. Power schedule

The Pi runs 24/7 (silent, fanless, ~0.5W). The display goes through a smart plug, scheduled on at 6:50 AM and off at bedtime, weekdays and holidays handled in the plug's app.

Why not power everything down: the Pi can't wake itself from a cold state, so a hard cut at both ends risks SD card corruption for about $1/year in savings. Leaving it running also means the dashboard is already loaded the instant the screen gets power.

Noise notes for a bedroom: use the official Pi PSU (cheap supplies cause coil whine), pick a smart plug whose status LED can be disabled, and run the panel at full brightness if its backlight whines when dimmed.

Project layout
metropark-commute/
├── client/                      # React + Vite, fixed 1920x440
│   ├── index.html
│   ├── vite.config.js           # dev proxy: /api and /photos → :3001
│   └── src/
│       ├── main.jsx
│       ├── App.jsx              # mode switching, clock, polling
│       ├── styles.css           # amber departure-board design tokens
│       └── components/
│           ├── Dashboard.jsx
│           └── PhotoFrame.jsx
└── server/
    ├── server.js                # Express: API, static photos, built client
    ├── routes/
    │   ├── trains.js            # response contract + mock generator
    │   └── photos.js            # newest-first photo listing
    └── services/
        ├── njTransit.js         # RailData adapter
        └── telegramBot.js       # optional photo intake
How it fits together

routes/trains.js defines a response contract that both the mock generator and the live adapter satisfy. That's why the entire UI could be built before API credentials existed, and why swapping data sources touches one file.

The live path degrades rather than failing: if NJT errors, the route serves mock data with a stale: true flag and a visible warning in the alert ticker, so the display never goes blank.

App.jsx polls /api/trains only while the dashboard is showing. When the clock crosses into photo mode the effect's cleanup clears the interval, so the API sees no traffic outside the morning window.

In development Vite proxies /api and /photos to Express so the frontend can use relative paths; in production Express serves everything from one port. Same code either way.

Debugging notes

Things that cost real time on this build, recorded so they don't again:

A silent empty result is usually a swallowed error. routes/photos.js catches read errors and returns [], so a typo produced an empty slideshow with nothing in the browser console. The message was in the server terminal the whole time. When something looks empty rather than broken, check the terminal and instrument the boundary between data arriving and data being used.
data?.departure vs data?.departures. Optional chaining plus || [] turns a misspelled key into a clean empty array — no error, and a page that reads as a legitimate "no trains right now." On a device someone relies on, silent-wrong is the failure mode to fear.
Port 3001 serves a compiled bundle. Edits to client source don't appear there until npm run build. Debug on 5173.
A 304 means the browser reused a cached response. Tick "Disable cache" in the Network tab while developing.
.env changes need a restart. node --watch reloads code, not environment.
On Windows, NODE_ENV=production cmd is bash syntax and fails in PowerShell. Use cross-env, or omit it.
