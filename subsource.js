import fetch from "node-fetch";
import AdmZip from "adm-zip";

/**
 * SubSource API base URL is documented as:
 * https://api.subsource.net/api/v1  (API docs)
 */
const API_BASE = "https://api.subsource.net/api/v1";

/**
 * NOTE:
 * The public API docs list endpoints like:
 * - GET /movies/search
 * - GET /movies/{id}
 * - GET /subtitles
 * - GET /subtitles/{id}
 * and we know download endpoint works:
 * - GET /subtitles/{id}/download  (returns ZIP)
 *
 * This implementation assumes typical query params:
 * - /movies/search?query=...&year=...&imdbId=...
 * - /subtitles?movieId=...&season=...&episode=...&language=...
 *
 * If SubSource uses slightly different param names in your account/version,
 * you only need to adjust the query building in `searchMovies()` and `getSubtitles()`.
 */

function authHeaders(apiKey) {
  return {
    "X-API-Key": apiKey,
    "Accept": "application/json"
  };
}

async function getJson(url, apiKey) {
  const res = await fetch(url, { headers: authHeaders(apiKey) });
  const text = await res.text();
  if (!res.ok) throw new Error(`SubSource API ${res.status}: ${text.slice(0, 300)}`);
  return JSON.parse(text);
}

export async function searchMovies({ apiKey, query, imdbId }) {
  const u = new URL(`${API_BASE}/movies/search`);

  if (imdbId) {
    u.searchParams.set("searchType", "imdb");
    u.searchParams.set("imdb", imdbId);
  } else {
    u.searchParams.set("searchType", "text");
    u.searchParams.set("q", query);
  }

  const data = await getJson(u.toString(), apiKey);

  // Real API shape:
  if (data.success && Array.isArray(data.data)) {
    return data.data;
  }

  return [];
}


export async function getSubtitles({ apiKey, movieId, season, episode }) {
  const u = new URL(`${API_BASE}/subtitles`);
  u.searchParams.set("movieId", movieId);

  // (season / episode only used for series — harmless if null)
  if (season) u.searchParams.set("season", season);
  if (episode) u.searchParams.set("episode", episode);

  const data = await getJson(u.toString(), apiKey);

  if (data.success && Array.isArray(data.data)) {
    return data.data;
  }

  return [];
}

export async function downloadSubtitleZip({ apiKey, subtitleId }) {
  // Known working endpoint:
  // GET https://api.subsource.net/api/v1/subtitles/{id}/download
  const url = `${API_BASE}/subtitles/${subtitleId}/download`;
  const res = await fetch(url, { headers: { "X-API-Key": apiKey } });

  if (!res.ok) {
    const txt = await res.text().catch(() => "");
    throw new Error(`Download failed ${res.status}: ${txt.slice(0, 300)}`);
  }

  const buf = Buffer.from(await res.arrayBuffer());
  return buf;
}

export function extractBestTextSubtitleFromZip(zipBuffer, { preferPatterns = [] } = {}) {
  const zip = new AdmZip(zipBuffer);
  const entries = zip.getEntries()
    .filter(e => !e.isDirectory)
    .map(e => ({
      name: e.entryName,
      lower: e.entryName.toLowerCase(),
      data: e.getData()
    }))
    .filter(e => e.lower.endsWith(".srt") || e.lower.endsWith(".vtt") || e.lower.endsWith(".ass"));

  if (!entries.length) return null;

  // 1) Prefer entries matching patterns (like S01E02)
  if (preferPatterns.length) {
    for (const p of preferPatterns) {
      const hit = entries.find(e => e.lower.includes(p.toLowerCase()));
      if (hit) return hit;
    }
  }

  // 2) Prefer .srt then .vtt then .ass
  const score = (e) =>
    e.lower.endsWith(".srt") ? 3 :
    e.lower.endsWith(".vtt") ? 2 :
    e.lower.endsWith(".ass") ? 1 : 0;

  entries.sort((a, b) => score(b) - score(a));
  return entries[0];
}
