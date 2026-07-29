/**
 * Google Analytics 4 — paste your Measurement ID below.
 * Find it: analytics.google.com → Admin → Data streams → Web → Measurement ID (G-…)
 */
(() => {
  "use strict";

  const MEASUREMENT_ID = "G-08FY3BK8T3"; // ← replace with your real ID

  function noop() {}

  const stub = {
    ready: false,
    event: noop,
    gameStart: noop,
    gameOver: noop,
  };

  if (!MEASUREMENT_ID || MEASUREMENT_ID.includes("XXXX")) {
    console.warn(
      "[analytics] Set MEASUREMENT_ID in analytics.js to enable Google Analytics."
    );
    window.FloppyAnalytics = stub;
    return;
  }

  window.dataLayer = window.dataLayer || [];
  function gtag() {
    window.dataLayer.push(arguments);
  }
  window.gtag = gtag;

  gtag("js", new Date());
  gtag("config", MEASUREMENT_ID, {
    send_page_view: true,
    anonymize_ip: true,
  });

  const script = document.createElement("script");
  script.async = true;
  script.src = `https://www.googletagmanager.com/gtag/js?id=${MEASUREMENT_ID}`;
  document.head.appendChild(script);

  function event(name, params) {
    if (typeof window.gtag !== "function") return;
    window.gtag("event", name, params || {});
  }

  window.FloppyAnalytics = {
    ready: true,
    event,
    gameStart() {
      event("game_start");
    },
    gameOver(score) {
      event("game_over", {
        score: Number(score) || 0,
        engagement_time_msec: 1,
      });
    },
  };
})();
