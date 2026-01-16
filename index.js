import "dotenv/config";
import express from "express";
import StremioSDK from "stremio-addon-sdk";
import AdmZip from "adm-zip"; 

import {
  searchMovies,
  getSubtitles,
  downloadSubtitleZip
} from "./subsource.js";

import { toStremioLang } from "./language.js";

const { addonBuilder, getRouter } = StremioSDK;

const API_KEY = process.env.SUBSOURCE_API_KEY;
const PORT = process.env.PORT || 7000;
const BASE_URL = process.env.BASE_URL || `http://127.0.0.1:${PORT}`;

// 📊 Global Stats
let downloadStats = {
    total: 0,
    startTime: new Date().toLocaleString("en-US", { timeZone: "UTC" })
};

/* ===== Manifest ===== */

const manifest = {
  id: "community.subsource.subtitles",
  version: "1.1.1", 
  name: "SubSource Subtitles",
  description: "Advanced subtitles from SubSource API",
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

  // 1. Search for movie
  const movies = await searchMovies({ apiKey: API_KEY, imdbId });
  const first = movies?.[0];
  if (!first) return { subtitles: [] };

  // 2. Get Subtitle List
  const subs = await getSubtitles({
    apiKey: API_KEY,
    movieId: first.movieId,
    season,
    episode
  });

  if (!subs || !subs.length) return { subtitles: [] };

  // 3. Process Subtitles
  const topSubs = subs.slice(0, 3);
  const allStreams = [];

  await Promise.all(topSubs.map(async (sub) => {
    try {
        const zipBuf = await downloadSubtitleZip({ apiKey: API_KEY, subtitleId: sub.subtitleId });
        const zip = new AdmZip(zipBuf);
        const zipEntries = zip.getEntries();

        // Calculate language ONCE here (outside the file loop if it applies to the whole zip, 
        // OR inside if you prefer. Here we do it inside to be safe).
        
        zipEntries.forEach((entry, index) => {
            if (entry.isDirectory) return;
            
            const lowerName = entry.entryName.toLowerCase();
            
            if (lowerName.endsWith(".srt") || lowerName.endsWith(".vtt")) {
                
                // ✅ FIXED: Only declared ONCE here
                const lang = toStremioLang(sub.language);
                
                let tags = [];
                if (lowerName.includes("hi") || lowerName.includes("sdh")) tags.push("HI");
                if (lowerName.includes("forced")) tags.push("Forced");
                if (lowerName.includes("bluray")) tags.push("BluRay");
                
                const tagStr = tags.length ? ` [${tags.join(' ')}]` : "";

                allStreams.push({
                    id: `subsource:${sub.subtitleId}:${lang}:${index}`,
                    lang: lang,
                    title: `📄 ${entry.entryName}${tagStr} (SubSource)`,
                    url: `${BASE_URL}/download/${sub.subtitleId}/${index}?lang=${lang}`
                });
            }
        });
    } catch (e) {
        console.error(`⚠️ Failed to parse zip for ${sub.subtitleId}:`, e.message);
    }
  }));

  return { subtitles: allStreams };
});

/* ===== SERVER SETUP ===== */

const app = express();

app.use(express.static("public"));

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

app.get("/", (req, res) => {
    res.send(`
        <!DOCTYPE html>
        <html>
        <head><title>SubSource Status</title></head>
        <body style="background:#111;color:#fff;font-family:sans-serif;text-align:center;padding:50px;">
            <img src="/logo.png" width="80">
            <h1>SubSource Server Online</h1>
            <p>Downloads: ${downloadStats.total}</p>
        </body>
        </html>
    `);
});

app.get("/download/:subtitleId/:fileIndex", async (req, res) => {
    try {
        const { subtitleId, fileIndex } = req.params;
        downloadStats.total++;

        const zipBuf = await downloadSubtitleZip({ apiKey: API_KEY, subtitleId });
        const zip = new AdmZip(zipBuf);
        const entries = zip.getEntries();
        const selectedEntry = entries[parseInt(fileIndex)];

        if (!selectedEntry) return res.status(404).send("File not found");

        const lower = selectedEntry.entryName.toLowerCase();
        const contentType = lower.endsWith(".vtt") ? "text/vtt; charset=utf-8" : "text/plain; charset=utf-8";

        res.writeHead(200, {
            "Content-Type": contentType,
            "Content-Length": selectedEntry.header.size,
            "Access-Control-Allow-Origin": "*",
            "Cache-Control": "public, max-age=86400",
            "Content-Disposition": `inline; filename="${selectedEntry.entryName}"`
        });
        
        res.end(selectedEntry.getData());

    } catch (err) {
        console.error("❌ Download Error:", err.message);
        if (!res.headersSent) res.status(500).send("Download failed");
    }
});

const addonInterface = builder.getInterface();
const addonRouter = getRouter(addonInterface);
app.use(addonRouter);

app.listen(PORT, () => {
    console.log(`🚀 Server running at ${BASE_URL}`);
});