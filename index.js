import "dotenv/config";
import express from "express";
import StremioSDK from "stremio-addon-sdk";

const { addonBuilder } = StremioSDK;

import {
  searchMovies,
  getSubtitles,
  downloadSubtitleZip,
  extractBestTextSubtitleFromZip
} from "./subsource.js";

import { toStremioLang } from "./language.js";

const API_KEY = process.env.SUBSOURCE_API_KEY;
if (!API_KEY) {
  console.error("❌ Missing SUBSOURCE_API_KEY in environment variables");
}

const PORT = Number(process.env.PORT || 7000);
const BASE_URL = process.env.RENDER_EXTERNAL_URL || `http://127.0.0.1:${PORT}`;

/* ================= Manifest ================= */

const manifest = {
  id: "community.subsource.subtitles",
  version: "1.0.3",
  name: "SubSource Subtitles (API)",
  description: "Subtitles from SubSource API",
  resources: ["subtitles"],
  types: ["movie", "series"],
  catalogs: [],
  idPrefixes: ["tt"]
};

const builder = new addonBuilder(manifest);

/* ================= Helpers ================= */

function parseStremioId(id) {
  const parts = String(id).split(":");
  return {
    imdbId: parts[0],
    season: parts[1] ? Number(parts[1]) : null,
    episode: parts[2] ? Number(parts[2]) : null
  };
}

/* ================= Subtitles Handler ================= */

builder.defineSubtitlesHandler(async ({ type, id }) => {
  console.log("🎬 Stremio request:", { type, id });

  const { imdbId, season, episode } = parseStremioId(id);
  console.log("🔎 Parsed:", { imdbId, season, episode });

  if (!API_KEY) return { subtitles: [] };

  // --- Search movie by IMDb ---
  const movies = await searchMovies({ apiKey: API_KEY, imdbId });

  console.log("📡 SubSource search result:", movies?.length);

  const first = movies?.[0];
  if (!first) return { subtitles: [] };

  const movieId = first.movieId;

  // --- Fetch subtitles list ---
  const subs = await getSubtitles({
    apiKey: API_KEY,
    movieId,
    season,
    episode
  });

  console.log("💬 SubSource subtitles found:", subs?.length);

  if (!subs || !subs.length) return { subtitles: [] };

  // --- Build Stremio subtitle entries ---
  const out = subs.map(s => {
    const sid = s.subtitleId;
    const langCode = toStremioLang(s.language || "eng");

    return {
      id: `subsource:${sid}:${langCode}`,
      lang: langCode,
      title: `${langCode.toUpperCase()} (SubSource)`,
      url: `${BASE_URL}/download/${sid}?lang=${langCode}`
    };
  });

  return { subtitles: out };
});

/* ================= Express Server ================= */

const app = express();

/* --- Manifest route --- */
app.get("/manifest.json", (req, res) => {
  res.setHeader("Content-Type", "application/json");
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.status(200).send(JSON.stringify(manifest));
});

/* --- Subtitles route for Stremio --- */
const addonInterface = builder.getInterface();

app.get("/subtitles/:type/:id.json", async (req, res) => {
  try {
    const result = await addonInterface.runSubtitlesHandler({
      type: req.params.type,
      id: req.params.id
    });
    res.json(result);
  } catch (err) {
    console.error("❌ Handler error:", err);
    res.json({ subtitles: [] });
  }
});

/* --- Subtitle download route --- */
app.get("/download/:subtitleId", async (req, res) => {
  try {
    const subtitleId = req.params.subtitleId;
    const lang = String(req.query.lang || "eng");

    console.log("⬇️ Download request:", subtitleId, lang);

    const zipBuf = await downloadSubtitleZip({
      apiKey: API_KEY,
      subtitleId
    });

    const best = extractBestTextSubtitleFromZip(zipBuf, {
      preferPatterns: [lang]
    });

    if (!best) {
      res.status(404).send("No subtitle file in archive");
      return;
    }

    const lower = best.name.toLowerCase();
    const contentType =
      lower.endsWith(".vtt")
        ? "text/vtt; charset=utf-8"
        : "application/x-subrip; charset=utf-8";

    res.setHeader("Content-Type", contentType);
    res.send(best.data);

  } catch (err) {
    console.error("❌ Download error:", err.message);
    res.status(500).send("Subtitle download failed");
  }
});

/* --- Start server --- */
app.listen(PORT, "0.0.0.0", () => {
  console.log("✅ Server running on port", PORT);
  console.log("🌍 Manifest:", `${BASE_URL}/manifest.json`);
});
