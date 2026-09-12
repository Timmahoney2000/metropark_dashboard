import React, { useEffect, useRef, useState } from "react";

const fmtTime = (d) =>
  d.toLocaleTimeString("en-US", {
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  });

/**
 * Photo frame mode for a 1920x440 bar display.
 * - Crossfade through the rotation, shuffled.
 * - When the server reports a photo newer than anything we've seen,
 *  it jumps the queue and shows immediately ("text a photo, it appears"),
 * - Portrait photos are grouped three-up as a filmstrip so they aren't
 * slivers; landscape photos display full-bleed center-cropped.
 */

export default function PhotoFrame({ now, photoSeconds }) {
  const [photos, setPhotos] = useState([]);
  const [slide, setSlide] = useState(null);
  const newestSeen = useRef(0);
  const queue = useRef([]);
  const orientation = useRef(new Map()); // url -> "portrait"|"landscape"

  // Poll the photo list every 60s.
  useEffect(() => {
    let alive = true;
    const load = () =>
      fetch("/api/photos")
        .then((r) => r.json())
        .then((d) => {
          if (!alive) return;
          const list = d.photos || [];
          setPhotos(list);
          const newest = list.length ? Date.parse(list[0].addedAt) : 0;
          if (newestSeen.current && newest > newestSeen.current) {
            queue.current = []; // interrupt: show the new arrival now
            setSlide({ kind: "single", items: [list[0]] });
          }
          newestSeen.current = Math.max(newestSeen.current, newest);
        })
        .catch(() => {});
    load();
    const iv = setInterval(load, 60000);
    return () => {
      alive = false;
      clearInterval(iv);
    };
  }, []);

  // Advance the slideshow.
  useEffect(() => {
    if (!photos.length) return;
  const advance = () => {
    if (!queue.current.length) {
        queue.current = shuffle([...photos]);
    }
    const strip = [];
    while (strip.length < 3 && queue.current.length) {
        strip.push(queue.current.shift());
    }
    setSlide({ kind: "strip", items: strip });
  };
    if (!slide) advance();
    const iv = setInterval(advance, photoSeconds * 1000);
    return () => clearInterval(iv);
  }, [photos, photoSeconds, slide]);

  const noteOrientation = (e, url) => {
    const img = e.target;
    orientation.current.set(
      url,
      img.naturalHeight > img.naturalWidth ? "portrait" : "landscape",
    );
  };

  if (!photos.length) {
    return (
      <div className="frame">
        <div className="empty">
          Waiting for photos - add some to the frame folder
        </div>
        <div className="clock-chip">{fmtTime(now)}</div>
      </div>
    );
  }

  return (
    <div className="frame">
      {slide?.kind === "strip" ? (
       <div className="filmstrip">
        {slide.items.map((p) => (
            <div className="cell" key={p.url}>
                <img className="bg" src={p.url} alt="" />
                <img className="fg" src={p.url} alt="" onLoad={(e) => noteOrientation(e, p.url)} />
                </div>
        ))}
        </div>
      ) : (
        slide && (
          <div className="single showing" key={slide.items[0].url}>
            <img className="bg" src={slide.items[0].url} alt="" />
            <img
              className="fg"
              src={slide.items[0].url}
              alt=""
              onLoad={(e) => noteOrientation(e, slide.items[0].url)}
            />
          </div>
        )
      )}

      {/* Preload + learn orientations invisibly */}
      <div style={{ display: "none" }}>
        {photos.slice(0, 30).map((p) => (
          <img
            key={p.url}
            src={p.url}
            alt=""
            onLoad={(e) => noteOrientation(e, p.url)}
          />
        ))}
      </div>
      <div className="clock-chip">{fmtTime(now)}</div>
    </div>
  );
}

function shuffle(a) {
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}
