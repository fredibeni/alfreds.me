// Clean a UN "Urban Agglomeration" label down to a single English city name.
//
// The source data uses several messy conventions:
//   "Tokyo"                              -> plain
//   "Al-Qahirah (Cairo)"                 -> Local (English exonym)  -> Cairo
//   "Mumbai (Bombay)"                    -> Current (old English)   -> Mumbai
//   "Guangzhou, Guangdong"               -> City, Province          -> Guangzhou
//   "Kinki M.M.A. (Osaka)"               -> Metro label (Core)      -> Osaka
//
// Strategy: a curated override map handles the ambiguous / metro-area cases for the
// top cities; everything else falls through to a heuristic.

// Raw label (exactly as in the spreadsheet) -> desired English name.
export const NAME_OVERRIDES = {
  "Mumbai (Bombay)": "Mumbai",
  "Kolkata (Calcutta)": "Kolkata",
  "Chennai (Madras)": "Chennai",
  "Bangalore": "Bangalore",
  "Al-Qahirah (Cairo)": "Cairo",
  "Ciudad de México (Mexico City)": "Mexico City",
  "Kinki M.M.A. (Osaka)": "Osaka",
  "Chukyo M.M.A. (Nagoya)": "Nagoya",
  "Kitakyushu-Fukuoka M.M.A.": "Fukuoka",
  "Shizuoka-Hamamatsu M.M.A.": "Shizuoka",
  "Pune (Poona)": "Pune",
  "Kozhikode (Calicut)": "Kozhikode",
  "Ürümqi (Wulumqi)": "Urumqi",
  "Haerbin": "Harbin",
  "Hà Noi": "Hanoi",
  "Ji'nan, Shandong": "Jinan",
  "Sana'a'": "Sanaa",
  "Pôrto Alegre": "Porto Alegre",
  "Ahmadabad": "Ahmedabad",
  "P'yongyang": "Pyongyang",
  "Krung Thep (Bangkok)": "Bangkok",
  "Thành Pho Ho Chí Minh (Ho Chi Minh City)": "Ho Chi Minh City",
  "Moskva (Moscow)": "Moscow",
  "New York-Newark": "New York",
  "Los Angeles-Long Beach-Santa Ana": "Los Angeles",
  "Dallas-Fort Worth": "Dallas",
  "San Francisco-Oakland": "San Francisco",
  "Bruxelles-Brussel": "Brussels",
  "Buenos Aires": "Buenos Aires",
  "Al-Iskandariyah (Alexandria)": "Alexandria",
  "Ar-Riyadh (Riyadh)": "Riyadh",
  "Jiddah (Jeddah)": "Jeddah",
  "Roma (Rome)": "Rome",
  "Milano (Milan)": "Milan",
  "Napoli (Naples)": "Naples",
  "Torino (Turin)": "Turin",
  "München (Munich)": "Munich",
  "Köln (Cologne)": "Cologne",
  "Wien (Vienna)": "Vienna",
  "Praha (Prague)": "Prague",
  "Warszawa (Warsaw)": "Warsaw",
  "Lisboa (Lisbon)": "Lisbon",
  "Sevilla (Seville)": "Seville",
  "København (Copenhagen)": "Copenhagen",
  "Bucuresti (Bucharest)": "Bucharest",
  "Beograd (Belgrade)": "Belgrade",
  "Athínai (Athens)": "Athens",
  "Kyiv (Kiev)": "Kyiv",
  "Kharkiv (Kharkov)": "Kharkiv",
};

// Cases where "A (B)" should keep A (B is a demoted/old spelling).
const KEEP_PRIMARY = new Set([
  "Mumbai", "Kolkata", "Chennai", "Kyiv", "Kharkiv",
]);

function stripProvince(s) {
  // "Guangzhou, Guangdong" -> "Guangzhou"; "Xi'an, Shaanxi" -> "Xi'an"
  const i = s.indexOf(",");
  return i === -1 ? s : s.slice(0, i).trim();
}

export function cleanCityName(raw) {
  const label = String(raw).trim();
  if (NAME_OVERRIDES[label]) return NAME_OVERRIDES[label];

  let s = stripProvince(label);

  const m = s.match(/^(.*?)\s*\((.+?)\)\s*$/);
  if (m) {
    const primary = m[1].trim();
    const paren = m[2].trim();
    // Metro-area noise in the primary -> prefer parenthetical core city.
    if (KEEP_PRIMARY.has(primary)) return primary;
    return paren; // the parenthetical is usually the English exonym
  }
  return s;
}

// A normalized key for fuzzy matching against Numbeo etc. (accent/case/space-insensitive).
export function normKey(name) {
  return String(name)
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "") // strip diacritics
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}
