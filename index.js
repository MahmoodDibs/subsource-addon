import "dotenv/config";
import express from "express";
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

// ✅ Dynamic Configuration for Render vs Localhost
const PORT = process.env.PORT || 7000;
const BASE_URL = process.env.BASE_URL || `http://127.0.0.1:${PORT}`;

/* ===== Manifest ===== */

const manifest = {
  id: "community.subsource.subtitles",
  version: "1.0.1", // Bumped version
  name: "SubSource Subtitles",
  description: "Subtitles from SubSource API",
  
  // ✅ Logo pointing to your static file
  logo: `${BASE_URL}/logo.png`, 
  
  resources: ["subtitles"],
  types: ["movie", "series"],
  catalogs: [],
  idPrefixes: ["tt"]
};

const builder = new addonBuilder(manifest);

/* ===== Helper ===== */

function parseStremioId(id) {
  const parts = String(id).split(":");
  return {
    imdbId: parts[0],
    season: parts[1] ? Number(parts[1]) : null,
    episode: parts[2] ? Number(parts[2]) : null
  };
}

/* ===== Subtitles Handler ===== */

builder.defineSubtitlesHandler(async ({ type, id }) => {
  console.log("🎬 Request:", type, id);

  if (!API_KEY) {
    console.error("❌ Missing SUBSOURCE_API_KEY");
    return { subtitles: [] };
  }

  const { imdbId, season, episode } = parseStremioId(id);
  
  // 1. Search for the movie/show
  const movies = await searchMovies({ apiKey: API_KEY, imdbId });
  const first = movies?.[0];
  
  if (!first) return { subtitles: [] };

  const movieId = first.movieId;

  // 2. Get subtitle list
  const subs = await getSubtitles({
    apiKey: API_KEY,
    movieId,
    season,
    episode
  });

  console.log("💬 Subtitles found:", subs?.length || 0);

  if (!subs || !subs.length) return { subtitles: [] };

  // 3. Format for Stremio
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

  return { subtitles: out };
});

/* ===== SERVER SETUP (Express) ===== */

const app = express();

// 1. Serve Static Files (For logo.png)
// Create a folder named "public" and put logo.png inside it
app.use(express.static("public"));

// 2. CORS Middleware
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

// 3. Download Route (Defined BEFORE the addon router)
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

        // ✅ Critical Headers for Stremio
        res.writeHead(200, {
            "Content-Type": contentType,
            "Content-Length": best.data.length, // Send explicit byte length
            "Access-Control-Allow-Origin": "*",
            "Cache-Control": "public, max-age=86400",
            "Content-Disposition": `inline; filename="${best.name}"`
        });

        console.log(`✅ Sending: ${best.name} (${best.data.length} bytes)`);
        
        // ✅ Send RAW buffer (Prevents encoding corruption)
        res.end(best.data);

    } catch (err) {
        console.error("❌ Download Error:", err.message);
        if (!res.headersSent) res.status(500).send("Download failed");
    }
});

// 4. Stremio Addon Interface
const addonInterface = builder.getInterface();
const addonRouter = getRouter(addonInterface);
app.use(addonRouter);

// 5. Start Server
app.listen(PORT, () => {
    console.log(`🚀 Server running at ${BASE_URL}`);
    console.log(`🌍 Manifest URL: ${BASE_URL}/manifest.json`);
});