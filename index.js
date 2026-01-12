import "dotenv/config";
import express from "express";
import cors from "cors";
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
const PORT = Number(process.env.PORT || 7000);
const BASE_URL =
  process.env.RENDER_EXTERNAL_URL || `http://127.0.0.1:${PORT}`;

/* ================= Manifest ================= */

const manifest = {
  id: "community.subsource.subtitles",
  version: "1.0.4",
  name: "SubSource Subtitles",
  description: "Subtitles from SubSource API",
  resources: ["subtitles"],
  types: ["movie", "series"],
  catalogs: [],
  idPrefixes: ["tt"]
};

const builder = new addonBuilder(manifest);

/* ================= Express App ================= */

const app = express();

/* --- CORS --- */
app.use(cors());

/* --- Global Request Logger --- */
app.use((req, res, next) => {
  console.log("🌐 Incoming request:", req.method, req.url);
  next();
});

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
  console.log("🎬 Subtitles handler triggered:", { type, id });

  const { imdbId, season, episode } = parseStremioId(id);
  console.log("🔎 Parsed ID:", { imdbId, season, episode });

  if (!API_KEY) {
    console.log("❌ Missing API KEY");
    return { subtitles: [] };
  }

  try {
    /* --- Search movie --- */
    const movies = await searchMovies({ apiKey: API_KEY, imdbId });
    console.log("📡 SubSource search results:", movies?.length || 0);

    const first = movies?.[0];
    if (!first) {
      console.log("⚠️ No movie found on SubSource");
      return { subtitles: [] };
    }

    const movieId = first.movieId;

    /* --- Fetch subtitles list --- */
    const subs = await getSubtitles({
      apiKey: API_KEY,
      movieId,
      season,
      episode
    });

    console.log("💬 Subtitles found:", subs?.length || 0);

    if (!subs || !subs.length) return { subtitles: [] };

    /* --- Build Stremio subtitle entries --- */
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

    console.log("✅ Returning subtitles to Stremio:", out.length);
    return { subtitles: out };

  } catch (err) {
    console.log("❌ Handler error:", err.message);
    return { subtitles: [] };
  }
});

/* ================= Routes ================= */

const addonInterface = builder.getInterface();

/* --- Manifest --- */
app.get("/manifest.json", (req, res) => {
  console.log("📜 Manifest requested");
  res.setHeader("Content-Type", "application/json");
  res.status(200).send(JSON.stringify(manifest));
});

/* --- Subtitles Endpoint --- */
app.get("/subtitles/:type/:id.json", async (req, res) => {
  console.log("➡️ /subtitles route hit");
  try {
    const result = await addonInterface.runSubtitlesHandler({
      type: req.params.type,
      id: req.params.id
    });
    res.json(result);
  } catch (err) {
    console.log("❌ Subtitles route error:", err.message);
    res.json({ subtitles: [] });
  }
});

/* --- Subtitle Download --- */
app.get("/download/:subtitleId", async (req, res) => {
  console.log("⬇️ /download route hit");

  try {
    const subtitleId = req.params.subtitleId;
    const lang = String(req.query.lang || "eng");

    console.log("📥 Downloading subtitle:", subtitleId, "lang:", lang);

    const zipBuf = await downloadSubtitleZip({
      apiKey: API_KEY,
      subtitleId
    });

    const best = extractBestTextSubtitleFromZip(zipBuf, {
      preferPatterns: [lang]
    });

    if (!best) {
      console.log("⚠️ No text subtitle inside zip");
      return res.status(404).send("No subtitle found");
    }

    const lower = best.name.toLowerCase();
    const contentType =
      lower.endsWith(".vtt")
        ? "text/vtt; charset=utf-8"
        : "application/x-subrip; charset=utf-8";

    res.setHeader("Content-Type", contentType);
    res.send(best.data);

    console.log("✅ Subtitle delivered:", best.name);

  } catch (err) {
    console.log("❌ Download error:", err.message);
    res.status(500).send("Subtitle download failed");
  }
});

/* ================= Start Server ================= */

app.listen(PORT, "0.0.0.0", () => {
  console.log("🚀 Server running on port", PORT);
  console.log("🌍 Manifest URL:", `${BASE_URL}/manifest.json`);
});
