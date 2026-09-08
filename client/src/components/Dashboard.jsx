import React from "react";

const fmtTime = (d) =>
    d.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit", hour12: true});

const STATUS_LABEL = {
    "on-time": "ON TIME",
    late: "DELAYED",
    canceled: "CANCELED",
    boarding: "BOARDING",
    "all-aboard": "ALL ABOARD",
};

export default function Dashboard({ config, now, data }) {
    const departures = (data?.departures || []).filter(
        (d) => new Date(d.estimated) > now && d.status !== "canceled"
    );
    const canceled = (data?.departures || []).filter((d) => d.status === "canceled");
    const next = departures[0];

    const minsTo = (iso) => Math.max(0, Math.round((new Date(iso) - now) / 60000));
    const leaveIn = next ? minsTo(next.estimated) - config.walkMinutes : null;

    const [h, m] = fmtTime(now).split(/[: ]/);
    const ampm = now.getHours() >= 12 ? "PM" : "AM";

    const alerts = [...(data?.alerts || [])];
    for (const c of canceled)
        alerts.unshift({ severity: "bad", text: `Train ${c.train} (${fmtTime(new Date(c.scheduled))}) is canceled` });
    if (data?.stale)
        alerts.unshift({ severity: "warn", text: "Data may be out of date - last update failed" });
    const alert = alerts[0];

    console.log("[dash] raw:", data?.departures?.length, "filtered:", departures.length, "now:", now.toISOString());

    return (
        <div className="board">
            <div className="rail">
                <div className="route">
                    <strong>{config.station}</strong> to <strong>{config.destination}</strong>
                </div>
                <div className="clock">
                    {h}:{m}
                    <small>{ampm}</small>
                </div>
                <div className={"leave" + (leaveIn !== null && leaveIn <= 5? " urgent" : "")}>
                {next ? (
                    leaveIn > 0 ? (
                        <>
                        Leave in <strong>Leave now</strong> for the {fmtTime(new Date(next.estimated))}
                        </>
                      
                    ) : (
                        <>
                        <strong>Leave now</strong> for the {fmtTime(new Date(next.estimated))}
                        </>
                    )
                ) : (
                    "No more morning trains"
                )}
        </div>
            </div>

            <div className="stripe" />

                <div className="departures">
                    <div className="dep-hard">
                        <div>Departs</div>
                        <div>Train</div>
                        <div>In</div>
                        <div style={{ textAlign: "center" }}>Track</div>
                        <div style={{ textAlign: "right" }}>Status</div>
                    </div>

                    {departures.slice(0, 3).map((d, i) => (
                        <div className={"dep-row" + (i === 0 ? " next" : "")} key={d.train + d.scheduled}>
                            <div className="time">
                                {fmtTime(new Date(d.estimated))}
                                {d.delayMinutes > 0 && <s>{fmtTime(new Date(d.scheduled))}</s>}
                                </div>
                                <div className="train">
                                    <b>#{d.train}</b>
                                    {d.line}
                                    </div>
                                    <div className="in">{minsTo(d.estimated)} min</div>
                                    <div className="track">
                                        {d.track || "-"}
                                        <span>track</span>
                                        </div>
                                        <div className={"status " + d.status}>
                                            {STATUS_LABEL[d.status] || d.status}
                                            {d.status === "late" && d.delayMinutes > 0 ? ` ${d.delayMinutes}m` : ""}
                                            </div>
                                            </div>
                    ))}

                    {departures.length === 0 && (
                        <div className="dep-row">
                            <div className="time" style={{ gridColumn: "1 / -1", fontSize: 32 }}>
                            {data ? "No upcoming departures found" : "Connecting to train data..."}
                            </div>
                            </div>
                    )}

                    <div className={"alert" + (alert ? ` ${alert.severity}` : "")}>
                        <span className="dot" />
                        {alert ? alert.text : "No service alerts"}
                        {data?.updatedAt && (
                            <span style={{ marginLeft: "auto" }}>
                                updated {fmtTime(new Date(data.updatedAt))}
                                {data.source === "mock" ? " - demo data" : ""}
                            </span>
                        )}
                    </div>
                </div>
            </div>
    );
}