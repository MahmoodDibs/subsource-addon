import "dotenv/config";
import express from "express";
import { addonBuilder } from "stremio-addon-sdk";

import {
  searchMovies,
  getSubtitles,
  downloadSubtitleZip,
  extractBestTextSubtitleFromZip
} from "./subsource.js";

import { toStremioLang } from "./language.js";

const API_KEY = process.env.SUBSOURCE_API_KEY;
const PORT = Number(process.env.PORT || 10000);
const BASE_URL = process.env.RENDER_EXTERNAL_URL || `http://127.0.0.1:${PORT}`;

/* ================= Manifest ================= */

const manifest = {
  id: "community.subsource.subtitles",
  version: "1.0.4",
  name: "SubSource Subtitles",
  description: "External subtitles from SubSource API",
  resources: ["subtitles"],
  types: ["movie", "series"],
  catalogs: [],
  idPrefixes: ["tt"]
};

const builder = new addonBuilder(manifest);

/* ================= Utilities ================= */

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
  console.log("🎬 Stremio request:", type, id);

  if (!API_KEY) {
    console.error("❌ Missing API key");
    return { subtitles: [] };
  }

  const { imdbId, season, episode } = parseStremioId(id);
  console.log("🔎 Parsed ID:", { imdbId, season, episode });

  const movies = await searchMovies({ apiKey: API_KEY, imdbId });
  console.log("📡 Search results:", movies?.length || 0);

  const first = movies?.[0];
  if (!first) return { subtitles: [] };

  const movieId = first.movieId;

  const subs = await getSubtitles({
    apiKey: API_KEY,
    movieId,
    season,
    episode
  });

  console.log("💬 Subtitles found:", subs?.length || 0);

  if (!subs || !subs.length) return { subtitles: [] };

  const out = subs.map(s => {
    const sid = s.subtitleId;
    const lang = toStremioLang(s.language || "eng");

    return {
      id: `subsource:${sid}:${lang}`,
      lang,
      title: `${lang.toUpperCase()} (SubSource)`,
      url: `${BASE_URL}/download/${sid}?lang=${lang}`
    };
  });

  console.log("📤 Returning subtitles:", out.length);

  return { subtitles: out };
});

/* ================= Express ================= */

const app = express();

/* ---- Log all incoming ---- */
app.use((req, res, next) => {
  console.log("🌐 Incoming:", req.method, req.url);
  next();
});

/* ---- Mount Stremio SDK ---- */
const addonInterface = builder.getInterface();
app.use(addonInterface);

/* ---- Manifest ---- */
app.get("/manifest.json", (req, res) => {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.json(manifest);
});

/* ---- Subtitle download ---- */
app.get("/download/:subtitleId", async (req, res) => {
  try {
    const subtitleId = req.params.subtitleId;
    const lang = String(req.query.lang || "eng");

    console.log("⬇️ Download:", subtitleId, lang);

    const zipBuf = await downloadSubtitleZip({
      apiKey: API_KEY,
      subtitleId
    });

    const best = extractBestTextSubtitleFromZip(zipBuf, {
      preferPatterns: [lang]
    });

    if (!best) {
      res.status(404).send("No subtitle in archive");
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

/* ---- Start ---- */
app.listen(PORT, "0.0.0.0", () => {
  console.log("✅ Server running on", PORT);
  console.log("🌍 Manifest:", `${BASE_URL}/manifest.json`);
});
