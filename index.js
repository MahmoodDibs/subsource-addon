import "dotenv/config";
import express from "express"; // Import Express
import StremioSDK from "stremio-addon-sdk";
import {
  searchMovies,
  getSubtitles,
  downloadSubtitleZip,
  extractBestTextSubtitleFromZip
} from "./subsource.js";
import { toStremioLang } from "./language.js";

const { addonBuilder, getRouter } = StremioSDK;

const API_KEY = process.env.SUBSOURCE_API_KEY;
const PORT = process.env.PORT || 7000;
const BASE_URL = process.env.BASE_URL || `http://127.0.0.1:${PORT}`;

/* ===== Manifest ===== */
const manifest = {
  id: "community.subsource.subtitles",
  version: "1.0.0",
  name: "SubSource Subtitles (Local)",
  description: "Subtitles from SubSource API",
  resources: ["subtitles"],
  types: ["movie", "series"],
  catalogs: [],
  idPrefixes: ["tt"]
};

const builder = new addonBuilder(manifest);

/* ===== Subtitles Logic ===== */
function parseStremioId(id) {
  const parts = String(id).split(":");
  return {
    imdbId: parts[0],
    season: parts[1] ? Number(parts[1]) : null,
    episode: parts[2] ? Number(parts[2]) : null
  };
}

builder.defineSubtitlesHandler(async ({ type, id }) => {
  console.log("🎬 Request:", type, id);

  if (!API_KEY) {
    console.error("❌ Missing SUBSOURCE_API_KEY");
    return { subtitles: [] };
  }

  const { imdbId, season, episode } = parseStremioId(id);
  const movies = await searchMovies({ apiKey: API_KEY, imdbId });
  const first = movies?.[0];
  
  if (!first) return { subtitles: [] };

  const movieId = first.movieId;
  const subs = await getSubtitles({ apiKey: API_KEY, movieId, season, episode });

  console.log("💬 Subtitles found:", subs?.length || 0);

  if (!subs || !subs.length) return { subtitles: [] };

  return { 
    subtitles: subs.map(s => {
      const sid = s.subtitleId;
      const lang = toStremioLang(s.language || "eng");
      return {
        id: `subsource:${sid}:${lang}`,
        lang,
        title: `${lang.toUpperCase()} (SubSource)`,
        url: `${BASE_URL}/download/${sid}?lang=${lang}`
      };
    }) 
  };
});

/* ===== SERVER SETUP (Express) ===== */
const app = express();

// 1. CORS Middleware (Essential for Stremio Web)
app.use((req, res, next) => {
    res.setHeader("Access-Control-Allow-Origin", "*");
    res.setHeader("Access-Control-Allow-Headers", "*");
    res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
    if (req.method === 'OPTIONS') {
        res.writeHead(204);
        res.end();
        return;
    }
    next();
});

// 2. Custom Download Route (Defined BEFORE the addon)
app.get("/download/:subtitleId", async (req, res) => {
    try {
        const { subtitleId } = req.params;
        const lang = req.query.lang || "eng";
        
        console.log(`⬇️  Processing Download: ${subtitleId} (${lang})`);

        const zipBuf = await downloadSubtitleZip({ apiKey: API_KEY, subtitleId });
        
        const best = extractBestTextSubtitleFromZip(zipBuf, { preferPatterns: [lang] });

        if (!best) {
            console.log("❌ No subtitle found in zip");
            res.status(404).send("No subtitle found");
            return;
        }

        const lower = best.name.toLowerCase();
        const contentType = lower.endsWith(".vtt") 
            ? "text/vtt; charset=utf-8" 
            : "text/plain; charset=utf-8";

        // Send Headers
        res.writeHead(200, {
            "Content-Type": contentType,
            "Content-Length": best.data.length,
            "Access-Control-Allow-Origin": "*",
            "Cache-Control": "public, max-age=86400",
            "Content-Disposition": `inline; filename="${best.name}"`
        });

        console.log(`✅ Sending: ${best.name} (${best.data.length} bytes)`);
        
        // Send RAW buffer (Fixes encoding issues)
        res.end(best.data);

    } catch (err) {
        console.error("❌ Download Error:", err.message);
        if (!res.headersSent) res.status(500).send("Download failed");
    }
});

// 3. Mount Stremio Addon (Handles /manifest.json etc.)
const addonInterface = builder.getInterface();
const addonRouter = getRouter(addonInterface);
app.use(addonRouter);

// 4. Start Server
app.listen(PORT, () => {
    console.log(`🚀 Server running at http://127.0.0.1:${PORT}`);
    console.log(`🌍 Manifest URL: http://127.0.0.1:${PORT}/manifest.json`);
});