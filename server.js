/**
 * Floppy Degen Ape — local server (npm start).
 * On Vercel, static files + api/leaderboard.js are used instead.
 */
const express = require("express");
const path = require("path");
const {
  USERNAME_RE,
  MAX_SCORE,
  readScores,
  sortScores,
  submitScore,
} = require("./scores");

const PORT = Number(process.env.PORT) || 3000;
const ROOT = __dirname;

const app = express();
app.use(express.json({ limit: "1kb" }));

app.get("/api/leaderboard", async (_req, res) => {
  try {
    res.json(sortScores(await readScores()));
  } catch (err) {
    const msg =
      err.code === "NO_STORE"
        ? "Leaderboard storage not configured"
        : "Could not load leaderboard";
    res.status(500).json({ error: msg });
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

    const result = await submitScore(username, score);
    res.json(result);
  } catch (err) {
    const msg =
      err.code === "NO_STORE"
        ? "Leaderboard storage not configured"
        : "Could not save score";
    res.status(500).json({ ok: false, error: msg });
  }
});

app.use(express.static(ROOT, { index: "index.html", dotfiles: "deny" }));

if (require.main === module) {
  app.listen(PORT, () => {
    console.log(`Floppy Degen Ape → http://localhost:${PORT}`);
  });
}

module.exports = app;
