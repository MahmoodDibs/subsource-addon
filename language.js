// Master mapping of [Name/Code] -> [Stremio 3-Letter Code]
// Stremio prefers ISO 639-2 codes (e.g., "tur", "ara", "eng")
const LANG_MAP = {
    // Common Languages
    "arabic": "ara", "ar": "ara", "ara": "ara",
    "english": "eng", "en": "eng", "eng": "eng",
    "turkish": "tur", "tr": "tur", "tur": "tur",
    "spanish": "spa", "es": "spa", "spa": "spa",
    "french": "fre", "fr": "fre", "fre": "fre", "fra": "fre",
    "german": "ger", "de": "ger", "ger": "ger", "deu": "ger",
    "italian": "ita", "it": "ita", "ita": "ita",
    "portuguese": "por", "pt": "por", "por": "por",
    "russian": "rus", "ru": "rus", "rus": "rus",
    
    // Asian / Others
    "japanese": "jpn", "ja": "jpn", "jpn": "jpn",
    "korean": "kor", "ko": "kor", "kor": "kor",
    "chinese": "chi", "zh": "chi", "chi": "chi", "zho": "chi",
    "mandarin": "chi",
    "vietnamese": "vie", "vi": "vie", "vie": "vie",
    "thai": "tha", "th": "tha", "tha": "tha",
    "indonesian": "ind", "id": "ind", "ind": "ind",
    "malay": "msa", "ms": "msa", "msa": "msa",
    "hindi": "hin", "hi": "hin", "hin": "hin",
    
    // European / Others
    "dutch": "dut", "nl": "dut", "dut": "dut", "nld": "dut",
    "polish": "pol", "pl": "pol", "pol": "pol",
    "romanian": "rum", "ro": "rum", "rum": "rum", "ron": "rum",
    "greek": "gre", "el": "gre", "gre": "gre", "ell": "gre",
    "czech": "cze", "cs": "cze", "cze": "cze", "ces": "cze",
    "hungarian": "hun", "hu": "hun", "hun": "hun",
    "swedish": "swe", "sv": "swe", "swe": "swe",
    "norwegian": "nor", "no": "nor", "nor": "nor",
    "danish": "dan", "da": "dan", "dan": "dan",
    "finnish": "fin", "fi": "fin", "fin": "fin",
    "ukrainian": "ukr", "uk": "ukr", "ukr": "ukr",
    "hebrew": "heb", "he": "heb", "heb": "heb",
    "persian": "per", "fa": "per", "per": "per", "fas": "per", "farsi": "per",
    "croatian": "hrv", "hr": "hrv", "hrv": "hrv", "scr": "hrv",
    "serbian": "srp", "sr": "srp", "srp": "srp", "scc": "srp",
    "bulgarian": "bul", "bg": "bul", "bul": "bul",
    
    // Add specific Brazilian Portuguese if needed
    "brazilian": "pob", "pt-br": "pob", "pob": "pob"
};

export function toStremioLang(lang) {
    if (!lang) return "eng";
    
    // 1. Clean the input (remove spaces, lowercase)
    const s = String(lang).trim().toLowerCase();

    // 2. Check the Master Map (Fastest)
    if (LANG_MAP[s]) {
        return LANG_MAP[s];
    }

    // 3. Fallback: If it looks like a code (2 or 3 letters), return it as is
    // This catches obscure languages we missed in the map
    if (s.length === 3) return s; 
    if (s.length === 2) return s; // Stremio tries to handle 2-letter codes too

    // 4. Fuzzy Matches (for messy API data like "Spanish (Latin)")
    if (s.includes("spani")) return "spa";
    if (s.includes("portu")) return "por";
    if (s.includes("brazi")) return "pob";
    if (s.includes("frenc")) return "fre";
    if (s.includes("arab")) return "ara";
    if (s.includes("turk")) return "tur";
    if (s.includes("germ")) return "ger";

    // 5. Final Default
    return "eng";
}