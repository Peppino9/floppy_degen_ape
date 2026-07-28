/**
 * Floppy Degen Ape — global leaderboard via hosted API.
 * Username stays in localStorage; scores live on the server (data/scores.json).
 */
(() => {
  "use strict";

  const USERNAME_KEY = "floppyDegenApeUsername";
  const USERNAME_RE = /^[a-zA-Z0-9_]{2,16}$/;
  const API = "/api/leaderboard";
  const REFRESH_MS = 30000;

  const listEl = document.getElementById("lb-list");
  const inputEl = document.getElementById("lb-username");
  const formEl = document.getElementById("lb-form");
  const saveBtnEl = document.getElementById("lb-save");
  const statusEl = document.getElementById("lb-status");

  let lastRunScore = 0;
  /** @type {Array<{username:string,score:number,at:number}>} */
  let boardEntries = [];
  let online = false;

  function getUsername() {
    const v = localStorage.getItem(USERNAME_KEY) || "";
    return sanitizeUsername(v);
  }

  function setUsername(name) {
    const clean = sanitizeUsername(name);
    if (!clean) return false;
    localStorage.setItem(USERNAME_KEY, clean);
    if (inputEl) inputEl.value = clean;
    return true;
  }

  function sanitizeUsername(name) {
    const trimmed = String(name || "").trim();
    if (!USERNAME_RE.test(trimmed)) return "";
    return trimmed;
  }

  function findScore(username) {
    const entry = boardEntries.find((e) => e.username === username);
    return entry ? entry.score : 0;
  }

  function qualifies(score, username) {
    if (score <= 0) return false;
    const who = username || getUsername();
    if (!who) return false;
    const mine = boardEntries.find((e) => e.username === who);
    return !mine || score > mine.score;
  }

  function setStatus(msg, isError) {
    if (!statusEl) return;
    statusEl.textContent = msg;
    statusEl.classList.toggle("leaderboard__status--error", Boolean(isError));
  }

  function updateSaveButton() {
    if (!saveBtnEl) return;
    const username = getUsername();
    saveBtnEl.disabled = !online || !username || !qualifies(lastRunScore, username);
  }

  function flashPrompt() {
    if (!inputEl) return;
    inputEl.classList.add("leaderboard__input--pulse");
    inputEl.focus();
    setTimeout(() => inputEl.classList.remove("leaderboard__input--pulse"), 1600);
    setStatus("Set a username to save your score");
  }

  function render() {
    if (!listEl) return;
    listEl.innerHTML = "";

    if (!online) {
      const li = document.createElement("li");
      li.className = "leaderboard__empty";
      li.textContent = "Start server: npm start";
      listEl.appendChild(li);
      return;
    }

    if (boardEntries.length === 0) {
      const li = document.createElement("li");
      li.className = "leaderboard__empty";
      li.textContent = "No scores yet — be first";
      listEl.appendChild(li);
      return;
    }

    const me = getUsername();
    boardEntries.forEach((entry, i) => {
      const li = document.createElement("li");
      li.className = "leaderboard__row";
      if (entry.username === me) li.classList.add("leaderboard__row--you");

      const rank = document.createElement("span");
      rank.className = "leaderboard__rank";
      rank.textContent = String(i + 1);

      const name = document.createElement("span");
      name.className = "leaderboard__name";
      name.textContent = entry.username;

      const pts = document.createElement("span");
      pts.className = "leaderboard__score";
      pts.textContent = String(entry.score);

      li.append(rank, name, pts);
      listEl.appendChild(li);
    });
  }

  async function refreshBoard({ silent } = {}) {
    try {
      const res = await fetch(API, { cache: "no-store" });
      if (!res.ok) throw new Error("fetch failed");
      const data = await res.json();
      if (!Array.isArray(data)) throw new Error("bad payload");
      boardEntries = data;
      online = true;
      render();
      updateSaveButton();
      if (!silent) setStatus("");
    } catch {
      online = false;
      boardEntries = [];
      render();
      updateSaveButton();
      if (!silent) setStatus("Can't reach leaderboard server", true);
    }
  }

  async function submit(username, score) {
    const clean = sanitizeUsername(username);
    if (!clean || score <= 0) return false;

    if (!online) {
      setStatus("Server offline — run npm start", true);
      return false;
    }

    try {
      const res = await fetch(API, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username: clean, score }),
      });
      const data = await res.json();

      if (Array.isArray(data.entries)) {
        boardEntries = data.entries;
        render();
      }

      if (data.ok) {
        setStatus(`Saved ${Math.floor(score)} for ${clean}`);
        updateSaveButton();
        return true;
      }

      if (score > 0) {
        setStatus(data.error || `Best for ${clean}: ${findScore(clean)}`);
      }
      updateSaveButton();
      return false;
    } catch {
      setStatus("Could not save score", true);
      return false;
    }
  }

  async function onGameOver(score) {
    lastRunScore = score;
    updateSaveButton();

    if (!getUsername()) {
      if (score > 0) flashPrompt();
      return;
    }

    if (qualifies(score, getUsername())) {
      const saved = await submit(getUsername(), score);
      if (saved && saveBtnEl) saveBtnEl.disabled = true;
    } else if (score > 0) {
      setStatus(`Best for ${getUsername()}: ${findScore(getUsername())}`);
    }
  }

  function bindUi() {
    if (inputEl) {
      const saved = getUsername();
      if (saved) inputEl.value = saved;
    }

    if (formEl) {
      formEl.addEventListener("submit", (e) => {
        e.preventDefault();
        const ok = setUsername(inputEl?.value || "");
        if (!ok) {
          setStatus("2–16 chars: letters, numbers, underscore", true);
          return;
        }
        setStatus(`Playing as ${getUsername()}`);
        render();
        updateSaveButton();
      });
    }

    if (saveBtnEl) {
      saveBtnEl.addEventListener("click", async () => {
        const username = getUsername();
        if (!username) {
          flashPrompt();
          return;
        }
        const saved = await submit(username, lastRunScore);
        if (saved) saveBtnEl.disabled = true;
      });
    }

    refreshBoard();
    setInterval(() => refreshBoard({ silent: true }), REFRESH_MS);
  }

  window.FloppyLeaderboard = {
    getUsername,
    setUsername,
    qualifies,
    submit,
    onGameOver,
    refreshBoard,
    render,
  };

  bindUi();
})();
