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
const PORT = Number(process.env.PORT || 7000);
const BASE_URL = `http://localhost:${PORT}`;

/* ---------------- Manifest ---------------- */

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

/* ---------------- Helpers ---------------- */

function parseStremioId(type, id) {
  const parts = String(id).split(":");
  return {
    imdbId: parts[0],
    season: parts[1] ? Number(parts[1]) : null,
    episode: parts[2] ? Number(parts[2]) : null
  };
}

/* ---------------- Subtitles Handler ---------------- */

builder.defineSubtitlesHandler(async ({ type, id }) => {
  const { imdbId, season, episode } = parseStremioId(type, id);

  const movies = await searchMovies({ apiKey: API_KEY, imdbId });
  const first = movies?.[0];
  if (!first) return { subtitles: [] };

  const movieId = first.movieId;
  if (!movieId) return { subtitles: [] };

  const subs = await getSubtitles({ apiKey: API_KEY, movieId, season, episode });

  const out = (subs || []).map(s => {
    const sid = s.subtitleId;
    if (!sid) return null;

    const langCode = toStremioLang(s.language || "en");

    return {
      id: `subsource:${sid}:${langCode}`,
      lang: langCode,
      title: `${langCode.toUpperCase()} (SubSource)`,
      url: `${BASE_URL}/download/${sid}?lang=${langCode}`
    };
  }).filter(Boolean);

  return { subtitles: out };
});

/* ---------------- Express App ---------------- */

const app = express();

/* Log requests (optional) */
app.use((req, res, next) => {
  console.log("➡️", req.method, req.url);
  next();
});

/* Manifest route */
app.get("/manifest.json", (req, res) => {
  res.json(manifest);
});

/* Subtitles route */
const addonInterface = builder.getInterface();

app.get("/subtitles/:type/:id.json", async (req, res) => {
  const result = await addonInterface.runSubtitlesHandler({
    type: req.params.type,
    id: req.params.id
  });
  res.json(result);
});

/* Download route */
app.get("/download/:subtitleId", async (req, res) => {
  try {
    const subtitleId = req.params.subtitleId;
    const lang = String(req.query.lang || "eng");

    const zipBuf = await downloadSubtitleZip({ apiKey: API_KEY, subtitleId });

    const best = extractBestTextSubtitleFromZip(zipBuf, {
      preferPatterns: [lang]
    });

    if (!best) {
      res.status(404).send("No subtitle in archive");
      return;
    }

    const lower = best.name.toLowerCase();
    const contentType =
      lower.endsWith(".vtt") ? "text/vtt; charset=utf-8" :
      "application/x-subrip; charset=utf-8";

    res.setHeader("Content-Type", contentType);
    res.send(best.data);

  } catch (err) {
    console.error("Download error:", err.message);
    res.status(500).send("Subtitle download failed");
  }
});

/* Start server */
app.listen(PORT, "0.0.0.0", () => {
  console.log("Server running on port", PORT);
});