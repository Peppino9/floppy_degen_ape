/**
 * Floppy Degen Ape — static game + shared leaderboard API.
 * Run: npm start  →  serves game and stores scores in data/scores.json
 */
const express = require("express");
const fs = require("fs/promises");
const path = require("path");

const PORT = Number(process.env.PORT) || 3000;
const ROOT = __dirname;
const SCORES_PATH = path.join(ROOT, "data", "scores.json");
const USERNAME_RE = /^[a-zA-Z0-9_]{2,16}$/;
const MAX_SCORE = 100000;

async function readScores() {
  try {
    const raw = await fs.readFile(SCORES_PATH, "utf8");
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch (err) {
    if (err.code === "ENOENT") return [];
    throw err;
  }
}

async function writeScores(entries) {
  await fs.mkdir(path.dirname(SCORES_PATH), { recursive: true });
  const tmp = `${SCORES_PATH}.tmp`;
  await fs.writeFile(tmp, JSON.stringify(entries, null, 2), "utf8");
  await fs.rename(tmp, SCORES_PATH);
}

function sortScores(entries) {
  entries.sort((a, b) => b.score - a.score || a.at - b.at);
  return entries;
}

const app = express();
app.use(express.json({ limit: "1kb" }));

app.get("/api/leaderboard", async (_req, res) => {
  try {
    res.json(sortScores(await readScores()));
  } catch {
    res.status(500).json({ error: "Could not load leaderboard" });
  }
});

app.post("/api/leaderboard", async (req, res) => {
  try {
    const username = String(req.body?.username || "").trim();
    const score = Number(req.body?.score);

    if (!USERNAME_RE.test(username)) {
      return res.status(400).json({ ok: false, error: "Invalid username" });
    }
    if (!Number.isFinite(score) || score <= 0 || score > MAX_SCORE) {
      return res.status(400).json({ ok: false, error: "Invalid score" });
    }

    const entries = await readScores();
    const idx = entries.findIndex((e) => e.username === username);
    const floored = Math.floor(score);

    if (idx >= 0) {
      if (floored <= entries[idx].score) {
        return res.json({
          ok: false,
          error: "Score not higher than your best",
          entries: sortScores(entries),
        });
      }
      entries[idx].score = floored;
      entries[idx].at = Date.now();
    } else {
      entries.push({ username, score: floored, at: Date.now() });
    }

    sortScores(entries);
    await writeScores(entries);
    res.json({ ok: true, entries });
  } catch {
    res.status(500).json({ ok: false, error: "Could not save score" });
  }
});

app.use(express.static(ROOT, { index: "index.html", dotfiles: "deny" }));

app.listen(PORT, () => {
  console.log(`Floppy Degen Ape → http://localhost:${PORT}`);
});
