/**
 * ============================================================
 *  FLOPPY DEGEN APE — HTML5 Canvas Flappy Bird clone
 *  Degenerate Ape Academy themed · Vanilla JS
 * ============================================================
 */

(() => {
  "use strict";

  // ----------------------------------------------------------
  // Constants
  // ----------------------------------------------------------
  const W = 400;
  const H = 600;

  const GRAVITY = 0.38;
  const JUMP_FORCE = -7.5;
  const MAX_VELOCITY = 10;

  // Kong body — sized to fit gaps comfortably (Flappy-style clearance)
  const APE_W = 48;
  const APE_H = 58;
  const KONG_REF_W = 56;
  const KONG_REF_H = 72;
  const HITBOX_PAD = 7;

  const PIPE_WIDTH = 65;
  const GAP_HEIGHT = 182;
  const PIPE_SPEED = 2.8;
  const SPAWN_INTERVAL = 100; // frames (~1.6s at 60fps)

  const STATES = Object.freeze({
    START: "START",
    PLAYING: "PLAYING",
    GAMEOVER: "GAMEOVER",
  });

  const STORAGE_KEY = "degenFlopHighScore";
  const SOUND_KEY = "floppyDegenApeSoundOn";
  const SBF_ACTIVATE_SCORE = 3;
  const RETRY_DELAY_MS = 750; // prevent space/tap from instantly skipping game over
  const MAX_PARTICLES = 120;
  const FIXED_DT = 1000 / 60;
  const IS_MOBILE =
    window.matchMedia("(max-width: 700px)").matches ||
    /iPhone|iPad|iPod|Android/i.test(navigator.userAgent);

  // ----------------------------------------------------------
  // Audio — Web Audio monkey flap + crash (muteable)
  // ----------------------------------------------------------
  let audioCtx = null;
  let soundOn = localStorage.getItem(SOUND_KEY) !== "0";

  function ensureAudio() {
    if (!audioCtx) {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return null;
      audioCtx = new AC();
    }
    if (audioCtx.state === "suspended") audioCtx.resume();
    return audioCtx;
  }

  function tone(freq, dur, type, gain, slideTo) {
    const ctx = ensureAudio();
    if (!ctx || !soundOn) return;
    const t0 = ctx.currentTime;
    const osc = ctx.createOscillator();
    const g = ctx.createGain();
    osc.type = type || "square";
    osc.frequency.setValueAtTime(freq, t0);
    if (slideTo != null) {
      osc.frequency.exponentialRampToValueAtTime(Math.max(20, slideTo), t0 + dur);
    }
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.exponentialRampToValueAtTime(gain, t0 + 0.015);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    osc.connect(g);
    g.connect(ctx.destination);
    osc.start(t0);
    osc.stop(t0 + dur + 0.02);
  }

  function noiseBurst(dur, gain, highpass) {
    const ctx = ensureAudio();
    if (!ctx || !soundOn) return;
    const t0 = ctx.currentTime;
    const len = Math.floor(ctx.sampleRate * dur);
    const buffer = ctx.createBuffer(1, len, ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < len; i++) {
      data[i] = (Math.random() * 2 - 1) * (1 - i / len);
    }
    const src = ctx.createBufferSource();
    src.buffer = buffer;
    const filter = ctx.createBiquadFilter();
    filter.type = "bandpass";
    filter.frequency.value = highpass || 800;
    filter.Q.value = 0.8;
    const g = ctx.createGain();
    g.gain.setValueAtTime(gain, t0);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    src.connect(filter);
    filter.connect(g);
    g.connect(ctx.destination);
    src.start(t0);
  }

  /** Monkey “uhh” grunt on flap */
  function playJumpSound() {
    const ctx = ensureAudio();
    if (!ctx || !soundOn) return;

    const t0 = ctx.currentTime;
    const f0 = 125 + Math.random() * 30;

    const osc = ctx.createOscillator();
    const osc2 = ctx.createOscillator();
    const filter = ctx.createBiquadFilter();
    const g = ctx.createGain();

    osc.type = "sawtooth";
    osc2.type = "triangle";
    // “uhh” — starts mid-low, drops a little like a grunt
    osc.frequency.setValueAtTime(f0, t0);
    osc.frequency.exponentialRampToValueAtTime(f0 * 0.78, t0 + 0.2);
    osc2.frequency.setValueAtTime(f0 * 1.85, t0);
    osc2.frequency.exponentialRampToValueAtTime(f0 * 1.35, t0 + 0.2);

    filter.type = "bandpass";
    filter.frequency.setValueAtTime(480, t0);
    filter.frequency.linearRampToValueAtTime(320, t0 + 0.2);
    filter.Q.value = 4.2;

    g.gain.setValueAtTime(0.0001, t0);
    g.gain.exponentialRampToValueAtTime(0.2, t0 + 0.025);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.24);

    osc.connect(filter);
    osc2.connect(filter);
    filter.connect(g);
    g.connect(ctx.destination);

    osc.start(t0);
    osc2.start(t0);
    osc.stop(t0 + 0.28);
    osc2.stop(t0 + 0.28);

    // Soft breath so it feels vocal, not a beep
    noiseBurst(0.14, 0.045, 420);
  }

  /** Bonk / crash when rekt */
  function playCrashSound() {
    if (!soundOn) return;
    ensureAudio();
    noiseBurst(0.28, 0.22, 350);
    tone(180, 0.22, "sawtooth", 0.12, 55);
    setTimeout(() => tone(90, 0.35, "triangle", 0.1, 40), 60);
  }

  function setSoundEnabled(on) {
    soundOn = Boolean(on);
    localStorage.setItem(SOUND_KEY, soundOn ? "1" : "0");
    syncSoundButton();
    if (soundOn) {
      ensureAudio();
      playJumpSound();
    }
  }

  function syncSoundButton() {
    const btn = document.getElementById("sound-toggle");
    if (!btn) return;
    btn.setAttribute("aria-pressed", soundOn ? "true" : "false");
    btn.classList.toggle("is-muted", !soundOn);
    btn.textContent = soundOn ? "SOUND ON" : "SOUND OFF";
  }

  function bindSoundButton() {
    const btn = document.getElementById("sound-toggle");
    if (!btn) return;
    syncSoundButton();
    btn.addEventListener("click", (e) => {
      e.preventDefault();
      setSoundEnabled(!soundOn);
    });
  }

  // ----------------------------------------------------------
  // Degen Ape Academy / Dingus Forest humor
  // Tone stolen from the official FAQ: smooth-brained, self-roast,
  // "we're apes not nerds", DAOO, Trash Pandas, crayons, tendies.
  // ----------------------------------------------------------
  const START_JOKES = [
    "10,000 SMOOTHEST BRAINS",
    "WERE APES NOT NERDS",
    "JPEGS ON STEROIDS",
    "(ACTUALLY PNGS)",
    "WELCOME TO DINGUS FOREST",
    "HOME OF THE DEGEN DAOO",
    "EAT CRAYONS HODL BANANAS",
    "SER THIS IS A CASINO",
    "FRANK IS TYPING...",
    "HISTORY CLASS IS IN SESSION",
  ];

  const SCORE_JOKES = [
    "WAGMI SER",
    "FLOOR GOING UP",
    "TENDIES SECURED",
    "SMOOTH BRAIN WIN",
    "BANANA BASED",
    "DAOO APPROVES",
    "MYTHIC LUCK",
    "NGMI? NAH WAGMI",
    "DIRTY FIAT WHO?",
    "HATCHENING ENERGY",
    "TRASH PANDAS CLAP",
    "SOME APES > EQUAL",
    "NOT FINANCIAL ADVICE",
    "LIQUIDITY? CUTE",
    "ACADEMY DROPOUT",
    "CRAYON FUEL",
    "SOLANA SPEEDRUN",
    "DINGUS CLEARED",
    "FRANK IS TYPING...",
    "PHBT THIS CANDLE",
    "BRIDGED? WE STAYED",
    "Y00TS WHO?",
    "SHOEY NOT BANANA",
    "33.3% COPE",
    "DEGODS TO ZERO",
    "HOMEROOM POINTS++",
    "GOLD STAR ENERGY",
  ];

  const REKT_TITLES = [
    "REKT!",
    "NGMI",
    "LIQUIDATED",
    "SMOOTH BRAINED",
    "SENT TO DINGUS",
    "EXIT LIQUIDITY",
    "RUGGED",
    "COPE!",
    "EXILED!",
  ];

  const REKT_JOKES = [
    "YOUR MOM HAS FAVORITES",
    "TOUCH GRASS? WHATS THAT",
    "WE DONT FUCKING KNOW",
    "DUNNO LOL NOBODY ASKED",
    "PAPER HANDS DETECTED",
    "SHOULDVE ATE THE CRAYON",
    "BANANA SLIPPED",
    "CANDLE ATE YOU SER",
    "DEGENIVERSAL FAIL",
    "ASK THE DAOO FOR BAIL",
    "FRANK DELAYED THE MINT",
    "HIT THE GYM FRANK",
    "NOT ON THE RUN FR",
    "FRANK LEFT SOL LMAO",
    "DUST IN THE WIND",
    "GO WRITE AN ESSAY",
  ];

  const SBF_LINES = [
    "SBF ENTERED THE CHAT",
    "EFFECTIVE ALTRUISM??",
    "HE WANTS YOUR SOL",
    "FTX CUSTOMER SUPPORT",
    "SORRY ABOUT THE FUNDS",
  ];

  const TICKER_BITS = [
    "SOL", "DEGEN", "DAOO", "DINGUS", "TENDIES", "CRAYONS",
    "BANANA", "WAGMI", "NGMI", "FLOOR", "MYTHIC", "SMOOTH",
    "FRANK", "TYPING", "HOMEROOM", "OPALS", "HIGHER SELF",
  ];

  function pick(arr) {
    return arr[(Math.random() * arr.length) | 0];
  }

  // Palette — Degen Ape / Dingus Forest
  const COLORS = {
    maroon: "#8A1E2D",
    maroonDark: "#5c101c",
    maroonLite: "#a5283a",
    face: "#A6E1FA",
    faceShade: "#6bb8d4",
    banana: "#FFDF00",
    bananaPeel: "#c9a800",
    hatWhite: "#FFFFFF",
    hatBlack: "#1E1E1E",
    bull: "#22c55e",
    bullDark: "#15803d",
    bear: "#ef4444",
    bearDark: "#991b1b",
    wick: "#e5e7eb",
    // Forest sky / canopy
    skyTop: "#87b8e8",
    skyMid: "#6a9e5a",
    skyBot: "#3d6b2f",
    canopy: "#2f5a22",
    canopyDark: "#1e3d16",
    trunk: "#5c3d24",
    trunkDark: "#3d2918",
    ground: "#4a3220",
    moss: "#3d6b2f",
    leaf: "#4a8f35",
    leafLite: "#6bb84a",
    neon: "#fbe271",      // History Class gold
    magenta: "#bb89ff",   // History Class lavender
    white: "#ffffff",
    dim: "rgba(245,240,230,0.75)",
    cream: "#f5f0e6",
    lavender: "#bb89ff",
    gold: "#fbe271",
  };

  // ----------------------------------------------------------
  // Canvas setup
  // ----------------------------------------------------------
  const canvas = document.getElementById("game");
  const ctx = canvas.getContext("2d");

  // Crisp pixel art — never blur sprites
  ctx.imageSmoothingEnabled = false;

  // ----------------------------------------------------------
  // Pixel-art Degen Ape head — compact profile, fully solid (no holes)
  const HEAD_COLS = 24;
  const HEAD_SCALE = 1.5;
  const HEAD_PIXELS = [
    ".......KKWWWWWWKK.......",
    "......KWWWWWGWWWWK......",
    "....KWWWWWWWWWWWWWK...",
    "....KKKKKKKKKKKKKKKK....",
    "....MMMMMMMMMMMMMMMM....",
    "...MMMMMMMMMMMMMMMMMM...",
    "...MMMFFFFFFFFFFFFMMM...",
    "...MMMFFFFFFFFFFFFMMM...",
    "...MMMFEEEEFFFFFFFMMM...",
    "...MMMFFFFFFFFFFFFMMM...",
    "...MMMFFFFFFFFFFFFMMM...",
    "...MMFFFFFFFFFFFFFFMMM..",
    "...MMFFFFFFFFFFFFFFMMM..",
    "..MMMFFFFFFFFFFFFFBMMM..",
    "...MDDFFFFFFFFFFBBBMDD..",
    "....DDMMMMMMMMMMMMMDD...",
    ".....DDMMMMMMMMMMDD.....",
  ];

  const HEAD_PALETTE = {
    M: COLORS.maroon,
    D: COLORS.maroonDark,
    L: COLORS.maroonLite,
    F: COLORS.face,
    S: COLORS.faceShade,
    B: COLORS.banana,
    P: COLORS.bananaPeel,
    W: COLORS.hatWhite,
    K: COLORS.hatBlack,
    G: "#4a4a4a",
    E: COLORS.hatBlack,
  };

  function headGapFillColor(y) {
    if (y <= 3) return COLORS.hatWhite;
    if (y <= 5) return COLORS.maroon;
    if (y >= 14) return COLORS.maroonDark;
    return COLORS.face;
  }

  /** Draw pixel Degen Ape head — hy = shoulder/neck anchor (bottom of head) */
  function drawHead(c, hx, hy) {
    const rows = HEAD_PIXELS.length;
    const ox = Math.round(hx - (HEAD_COLS * HEAD_SCALE) / 2);
    const oy = Math.round(hy - rows * HEAD_SCALE);

    c.imageSmoothingEnabled = false;

    // Pass 1 — solid backing inside each row (kills transparent gaps in the silhouette)
    for (let y = 0; y < rows; y++) {
      const row = HEAD_PIXELS[y].padEnd(HEAD_COLS, ".").slice(0, HEAD_COLS);
      let left = -1;
      let right = -1;
      for (let x = 0; x < HEAD_COLS; x++) {
        if (row[x] !== ".") {
          if (left < 0) left = x;
          right = x;
        }
      }
      if (left < 0) continue;
      c.fillStyle = headGapFillColor(y);
      c.fillRect(
        ox + left * HEAD_SCALE,
        oy + y * HEAD_SCALE,
        (right - left + 1) * HEAD_SCALE,
        HEAD_SCALE
      );
    }

    // Pass 2 — pixel detail on top
    for (let y = 0; y < rows; y++) {
      const row = HEAD_PIXELS[y].padEnd(HEAD_COLS, ".").slice(0, HEAD_COLS);
      for (let x = 0; x < HEAD_COLS; x++) {
        const ch = row[x];
        if (ch === ".") continue;
        const color = HEAD_PALETTE[ch];
        if (!color) continue;
        c.fillStyle = color;
        c.fillRect(ox + x * HEAD_SCALE, oy + y * HEAD_SCALE, HEAD_SCALE, HEAD_SCALE);
      }
    }

    // Left ear (solid)
    c.fillStyle = COLORS.maroonDark;
    c.fillRect(ox + 1 * HEAD_SCALE, oy + 7 * HEAD_SCALE, HEAD_SCALE, HEAD_SCALE * 2);
    c.fillStyle = COLORS.faceShade;
    c.fillRect(ox + 2 * HEAD_SCALE, oy + 7 * HEAD_SCALE, HEAD_SCALE, HEAD_SCALE);
  }

  // ----------------------------------------------------------
  // Game state
  // ----------------------------------------------------------
  let state = STATES.START;
  let frame = 0;
  let score = 0;
  let highScore = Number(localStorage.getItem(STORAGE_KEY) || 0);

  // Screen shake
  let shakeMagnitude = 0;
  let shakeDuration = 0;

  // Flavor / death context
  let deathCause = "candle"; // 'candle' | 'bounds'
  let rektTitle = "REKT!";
  let rektJoke = "";
  let startJoke = pick(START_JOKES);
  let startJokeTimer = 0;
  let gameOverAt = 0;

  // Floating toast quips
  /** @type {{text:string, life:number, max:number, y:number, color:string} | null} */
  let toast = null;

  function showToast(text, color, life) {
    toast = {
      text,
      life: life || 90,
      max: life || 90,
      y: 100,
      color: color || COLORS.banana,
    };
  }

  function updateToast() {
    if (!toast) return;
    toast.life--;
    toast.y -= 0.25;
    if (toast.life <= 0) toast = null;
  }

  function drawToast() {
    if (!toast) return;
    const alpha = Math.min(1, toast.life / 20);
    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.font = '9px "Press Start 2P", monospace';
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    const tw = ctx.measureText(toast.text).width;
    const pad = 10;
    ctx.fillStyle = "rgba(0,0,0,0.55)";
    ctx.fillRect(W / 2 - tw / 2 - pad, toast.y - 12, tw + pad * 2, 24);
    ctx.fillStyle = toast.color;
    ctx.fillText(toast.text, W / 2, toast.y);
    ctx.restore();
  }

  // ----------------------------------------------------------
  // SBF — flavor only after score 3. Lunges, jokes, zero damage.
  // ----------------------------------------------------------
  const SBF_FOLLOW_X = 8;
  const SBF_LUNGE_COOLDOWN = 160;
  const SBF_TELEGRAPH = 50;
  const SBF_LUNGE_SPEED = 7;

  const sbf = {
    active: false,
    x: -80,
    y: H * 0.4,
    size: 40,
    bob: 0,
    speechTimer: 0,
    speech: "",
    mode: "follow", // follow | telegraph | lunge | retreat
    timer: 0,
    lockY: 0,
    trackY: 0,
    whiffed: false,
  };

  function resetSbf() {
    sbf.active = false;
    sbf.x = -80;
    sbf.y = H * 0.4;
    sbf.bob = 0;
    sbf.speechTimer = 0;
    sbf.speech = "";
    sbf.mode = "follow";
    sbf.timer = 0;
    sbf.lockY = 0;
    sbf.trackY = 0;
    sbf.whiffed = false;
  }

  function activateSbf() {
    if (sbf.active) return;
    sbf.active = true;
    sbf.x = SBF_FOLLOW_X;
    sbf.y = ape.y;
    sbf.trackY = ape.y + ape.h * 0.12;
    sbf.mode = "follow";
    sbf.timer = 110;
    sbf.whiffed = false;
    sbf.speech = pick(SBF_LINES);
    sbf.speechTimer = 120;
    showToast(sbf.speech, "#ffb347", 110);
  }

  function updateSbf() {
    if (!sbf.active) return;

    sbf.bob += 0.12;
    if (sbf.speechTimer > 0) sbf.speechTimer--;
    sbf.timer--;

    if (sbf.mode === "follow") {
      sbf.x += (SBF_FOLLOW_X - sbf.x) * 0.12;
      sbf.y += (ape.y + ape.h * 0.1 - sbf.y) * 0.06;
      sbf.trackY += (ape.y + ape.h * 0.12 - sbf.trackY) * 0.08;

      if (sbf.timer <= 0) {
        sbf.mode = "telegraph";
        sbf.timer = SBF_TELEGRAPH;
        sbf.speech = pick(["GOTCHA", "SORRY SER", "FREEZE", "MARGIN CALL"]);
        sbf.speechTimer = SBF_TELEGRAPH;
        showToast("SBF LUNGING — YOU'RE FINE", "#ffb347", 50);
      }
    } else if (sbf.mode === "telegraph") {
      sbf.x = SBF_FOLLOW_X + Math.sin(frame * 1.2) * 3;
      sbf.trackY += (ape.y + ape.h * 0.12 - sbf.trackY) * 0.14;
      sbf.y += (sbf.trackY - sbf.y) * 0.2;

      if (sbf.timer <= 0) {
        sbf.mode = "lunge";
        sbf.lockY = sbf.trackY;
        sbf.whiffed = false;
      }
    } else if (sbf.mode === "lunge") {
      sbf.x += SBF_LUNGE_SPEED;
      sbf.y += (sbf.lockY - sbf.y) * 0.15;

      // Cosmetic only — overlap triggers a joke, never death
      if (!sbf.whiffed && aabb(apeHitbox(), sbfHitbox())) {
        showToast(pick(["FUNDS STILL SAFU", "MISSED ANYWAY", "NGMI? NAH"]), "#ffb347", 55);
        sbf.whiffed = true;
      }

      if (sbf.x > ape.x + ape.w + 12) {
        sbf.mode = "retreat";
        sbf.timer = 0;
        if (!sbf.whiffed) {
          showToast("SBF WHIFFED LOL", "#ffb347", 70);
          sbf.whiffed = true;
        }
      }
    } else if (sbf.mode === "retreat") {
      sbf.x -= 6;
      if (sbf.x <= SBF_FOLLOW_X) {
        sbf.x = SBF_FOLLOW_X;
        sbf.mode = "follow";
        sbf.timer = SBF_LUNGE_COOLDOWN;
      }
    }
  }

  function knockbackSbf() {
    if (!sbf.active) return;
    if (sbf.mode === "follow" && Math.random() < 0.4) {
      sbf.speech = pick(SBF_LINES);
      sbf.speechTimer = 70;
    }
  }

  function sbfHitbox() {
    const pad = 10;
    return {
      x: sbf.x + pad,
      y: sbf.y + pad,
      w: sbf.size - pad * 2,
      h: sbf.size - pad * 2,
    };
  }

  /** Procedural Sam Bankman-Fried caricature (messy curls + vacant grin) */
  function drawSbfFace(c, x, y, size) {
    const s = size;
    c.save();
    c.translate(x + s / 2, y + s / 2 + Math.sin(sbf.bob) * 3);

    // Shadow
    c.fillStyle = "rgba(0,0,0,0.3)";
    c.beginPath();
    c.ellipse(0, s * 0.42, s * 0.35, 5, 0, 0, Math.PI * 2);
    c.fill();

    // Curly / messy brunette hair
    c.fillStyle = "#2a1810";
    for (const [ox, oy, r] of [
      [-10, -12, 10], [0, -16, 11], [10, -12, 10],
      [-14, -4, 8], [14, -4, 8], [-6, -18, 7], [6, -18, 7],
    ]) {
      c.beginPath();
      c.arc(ox, oy, r, 0, Math.PI * 2);
      c.fill();
    }
    // Hair highlight (still brunette, just lighter brown)
    c.fillStyle = "#4a3020";
    c.beginPath();
    c.arc(-4, -14, 5, 0, Math.PI * 2);
    c.arc(5, -12, 4, 0, Math.PI * 2);
    c.fill();

    // Head
    c.fillStyle = "#f0c8a0";
    c.beginPath();
    c.ellipse(0, 2, 15, 16, 0, 0, Math.PI * 2);
    c.fill();

    // Ears
    c.beginPath();
    c.ellipse(-15, 2, 4, 6, 0, 0, Math.PI * 2);
    c.ellipse(15, 2, 4, 6, 0, 0, Math.PI * 2);
    c.fill();

    // Eyes (slightly vacant)
    c.fillStyle = "#fff";
    c.beginPath();
    c.ellipse(-5, 0, 4, 5, 0, 0, Math.PI * 2);
    c.ellipse(5, 0, 4, 5, 0, 0, Math.PI * 2);
    c.fill();
    c.fillStyle = "#2a1a10";
    c.beginPath();
    c.arc(-4, 1, 2, 0, Math.PI * 2);
    c.arc(6, 1, 2, 0, Math.PI * 2);
    c.fill();

    // Awkward smile
    c.strokeStyle = "#8a4a3a";
    c.lineWidth = 1.5;
    c.beginPath();
    c.arc(0, 8, 6, 0.15, Math.PI - 0.15);
    c.stroke();

    // Tiny "FTX" shirt collar hint below head
    c.fillStyle = "#1a1a2e";
    fillRoundRect(c, -12, 16, 24, 10, 2);
    c.fillStyle = "#7c3aed";
    c.font = '5px "Press Start 2P", monospace';
    c.textAlign = "center";
    c.textBaseline = "middle";
    c.fillText("FTX", 0, 21);

    c.restore();
  }

  function drawSbf() {
    if (!sbf.active) return;

    // Show the locked lunge lane during telegraph
    if (sbf.mode === "telegraph") {
      ctx.save();
      ctx.globalAlpha = 0.35 + Math.sin(frame * 0.4) * 0.15;
      ctx.strokeStyle = "#7c3aed";
      ctx.lineWidth = 2;
      ctx.setLineDash([6, 4]);
      ctx.beginPath();
      const laneY = sbf.trackY + sbf.size / 2;
      ctx.moveTo(sbf.x + sbf.size, laneY);
      ctx.lineTo(ape.x, laneY);
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.restore();
    }

    drawSbfFace(ctx, sbf.x, sbf.y, sbf.size);

    // Occasional speech bubble
    if (sbf.speechTimer > 0 && sbf.speech) {
      ctx.save();
      ctx.font = '7px "Press Start 2P", monospace';
      ctx.textAlign = "left";
      ctx.textBaseline = "middle";
      const label = sbf.speech.length > 18 ? sbf.speech.slice(0, 16) + ".." : sbf.speech;
      const tw = ctx.measureText(label).width;
      const bx = Math.max(4, sbf.x);
      const by = sbf.y - 14;
      ctx.fillStyle = "rgba(255,255,255,0.92)";
      ctx.fillRect(bx, by - 8, tw + 10, 16);
      ctx.strokeStyle = "#7c3aed";
      ctx.lineWidth = 1;
      ctx.strokeRect(bx, by - 8, tw + 10, 16);
      ctx.fillStyle = "#1a1a2e";
      ctx.fillText(label, bx + 5, by);
      ctx.restore();
    }
  }

  function onScore(newScore) {
    knockbackSbf();
    // Milestone / random Academy banter
    if (newScore === 1) showToast("FIRST BANANA", COLORS.banana);
    else if (newScore === SBF_ACTIVATE_SCORE) {
      activateSbf();
    } else if (newScore % 5 === 0) {
      showToast(pick(SCORE_JOKES), COLORS.neon);
    } else if (Math.random() < 0.45) {
      showToast(pick(SCORE_JOKES), COLORS.magenta);
    }
  }

  // ----------------------------------------------------------
  // Player (King Kong–style Degen Ape)
  // ----------------------------------------------------------
  const ape = {
    x: W * 0.28,
    y: H * 0.38,
    w: APE_W,
    h: APE_H,
    vy: 0,
    rotation: 0, // body pitch radians
    hoverPhase: 0,
    flapTimer: 0, // frames remaining of flap pose
    armPhase: 0, // continuous idle sway
  };

  function resetApe() {
    ape.x = W * 0.28;
    ape.y = H * 0.38;
    ape.vy = 0;
    ape.rotation = 0;
    ape.hoverPhase = 0;
    ape.flapTimer = 0;
    ape.armPhase = 0;
  }

  function flap() {
    ape.vy = JUMP_FORCE;
    ape.flapTimer = 14;
    spawnFlapParticles(ape.x + ape.w * 0.15, ape.y + ape.h * 0.55);
    playJumpSound();
  }

  function updateApeRotation() {
    // Pitch UP when rising, smooth pitch DOWN as falling velocity grows
    if (ape.vy < 0) {
      ape.rotation = (-18 * Math.PI) / 180;
    } else {
      const t = Math.min(ape.vy / MAX_VELOCITY, 1);
      ape.rotation = ((-18 + t * 88) * Math.PI) / 180; // -18 → +70
    }
  }

  function updateApe() {
    ape.vy = Math.min(ape.vy + GRAVITY, MAX_VELOCITY);
    ape.y += ape.vy;
    if (ape.flapTimer > 0) ape.flapTimer--;
    ape.armPhase += 0.18;
    updateApeRotation();
  }

  function updateApeHover() {
    ape.hoverPhase += 0.06;
    ape.armPhase += 0.08;
    ape.y = H * 0.38 + Math.sin(ape.hoverPhase) * 10;
    ape.rotation = Math.sin(ape.hoverPhase * 0.5) * 0.1;
  }

  function apeHitbox() {
    // Tight torso box — arms/head pixels don't punish you in the gap
    return {
      x: ape.x + HITBOX_PAD + 8,
      y: ape.y + HITBOX_PAD + 4,
      w: ape.w - HITBOX_PAD * 2 - 16,
      h: ape.h - HITBOX_PAD * 2 - 10,
    };
  }

  /** Rounded rect helper for chunky Kong limbs */
  function fillRoundRect(c, x, y, w, h, r) {
    const rr = Math.min(r, w / 2, h / 2);
    c.beginPath();
    c.moveTo(x + rr, y);
    c.arcTo(x + w, y, x + w, y + h, rr);
    c.arcTo(x + w, y + h, x, y + h, rr);
    c.arcTo(x, y + h, x, y, rr);
    c.arcTo(x, y, x + w, y, rr);
    c.closePath();
    c.fill();
  }

  /**
   * Draw one massive Kong arm (upper + forearm + fist).
   * angleRad: 0 = hanging down, negative = swing up/back.
   */
  function drawArm(c, ox, oy, angleRad, mirror) {
    c.save();
    c.translate(ox, oy);
    c.scale(mirror ? -1 : 1, 1);
    c.rotate(angleRad);

    // Shoulder mass
    c.fillStyle = COLORS.maroonDark;
    c.beginPath();
    c.arc(0, 0, 7, 0, Math.PI * 2);
    c.fill();

    // Upper arm
    c.fillStyle = COLORS.maroon;
    fillRoundRect(c, -6, 0, 12, 22, 5);
    c.fillStyle = COLORS.maroonLite;
    fillRoundRect(c, -3, 2, 4, 16, 2);

    // Elbow joint
    c.translate(0, 20);
    c.rotate(0.35 + Math.sin(ape.armPhase) * 0.08);
    c.fillStyle = COLORS.maroonDark;
    c.beginPath();
    c.arc(0, 0, 5.5, 0, Math.PI * 2);
    c.fill();

    // Forearm
    c.fillStyle = COLORS.maroon;
    fillRoundRect(c, -5, 0, 10, 18, 4);

    // Fist / hand (blue-ish knuckles like skin)
    c.translate(0, 17);
    c.fillStyle = COLORS.face;
    fillRoundRect(c, -6, 0, 12, 10, 3);
    c.fillStyle = COLORS.faceShade;
    c.fillRect(-4, 3, 2, 5);
    c.fillRect(-1, 3, 2, 5);
    c.fillRect(2, 3, 2, 5);

    c.restore();
  }

  /**
   * Full King Kong body — barrel chest, long arms, bowed legs.
   * Drawn in local space centered at (0,0) within ape.w × ape.h.
   */
  function drawKongBody(c) {
    const bs = Math.min(APE_W / KONG_REF_W, APE_H / KONG_REF_H);
    c.save();
    c.scale(bs, bs);

    const cx = 0;
    const cy = 4;

    // --- Arm angles (Kong flap / idle / dive) ---
    let armAngle;
    if (ape.flapTimer > 0) {
      // Beat-chest / soar: arms swept up and out
      const t = ape.flapTimer / 14;
      armAngle = -2.1 - t * 0.4 + Math.sin(ape.armPhase * 2) * 0.15;
    } else if (state === STATES.START) {
      // Idle hover sway
      armAngle = -0.55 + Math.sin(ape.armPhase) * 0.35;
    } else if (ape.vy < 0) {
      armAngle = -1.6;
    } else {
      // Falling — arms trail forward/down like a dive
      const t = Math.min(ape.vy / MAX_VELOCITY, 1);
      armAngle = -0.4 + t * 1.1;
    }

    // Draw far (back) arm first
    drawArm(c, cx + 10, cy - 6, armAngle + 0.12, false);

    // --- Legs (bowed gorilla stance) ---
    const legSwing = state === STATES.PLAYING ? ape.vy * 0.03 : Math.sin(ape.armPhase) * 0.15;

    c.save();
    c.translate(cx - 7, cy + 22);
    c.rotate(-0.25 + legSwing);
    c.fillStyle = COLORS.maroonDark;
    fillRoundRect(c, -5, 0, 10, 16, 4);
    c.fillStyle = COLORS.face; // foot
    fillRoundRect(c, -6, 13, 12, 6, 2);
    c.restore();

    c.save();
    c.translate(cx + 7, cy + 22);
    c.rotate(0.25 - legSwing);
    c.fillStyle = COLORS.maroon;
    fillRoundRect(c, -5, 0, 10, 16, 4);
    c.fillStyle = COLORS.face;
    fillRoundRect(c, -6, 13, 12, 6, 2);
    c.restore();

    // --- Torso / barrel chest ---
    c.fillStyle = COLORS.maroon;
    fillRoundRect(c, cx - 16, cy - 10, 32, 34, 12);
    c.fillStyle = COLORS.maroonDark;
    fillRoundRect(c, cx - 16, cy - 4, 6, 26, 3);
    fillRoundRect(c, cx + 10, cy - 4, 6, 26, 3);

    // Ice-blue chest / belly
    c.fillStyle = COLORS.face;
    fillRoundRect(c, cx - 10, cy - 6, 20, 26, 8);
    c.fillStyle = COLORS.faceShade;
    c.fillRect(cx - 1, cy + 2, 2, 14);
    c.fillRect(cx - 6, cy + 4, 4, 2);
    c.fillRect(cx + 2, cy + 4, 4, 2);
    c.fillRect(cx - 6, cy + 10, 4, 2);
    c.fillRect(cx + 2, cy + 10, 4, 2);
    c.beginPath();
    c.arc(cx - 5, cy + 1, 1.5, 0, Math.PI * 2);
    c.arc(cx + 5, cy + 1, 1.5, 0, Math.PI * 2);
    c.fill();

    // Neck fur — bridges chest to pixel head (no floating gap)
    c.fillStyle = COLORS.maroonDark;
    fillRoundRect(c, cx - 9, cy - 12, 18, 11, 5);
    c.fillStyle = COLORS.maroon;
    fillRoundRect(c, cx - 7, cy - 14, 14, 9, 4);
    // Ice-blue throat patch
    c.fillStyle = COLORS.face;
    fillRoundRect(c, cx - 4, cy - 10, 8, 6, 2);

    // Head rooted on neck (hy = bottom of head sprite)
    drawHead(c, cx, cy - 5);

    // Shoulder caps overlap head base — hides the seam
    c.fillStyle = COLORS.maroonLite;
    c.beginPath();
    c.ellipse(cx - 12, cy - 6, 8, 7, -0.3, 0, Math.PI * 2);
    c.fill();
    c.beginPath();
    c.ellipse(cx + 12, cy - 6, 8, 7, 0.3, 0, Math.PI * 2);
    c.fill();
    c.fillStyle = COLORS.maroon;
    c.beginPath();
    c.ellipse(cx - 11, cy - 5, 6, 5, -0.25, 0, Math.PI * 2);
    c.fill();
    c.beginPath();
    c.ellipse(cx + 11, cy - 5, 6, 5, 0.25, 0, Math.PI * 2);
    c.fill();

    // Near (front) arm
    drawArm(c, cx - 10, cy - 6, armAngle - 0.08, true);

    c.restore();
  }

  function drawApe() {
    ctx.save();
    ctx.translate(ape.x + ape.w / 2, ape.y + ape.h / 2);
    ctx.rotate(ape.rotation);
    ctx.imageSmoothingEnabled = false;
    drawKongBody(ctx);
    ctx.restore();
  }

  // ----------------------------------------------------------
  // Obstacles — Crypto Candlesticks
  // ----------------------------------------------------------
  /** @type {Array<{x:number, gapY:number, scored:boolean, wickTop:number, wickBot:number}>} */
  let pipes = [];
  let spawnTimer = 0;

  function resetPipes() {
    pipes = [];
    spawnTimer = 0;
  }

  function spawnPipe() {
    const margin = 60;
    const gapY =
      margin + Math.random() * (H - GAP_HEIGHT - margin * 2 - 40);

    pipes.push({
      x: W + 10,
      gapY,
      scored: false,
      wickTop: 12 + Math.random() * 18,
      wickBot: 12 + Math.random() * 18,
    });
  }

  function updatePipes() {
    spawnTimer++;
    if (spawnTimer >= SPAWN_INTERVAL) {
      spawnTimer = 0;
      spawnPipe();
    }

    for (let i = pipes.length - 1; i >= 0; i--) {
      const p = pipes[i];
      p.x -= PIPE_SPEED;

      // Score when ape clears the candlestick
      if (!p.scored && p.x + PIPE_WIDTH < ape.x) {
        p.scored = true;
        score += 1;
        onScore(score);
        if (score > highScore) {
          highScore = score;
          localStorage.setItem(STORAGE_KEY, String(highScore));
        }
      }

      if (p.x + PIPE_WIDTH < -20) {
        pipes.splice(i, 1);
      }
    }
  }

  function drawCandlestick(x, y, h, bullish) {
    const bodyColor = bullish ? COLORS.bull : COLORS.bear;
    const edgeColor = bullish ? COLORS.bullDark : COLORS.bearDark;
    const wickLen = Math.min(20, Math.max(8, h * 0.12));

    // Wick (thin center line)
    ctx.fillStyle = COLORS.wick;
    const wickX = x + PIPE_WIDTH / 2 - 1.5;
    if (bullish) {
      // Bottom candle: wick extends upward from top of body (into gap)
      // and downward from bottom into floor slightly — draw body wick only above
      ctx.fillRect(wickX, y - wickLen, 3, wickLen);
      ctx.fillRect(wickX, y + h, 3, wickLen * 0.6);
    } else {
      // Top candle: wick below body into gap, and above into ceiling
      ctx.fillRect(wickX, y + h, 3, wickLen);
      ctx.fillRect(wickX, y - wickLen * 0.6, 3, wickLen * 0.6);
    }

    // Candle body
    ctx.fillStyle = bodyColor;
    ctx.fillRect(x, y, PIPE_WIDTH, h);

    // Inner highlight / edge for depth
    ctx.fillStyle = "rgba(255,255,255,0.12)";
    ctx.fillRect(x + 3, y + 2, 6, Math.max(0, h - 4));
    ctx.fillStyle = edgeColor;
    ctx.fillRect(x, y, PIPE_WIDTH, 3);
    ctx.fillRect(x, y + h - 3, PIPE_WIDTH, 3);

    // Tiny OHLC tick marks on the side
    ctx.fillStyle = "rgba(0,0,0,0.25)";
    for (let t = 8; t < h - 8; t += 14) {
      ctx.fillRect(x + 8, y + t, PIPE_WIDTH - 16, 1);
    }
  }

  function drawPipes() {
    for (const p of pipes) {
      const topH = p.gapY;
      const botY = p.gapY + GAP_HEIGHT;
      const botH = H - botY - 36; // leave ground strip

      // Top = bearish (red), Bottom = bullish (green)
      if (topH > 0) drawCandlestick(p.x, 0, topH, false);
      if (botH > 0) drawCandlestick(p.x, botY, botH, true);

      // Extra thematic wicks into the gap from each body
      ctx.fillStyle = COLORS.wick;
      const wickX = p.x + PIPE_WIDTH / 2 - 1.5;
      ctx.fillRect(wickX, topH, 3, p.wickTop);
      ctx.fillRect(wickX, botY - p.wickBot, 3, p.wickBot);
    }
  }

  function pipeHitboxes(p) {
    const topH = p.gapY;
    const botY = p.gapY + GAP_HEIGHT;
    const botH = H - botY - 36;
    return [
      { x: p.x, y: 0, w: PIPE_WIDTH, h: topH },
      { x: p.x, y: botY, w: PIPE_WIDTH, h: botH },
    ];
  }

  // ----------------------------------------------------------
  // AABB Collision
  // ----------------------------------------------------------
  function aabb(a, b) {
    return (
      a.x < b.x + b.w &&
      a.x + a.w > b.x &&
      a.y < b.y + b.h &&
      a.y + a.h > b.y
    );
  }

  function checkCollisions() {
    const box = apeHitbox();

    // Ceiling / floor (ground strip ~36px)
    if (box.y < 0 || box.y + box.h > H - 36) {
      deathCause = "bounds";
      return true;
    }

    for (const p of pipes) {
      for (const hb of pipeHitboxes(p)) {
        if (hb.h > 0 && aabb(box, hb)) {
          deathCause = "candle";
          return true;
        }
      }
    }

    return false;
  }

  // ----------------------------------------------------------
  // Particles — banana trails on flap, pixel burst on death
  // ----------------------------------------------------------
  /** @type {Array<{x:number,y:number,vx:number,vy:number,life:number,max:number,size:number,color:string,kind:string,rot:number,spin:number}>} */
  let particles = [];

  function trimParticles() {
    const cap = IS_MOBILE ? 40 : MAX_PARTICLES;
    if (particles.length > cap) {
      particles.splice(0, particles.length - cap);
    }
  }

  function spawnFlapParticles(x, y) {
    const count = IS_MOBILE ? 3 : 6;
    for (let i = 0; i < count; i++) {
      particles.push({
        x: x + (Math.random() - 0.5) * 8,
        y: y + (Math.random() - 0.5) * 8,
        vx: -1.2 - Math.random() * 2.8,
        vy: (Math.random() - 0.5) * 2.5,
        life: 22 + Math.random() * 16,
        max: 38,
        size: 7 + Math.random() * 5,
        color: COLORS.banana,
        kind: "banana",
        rot: Math.random() * Math.PI * 2,
        spin: (Math.random() - 0.5) * 0.35,
      });
    }
    trimParticles();
  }

  function spawnExplodeParticles(x, y) {
    const count = IS_MOBILE ? 10 : 22;
    for (let i = 0; i < count; i++) {
      const angle = Math.random() * Math.PI * 2;
      const speed = 1.5 + Math.random() * 4;
      const isBanana = Math.random() < 0.55;
      particles.push({
        x,
        y,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed - 1,
        life: 25 + Math.random() * 20,
        max: 45,
        size: isBanana ? 6 + Math.random() * 5 : 2 + Math.random() * 3,
        color: isBanana ? COLORS.banana : pick([COLORS.maroon, COLORS.face, COLORS.leaf]),
        kind: isBanana ? "banana" : "pixel",
        rot: Math.random() * Math.PI * 2,
        spin: (Math.random() - 0.5) * 0.4,
      });
    }
    trimParticles();
  }

  function updateParticles() {
    for (let i = particles.length - 1; i >= 0; i--) {
      const p = particles[i];
      p.x += p.vx;
      p.y += p.vy;
      p.vy += 0.12;
      p.rot += p.spin || 0;
      p.life--;
      if (p.life <= 0) particles.splice(i, 1);
    }
  }

  function drawBananaParticle(p) {
    const alpha = Math.max(0, p.life / p.max);
    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.translate(p.x, p.y);
    ctx.rotate(p.rot);
    const s = p.size;
    // Banana body (crescent-ish)
    ctx.fillStyle = COLORS.banana;
    ctx.beginPath();
    ctx.ellipse(0, 0, s * 0.55, s * 0.28, 0.4, 0, Math.PI * 2);
    ctx.fill();
    // Peel tip
    ctx.fillStyle = COLORS.bananaPeel;
    ctx.fillRect(s * 0.35, -s * 0.12, s * 0.2, s * 0.18);
    // Stem
    ctx.fillStyle = "#5c3d24";
    ctx.fillRect(-s * 0.55, -s * 0.08, s * 0.18, s * 0.12);
    ctx.restore();
  }

  function drawParticles() {
    for (const p of particles) {
      if (p.kind === "banana") {
        drawBananaParticle(p);
      } else {
        const alpha = Math.max(0, p.life / p.max);
        ctx.globalAlpha = alpha;
        ctx.fillStyle = p.color;
        ctx.fillRect(p.x | 0, p.y | 0, p.size | 0, p.size | 0);
      }
    }
    ctx.globalAlpha = 1;
  }

  // ----------------------------------------------------------
  // Background / ground — Dingus Forest
  // ----------------------------------------------------------
  let groundOffset = 0;

  function drawTree(baseX, baseY, scale, parallax) {
    const ox = ((baseX - groundOffset * parallax) % (W + 80)) - 40;
    const s = scale;
    // Trunk
    ctx.fillStyle = COLORS.trunkDark;
    ctx.fillRect(ox - 6 * s, baseY - 70 * s, 12 * s, 70 * s);
    ctx.fillStyle = COLORS.trunk;
    ctx.fillRect(ox - 4 * s, baseY - 70 * s, 5 * s, 70 * s);
    // Canopy blobs
    ctx.fillStyle = COLORS.canopyDark;
    ctx.beginPath();
    ctx.arc(ox, baseY - 75 * s, 28 * s, 0, Math.PI * 2);
    ctx.arc(ox - 18 * s, baseY - 60 * s, 20 * s, 0, Math.PI * 2);
    ctx.arc(ox + 18 * s, baseY - 60 * s, 20 * s, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = COLORS.leaf;
    ctx.beginPath();
    ctx.arc(ox - 4 * s, baseY - 78 * s, 18 * s, 0, Math.PI * 2);
    ctx.arc(ox + 10 * s, baseY - 68 * s, 14 * s, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = COLORS.leafLite;
    ctx.beginPath();
    ctx.arc(ox - 8 * s, baseY - 72 * s, 8 * s, 0, Math.PI * 2);
    ctx.fill();
  }

  function drawBackground() {
    // Daytime forest sky → canopy haze
    const g = ctx.createLinearGradient(0, 0, 0, H);
    g.addColorStop(0, COLORS.skyTop);
    g.addColorStop(0.35, "#9bc4a0");
    g.addColorStop(0.65, COLORS.skyMid);
    g.addColorStop(1, COLORS.skyBot);
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, W, H);

    // Soft sun through leaves
    ctx.fillStyle = "rgba(255, 230, 140, 0.35)";
    ctx.beginPath();
    ctx.arc(300, 70, 36, 0, Math.PI * 2);
    ctx.fill();

    if (IS_MOBILE) {
      // Lighter backdrop for phones — fewer ellipses / vines
      drawTree(90, H - 36, 1.05, 0.55);
      drawTree(250, H - 36, 1.15, 0.55);
      ctx.fillStyle = COLORS.canopyDark;
      for (let x = -((groundOffset * 0.4) % 48); x < W + 40; x += 48) {
        ctx.beginPath();
        ctx.ellipse(x, 6, 26, 18, 0, 0, Math.PI * 2);
        ctx.fill();
      }
      return;
    }

    ctx.fillStyle = "rgba(255, 250, 200, 0.5)";
    ctx.beginPath();
    ctx.arc(300, 70, 18, 0, Math.PI * 2);
    ctx.fill();

    // Far trees (parallax)
    drawTree(40, H - 36, 0.7, 0.25);
    drawTree(160, H - 36, 0.85, 0.25);
    drawTree(280, H - 36, 0.65, 0.25);
    drawTree(380, H - 36, 0.9, 0.25);

    // Mid trees
    drawTree(90, H - 36, 1.15, 0.55);
    drawTree(230, H - 36, 1.05, 0.55);
    drawTree(350, H - 36, 1.2, 0.55);

    // Canopy fringe along the top
    ctx.fillStyle = COLORS.canopyDark;
    for (let x = -((groundOffset * 0.4) % 36); x < W + 40; x += 36) {
      ctx.beginPath();
      ctx.ellipse(x, 8, 28, 22, 0, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.fillStyle = COLORS.leaf;
    for (let x = -((groundOffset * 0.5) % 40) + 12; x < W + 40; x += 40) {
      ctx.beginPath();
      ctx.ellipse(x, 0, 22, 16, 0, 0, Math.PI * 2);
      ctx.fill();
    }

    // Hanging vines
    ctx.strokeStyle = COLORS.moss;
    ctx.lineWidth = 2;
    for (let i = 0; i < 5; i++) {
      const vx = ((i * 85 + 30 - groundOffset * 0.7) % (W + 60)) - 20;
      ctx.beginPath();
      ctx.moveTo(vx, 0);
      ctx.quadraticCurveTo(vx + 8, 40, vx - 4, 70 + (i % 3) * 12);
      ctx.stroke();
      ctx.fillStyle = COLORS.leafLite;
      ctx.beginPath();
      ctx.ellipse(vx - 4, 55 + (i % 3) * 10, 5, 3, 0.5, 0, Math.PI * 2);
      ctx.fill();
    }

    // Dappled light patches
    ctx.fillStyle = "rgba(255, 240, 160, 0.07)";
    for (let i = 0; i < 6; i++) {
      const dx = ((i * 73 - groundOffset * 0.3) % (W + 50));
      ctx.beginPath();
      ctx.ellipse(dx, 180 + (i % 3) * 60, 30, 14, 0, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  function drawGround() {
    const gy = H - 36;
    // Dirt floor
    ctx.fillStyle = COLORS.ground;
    ctx.fillRect(0, gy, W, 36);
    // Moss top edge
    ctx.fillStyle = COLORS.moss;
    ctx.fillRect(0, gy, W, 5);
    ctx.fillStyle = COLORS.leaf;
    for (let x = -((groundOffset | 0) % 20); x < W; x += 20) {
      ctx.fillRect(x, gy, 12, 3);
    }
    // Dirt clumps / roots
    ctx.fillStyle = COLORS.trunkDark;
    for (let x = -((groundOffset * 0.8) % 28); x < W; x += 28) {
      ctx.fillRect(x + 4, gy + 12, 8, 3);
      ctx.fillRect(x + 14, gy + 20, 6, 2);
    }

    // Scrolling degen ticker on the forest floor
    if (!IS_MOBILE) {
      const tape = TICKER_BITS.join("  ·  ") + "  ·  ";
      ctx.font = '8px "Press Start 2P", monospace';
      ctx.fillStyle = "rgba(255, 223, 0, 0.35)";
      ctx.textAlign = "left";
      ctx.textBaseline = "middle";
      const tapeW = ctx.measureText(tape).width;
      const ox = -((groundOffset * 0.6) % tapeW);
      ctx.fillText(tape, ox, gy + 28);
      ctx.fillText(tape, ox + tapeW, gy + 28);
    }
  }

  // ----------------------------------------------------------
  // UI text helpers
  // ----------------------------------------------------------
  function drawCenteredText(text, y, size, color, shadow) {
    ctx.font = `${size}px "Press Start 2P", monospace`;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    if (shadow) {
      ctx.fillStyle = shadow;
      ctx.fillText(text, W / 2 + 2, y + 2);
    }
    ctx.fillStyle = color;
    ctx.fillText(text, W / 2, y);
  }

  /** Word-wrap for Academy one-liners; breaks long tokens by character */
  function wrapText(text, maxWidth, size) {
    ctx.font = `${size}px "Press Start 2P", monospace`;
    const lines = [];
    const words = text.split(" ");
    let line = "";

    for (const w of words) {
      const test = line ? line + " " + w : w;
      if (ctx.measureText(test).width <= maxWidth) {
        line = test;
        continue;
      }

      if (line) {
        lines.push(line);
        line = "";
      }

      let chunk = "";
      for (const ch of w) {
        const next = chunk + ch;
        if (chunk && ctx.measureText(next).width > maxWidth) {
          lines.push(chunk);
          chunk = ch;
        } else {
          chunk = next;
        }
      }
      line = chunk;
    }

    if (line) lines.push(line);
    return lines;
  }

  function fitFontSize(text, maxWidth, maxSize, minSize) {
    let size = maxSize;
    while (size > minSize) {
      ctx.font = `${size}px "Press Start 2P", monospace`;
      const tooWide = ctx.measureText(text).width > maxWidth;
      const tooManyLines = wrapText(text, maxWidth, size).length > 2;
      if (!tooWide && !tooManyLines) break;
      size--;
    }
    return size;
  }

  function drawCenteredLines(lines, y, size, color, shadow, lineGap = 6) {
    ctx.font = `${size}px "Press Start 2P", monospace`;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    const step = size + lineGap;
    for (let i = 0; i < lines.length; i++) {
      const ly = y + i * step;
      if (shadow) {
        ctx.fillStyle = shadow;
        ctx.fillText(lines[i], W / 2 + 2, ly + 2);
      }
      ctx.fillStyle = color;
      ctx.fillText(lines[i], W / 2, ly);
    }
    return lines.length * step;
  }

  function drawWrappedCenter(text, y, size, color, maxWidth) {
    const lines = wrapText(text, maxWidth, size);
    ctx.fillStyle = color;
    const step = size + 6;
    ctx.font = `${size}px "Press Start 2P", monospace`;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    for (let i = 0; i < lines.length; i++) {
      ctx.fillText(lines[i], W / 2, y + i * step);
    }
    return lines.length * step;
  }

  function drawStartUI() {
    // Dim vignette
    ctx.fillStyle = "rgba(0,0,0,0.35)";
    ctx.fillRect(0, 0, W, H);

    drawCenteredText("FLOPPY DEGEN APE", 100, 16, COLORS.lavender, "rgba(0,0,0,0.45)");
    drawCenteredText("FLOPPY DEGEN APE", 98, 16, COLORS.cream, null);

    drawCenteredText("HISTORY CLASS ELECTIVE", 130, 8, COLORS.gold, null);

    // Rotating Academy roast
    drawWrappedCenter(startJoke, 340, 8, COLORS.banana, W - 56 - 36);

    drawCenteredText("Press Space / Tap", 400, 10, COLORS.dim, null);
    drawCenteredText("to Jump", 420, 10, COLORS.dim, null);

    drawCenteredText(`HI ${highScore}`, 460, 12, COLORS.cream, null);

    const pulse = 0.55 + Math.sin(frame * 0.08) * 0.35;
    ctx.globalAlpha = pulse;
    drawCenteredText("[ START ]", 510, 11, COLORS.banana, null);
    ctx.globalAlpha = 1;
  }

  function drawPlayingUI() {
    ctx.font = '20px "Press Start 2P", monospace';
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillStyle = "rgba(0,0,0,0.55)";
    ctx.fillText(String(score), W / 2 + 2, 52);
    ctx.fillStyle = COLORS.white;
    ctx.fillText(String(score), W / 2, 50);

    // SBF on screen — flavor only
    if (sbf.active && (sbf.mode === "telegraph" || sbf.mode === "lunge")) {
      ctx.font = '7px "Press Start 2P", monospace';
      ctx.fillStyle = "#ffb347";
      ctx.fillText("SBF LUNGING", W / 2, 78);
    }

    drawToast();
  }

  function drawGameOverUI() {
    const panelX = 28;
    const panelW = W - 56;
    const panelPad = 18;
    const textMaxW = panelW - panelPad * 2;

    // Red impact overlay
    ctx.fillStyle = "rgba(180, 20, 40, 0.35)";
    ctx.fillRect(0, 0, W, H);

    const titleSize = fitFontSize(rektTitle, textMaxW, 26, 14);
    const titleLines = wrapText(rektTitle, textMaxW, titleSize);

    let jokeSize = 8;
    let jokeLines = wrapText(rektJoke, textMaxW, jokeSize);
    while (jokeSize > 6 && jokeLines.length > 5) {
      jokeSize--;
      jokeLines = wrapText(rektJoke, textMaxW, jokeSize);
    }

    const titleStep = titleSize + 6;
    const jokeStep = jokeSize + 6;
    const titleBlockH = titleLines.length * titleStep;
    const jokeBlockH = jokeLines.length * jokeStep;

    const contentH =
      panelPad +
      titleBlockH +
      14 +
      jokeBlockH +
      22 +
      28 +
      28 +
      26 +
      panelPad;
    const panelH = Math.max(280, contentH);
    const panelY = Math.max(100, Math.min(140, (H - panelH) / 2));

    ctx.fillStyle = "rgba(0,0,0,0.5)";
    ctx.fillRect(panelX, panelY, panelW, panelH);

    ctx.strokeStyle = COLORS.lavender;
    ctx.lineWidth = 2;
    ctx.strokeRect(panelX, panelY, panelW, panelH);

    let y = panelY + panelPad + titleSize / 2;
    drawCenteredLines(titleLines, y, titleSize, COLORS.bear, "rgba(0,0,0,0.8)");

    y = panelY + panelPad + titleBlockH + 14 + jokeSize / 2;
    drawCenteredLines(jokeLines, y, jokeSize, COLORS.banana, null);

    y = panelY + panelPad + titleBlockH + 14 + jokeBlockH + 22 + 6;
    drawCenteredText(`SCORE  ${score}`, y, 12, COLORS.cream, null);
    drawCenteredText(`BEST   ${highScore}`, y + 28, 12, COLORS.neon, null);

    const pulse = 0.55 + Math.sin(frame * 0.1) * 0.35;
    ctx.globalAlpha = pulse;
    if (canRetry()) {
      drawCenteredText("Click to Retry", panelY + panelH - panelPad - 5, 10, COLORS.banana, null);
    } else {
      drawCenteredText("...", panelY + panelH - panelPad - 5, 10, COLORS.dim, null);
    }
    ctx.globalAlpha = 1;
  }

  // ----------------------------------------------------------
  // State transitions
  // ----------------------------------------------------------
  function startGame() {
    state = STATES.PLAYING;
    score = 0;
    frame = 0;
    particles = [];
    toast = null;
    deathCause = "candle";
    shakeMagnitude = 0;
    shakeDuration = 0;
    resetApe();
    resetPipes();
    resetSbf();
    if (window.FloppyAnalytics?.gameStart) window.FloppyAnalytics.gameStart();
    flap(); // initial boost so player isn't dead on spawn
  }

  function triggerGameOver() {
    if (state !== STATES.PLAYING) return;
    state = STATES.GAMEOVER;
    gameOverAt = performance.now();
    shakeMagnitude = 10;
    shakeDuration = 18;
    playCrashSound();
    spawnExplodeParticles(ape.x + ape.w / 2, ape.y + ape.h / 2);

    rektTitle = pick(REKT_TITLES);
    rektJoke = pick(REKT_JOKES);

    if (score > highScore) {
      highScore = score;
      localStorage.setItem(STORAGE_KEY, String(highScore));
    }

    if (window.FloppyLeaderboard) {
      window.FloppyLeaderboard.onGameOver(score);
    }
    if (window.FloppyAnalytics?.gameOver) window.FloppyAnalytics.gameOver(score);
  }

  function canRetry() {
    return performance.now() - gameOverAt >= RETRY_DELAY_MS;
  }

  function handleAction() {
    if (state === STATES.START) {
      startGame();
    } else if (state === STATES.PLAYING) {
      flap();
    } else if (state === STATES.GAMEOVER) {
      if (!canRetry()) return;
      startGame();
    }
  }

  // ----------------------------------------------------------
  // Input
  // ----------------------------------------------------------
  function onKeyDown(e) {
    if (e.code !== "Space" && e.code !== "ArrowUp") return;
    if (e.repeat && state === STATES.GAMEOVER) return;
    e.preventDefault();
    handleAction();
  }

  window.addEventListener("keydown", onKeyDown);
  canvas.addEventListener("mousedown", (e) => {
    e.preventDefault();
    handleAction();
  });
  canvas.addEventListener(
    "touchstart",
    (e) => {
      e.preventDefault();
      handleAction();
    },
    { passive: false }
  );

  // ----------------------------------------------------------
  // Main loop
  // ----------------------------------------------------------
  function update() {
    frame++;

    if (state === STATES.START) {
      updateApeHover();
      updateParticles();
      groundOffset += 1.2;
      startJokeTimer++;
      if (startJokeTimer > 180) {
        startJokeTimer = 0;
        startJoke = pick(START_JOKES);
      }
    } else if (state === STATES.PLAYING) {
      updateApe();
      updatePipes();
      updateSbf();
      updateParticles();
      updateToast();
      groundOffset += PIPE_SPEED;
      if (groundOffset > 50000) groundOffset %= 10000;

      if (checkCollisions()) {
        triggerGameOver();
      }
    } else if (state === STATES.GAMEOVER) {
      // Brief residual fall / settle
      if (shakeDuration > 0) {
        ape.vy = Math.min(ape.vy + GRAVITY * 0.5, MAX_VELOCITY);
        ape.y = Math.min(ape.y + ape.vy * 0.4, H - 36 - ape.h);
        updateApeRotation();
      }
      updateParticles();
      updateToast();
    }

    if (shakeDuration > 0) {
      shakeDuration--;
      shakeMagnitude *= 0.9;
    } else {
      shakeMagnitude = 0;
    }
  }

  function draw() {
    ctx.save();

    // Screen shake
    if (shakeMagnitude > 0.4) {
      const dx = (Math.random() - 0.5) * shakeMagnitude * 2;
      const dy = (Math.random() - 0.5) * shakeMagnitude * 2;
      ctx.translate(dx, dy);
    }

    ctx.imageSmoothingEnabled = false;

    drawBackground();
    drawPipes();
    drawGround();
    drawSbf(); // behind / beside the ape chase vibe
    drawApe();
    drawParticles();

    if (state === STATES.START) {
      drawStartUI();
    } else if (state === STATES.PLAYING) {
      drawPlayingUI();
    } else if (state === STATES.GAMEOVER) {
      drawGameOverUI();
    }

    ctx.restore();
  }

  let lastFrameTime = performance.now();
  let timeAccum = 0;

  function loop(now) {
    // Fixed 60Hz sim — phones at 30fps stay normal speed (not slow-mo)
    let frameDt = now - lastFrameTime;
    lastFrameTime = now;
    if (frameDt > 100) frameDt = 100;
    timeAccum += frameDt;

    let steps = 0;
    while (timeAccum >= FIXED_DT && steps < 5) {
      update();
      timeAccum -= FIXED_DT;
      steps++;
    }

    draw();
    requestAnimationFrame(loop);
  }

  // Boot
  resetApe();
  bindSoundButton();
  requestAnimationFrame(loop);
})();
