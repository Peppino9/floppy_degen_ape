/**
 * Shared leaderboard storage.
 * Prefer Supabase (durable on Vercel). Fall back to local file for offline npm start.
 */
try {
  require("dotenv").config();
} catch {
  /* optional in serverless */
}

const fs = require("fs/promises");
const path = require("path");
const { createClient } = require("@supabase/supabase-js");

const USERNAME_RE = /^[a-zA-Z0-9_]{2,16}$/;
const MAX_SCORE = 100000;

const FILE_PATH = process.env.VERCEL
  ? path.join("/tmp", "floppy-degen-ape-scores.json")
  : path.join(__dirname, "data", "scores.json");

function getSupabase() {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return null;
  return createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

function sortScores(entries) {
  entries.sort((a, b) => b.score - a.score || a.at - b.at);
  return entries;
}

async function readScoresFile() {
  try {
    const raw = await fs.readFile(FILE_PATH, "utf8");
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch (err) {
    if (err.code === "ENOENT") return [];
    throw err;
  }
}

async function writeScoresFile(entries) {
  await fs.mkdir(path.dirname(FILE_PATH), { recursive: true });
  const tmp = `${FILE_PATH}.tmp`;
  await fs.writeFile(tmp, JSON.stringify(entries, null, 2), "utf8");
  await fs.rename(tmp, FILE_PATH);
}

async function readScores() {
  const supabase = getSupabase();
  if (supabase) {
    const { data, error } = await supabase
      .from("leaderboard")
      .select("username, score, updated_at")
      .order("score", { ascending: false })
      .order("updated_at", { ascending: true });

    if (error) throw error;

    return (data || []).map((row) => ({
      username: row.username,
      score: row.score,
      at: row.updated_at ? Date.parse(row.updated_at) : Date.now(),
    }));
  }

  if (process.env.VERCEL) {
    const err = new Error(
      "SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set on Vercel"
    );
    err.code = "NO_STORE";
    throw err;
  }

  return readScoresFile();
}

async function writeScores(entries) {
  const supabase = getSupabase();
  if (supabase) {
    // Full replace upsert of the board snapshot is awkward; callers update one row.
    // This function is only used by the file path after mutating the array.
    // Keep for API compatibility when using file storage.
    return writeScoresFile(entries);
  }

  if (process.env.VERCEL) {
    const err = new Error(
      "SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set on Vercel"
    );
    err.code = "NO_STORE";
    throw err;
  }

  return writeScoresFile(entries);
}

/** Upsert one username's best score. Returns { ok, entries, error? } */
async function submitScore(username, score) {
  const floored = Math.floor(score);
  const supabase = getSupabase();

  if (supabase) {
    const { data: existing, error: readErr } = await supabase
      .from("leaderboard")
      .select("username, score, updated_at")
      .eq("username", username)
      .maybeSingle();

    if (readErr) throw readErr;

    if (existing && floored <= existing.score) {
      return {
        ok: false,
        error: "Score not higher than your best",
        entries: await readScores(),
      };
    }

    const { error: upsertErr } = await supabase.from("leaderboard").upsert(
      {
        username,
        score: floored,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "username" }
    );

    if (upsertErr) throw upsertErr;

    return { ok: true, entries: await readScores() };
  }

  if (process.env.VERCEL) {
    const err = new Error(
      "SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set on Vercel"
    );
    err.code = "NO_STORE";
    throw err;
  }

  const entries = await readScoresFile();
  const idx = entries.findIndex((e) => e.username === username);

  if (idx >= 0) {
    if (floored <= entries[idx].score) {
      return {
        ok: false,
        error: "Score not higher than your best",
        entries: sortScores(entries),
      };
    }
    entries[idx].score = floored;
    entries[idx].at = Date.now();
  } else {
    entries.push({ username, score: floored, at: Date.now() });
  }

  sortScores(entries);
  await writeScoresFile(entries);
  return { ok: true, entries };
}

module.exports = {
  USERNAME_RE,
  MAX_SCORE,
  readScores,
  writeScores,
  sortScores,
  submitScore,
  usingSupabase: () => Boolean(getSupabase()),
};
