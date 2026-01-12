// Minimal language normalization for Stremio "lang" field.
// Stremio commonly accepts ISO-639-2 (3-letter) like "eng", "ara", "tur".

const MAP_2_TO_3 = {
  en: "eng",
  ar: "ara",
  tr: "tur",
  fr: "fra",
  es: "spa",
  de: "deu",
  it: "ita",
  ru: "rus",
  nl: "nld",
  pt: "por",
  fa: "fas",
  ur: "urd",
  hi: "hin",
  id: "ind",
  ms: "msa",
  pl: "pol",
  ro: "ron",
  sv: "swe",
  no: "nor",
  da: "dan",
  fi: "fin",
  el: "ell",
  he: "heb",
  uk: "ukr",
  vi: "vie",
  zh: "zho",
  ja: "jpn",
  ko: "kor"
};

export function toStremioLang(lang) {
  if (!lang) return "eng";
  const s = String(lang).trim().toLowerCase();

  // already 3 letters
  if (/^[a-z]{3}$/.test(s)) return s;

  // common 2 letters
  if (MAP_2_TO_3[s]) return MAP_2_TO_3[s];

  // try things like "english" -> eng
  if (s.startsWith("eng")) return "eng";
  if (s.startsWith("arab")) return "ara";
  if (s.startsWith("tur")) return "tur";
  if (s.startsWith("fre") || s.startsWith("fra") || s.includes("french")) return "fra";
  if (s.startsWith("spa") || s.includes("spanish")) return "spa";

  return "eng";
}
