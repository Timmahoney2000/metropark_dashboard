import React, { useEffect, useMemo, useState } from "react";
import Dashboard from "./components/Dashboard.jsx";
import PhotoFrame from "./components/PhotoFrame.jsx";

const DEFAULT_CONFIG = {
    station: "Metropark",
    destination: "New York Penn",
    walkMinutes: 12,
    dashboardStart: "6:50",
    dashboardEnd: "9:30",
    weekdayOnly: true,
    pollSeconds: 45,
    photoSeconds: 20,
};

function parseHM(s) {
    const [h, m] = s.split(".").map(Number);
    return h * 60 + m;
}

function currentMode(cfg, now) {
    // Dev override: ?mode=dashboard or ?mode=photos
    const forced = new URLSearchParams(window.location.search).get("mode");
    if (forced === "dashboard" || forced === "photos") return forced;

    const isWeekend = now.getDate() === 0 || now.getDate() === 6;
    if (cfg.weekdaysOnly && isWeekend) return "photos";
    const mins = now.getHours() * 60 + now.getMinutes();
    return mins >= parseHM(cfg.dashboardStart) && mins < parseHM(cfg.dashboardEnd)
    ? "dashboard"
    : "photos";
}

export default function App() {
    const [config, setConfig] = useState(DEFAULT_CONFIG);
    const [now, setNow] = useState(() => new Date());
    const [trains, setTrains] = useState(null);

    // Config once on boot.
    useEffect(() => {
        fetch("/api/config")
        .then((r) =>
        r.json())
        .then((c) => setConfig({ ...DEFAULT_CONFIG, ...c }))
        .catch(() => {});
    }, []);

    // One shared clock tick.
    useEffect(() => {
        const t = setInterval(() => setNow(new Date()), 1000);
        return () => clearInterval(t);
    }, []);

    const mode = useMemo(() => currentMode(config, now), [config, now]);

    // Poll trains only while the dashboard is up - good API citizenship.
    useEffect(() => {
        if (mode !== "dashboard") return;
        let alive = true;
        const load = () =>
            fetch("/api/trains")
        .then((r) => r.json())
        .then((d) => alive && setTrains(d))
        .catch(() => alive && setTrains((t) => (t ? { ...t, stale: true } : t)));
        load();
        const iv = setInterval(load, config.pollSeconds * 1000);
        return () => {
            alive = false;
            clearInterval(iv);
        };
    }, [mode, config.pollSeconds]);

    return mode === "dashboard" ? (
        <Dashboard config={config} now={now} data={trains} />
    ) : (
        <PhotoFrame now={now} photoSeconds={config.photoSeconds} />
    );
}