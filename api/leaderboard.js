/**
 * Vercel serverless — GET/POST /api/leaderboard
 */
const {
  USERNAME_RE,
  MAX_SCORE,
  readScores,
  sortScores,
  submitScore,
} = require("../scores");

module.exports = async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");

  if (req.method === "OPTIONS") {
    return res.status(204).end();
  }

  if (req.method === "GET") {
    try {
      return res.status(200).json(sortScores(await readScores()));
    } catch (err) {
      const msg =
        err.code === "NO_STORE"
          ? "Leaderboard storage not configured"
          : "Could not load leaderboard";
      return res.status(500).json({ error: msg });
    }
  }

  if (req.method === "POST") {
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
      return res.status(200).json(result);
    } catch (err) {
      const msg =
        err.code === "NO_STORE"
          ? "Leaderboard storage not configured"
          : "Could not save score";
      return res.status(500).json({ ok: false, error: msg });
    }
  }

  return res.status(405).json({ error: "Method not allowed" });
};
