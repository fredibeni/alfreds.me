// Country name handling: the UN spreadsheet uses long-form names (and occasionally a bare
// numeric ISO code), while Wikipedia's tax table and the world GeoJSON use other spellings.
// We normalise everything to a comparable key and keep a numeric-ISO -> canonical-name map
// for the rows where the name column is just a code.

export const ISO_NUMERIC_TO_NAME = {
  "4": "Afghanistan", "12": "Algeria", "24": "Angola", "32": "Argentina",
  "36": "Australia", "40": "Austria", "50": "Bangladesh", "56": "Belgium",
  "68": "Bolivia", "76": "Brazil", "100": "Bulgaria", "104": "Myanmar",
  "108": "Burundi", "116": "Cambodia", "120": "Cameroon", "124": "Canada",
  "144": "Sri Lanka", "152": "Chile", "156": "China", "170": "Colombia",
  "178": "Congo", "180": "Democratic Republic of the Congo", "191": "Croatia",
  "192": "Cuba", "203": "Czech Republic", "208": "Denmark",
  "214": "Dominican Republic", "218": "Ecuador", "818": "Egypt",
  "222": "El Salvador", "231": "Ethiopia", "246": "Finland", "250": "France",
  "268": "Georgia", "276": "Germany", "288": "Ghana", "300": "Greece",
  "320": "Guatemala", "324": "Guinea", "340": "Honduras",
  "344": "Hong Kong", "348": "Hungary", "356": "India", "360": "Indonesia",
  "364": "Iran", "368": "Iraq", "372": "Ireland", "376": "Israel",
  "380": "Italy", "384": "Ivory Coast", "392": "Japan", "400": "Jordan",
  "398": "Kazakhstan", "404": "Kenya", "408": "North Korea", "410": "South Korea",
  "414": "Kuwait", "418": "Laos", "422": "Lebanon", "434": "Libya",
  "458": "Malaysia", "466": "Mali", "484": "Mexico", "504": "Morocco",
  "508": "Mozambique", "104b": "Myanmar", "516": "Namibia", "524": "Nepal",
  "528": "Netherlands", "554": "New Zealand", "558": "Nicaragua",
  "562": "Niger", "566": "Nigeria", "578": "Norway", "586": "Pakistan",
  "591": "Panama", "600": "Paraguay", "604": "Peru", "608": "Philippines",
  "616": "Poland", "620": "Portugal", "634": "Qatar", "642": "Romania",
  "643": "Russia", "646": "Rwanda", "682": "Saudi Arabia", "686": "Senegal",
  "688": "Serbia", "694": "Sierra Leone", "702": "Singapore", "703": "Slovakia",
  "705": "Slovenia", "706": "Somalia", "710": "South Africa", "724": "Spain",
  "729": "Sudan", "752": "Sweden", "756": "Switzerland", "760": "Syria",
  "158": "Taiwan", "834": "Tanzania", "764": "Thailand", "788": "Tunisia",
  "792": "Turkey", "800": "Uganda", "804": "Ukraine",
  "784": "United Arab Emirates", "826": "United Kingdom",
  "840": "United States", "858": "Uruguay", "860": "Uzbekistan",
  "862": "Venezuela", "704": "Vietnam", "887": "Yemen", "894": "Zambia",
  "716": "Zimbabwe",
};

// Long UN / alternate spellings -> canonical short name used for matching.
const CANONICAL = {
  "united states of america": "United States",
  "russian federation": "Russia",
  "republic of korea": "South Korea",
  "dem people s republic of korea": "North Korea",
  "iran islamic republic of": "Iran",
  "viet nam": "Vietnam",
  "china hong kong sar": "Hong Kong",
  "china macao sar": "Macau",
  "democratic republic of the congo": "DR Congo",
  "dr congo": "DR Congo",
  "congo democratic republic of the": "DR Congo",
  "congo kinshasa": "DR Congo",
  "united republic of tanzania": "Tanzania",
  "bolivia plurinational state of": "Bolivia",
  "venezuela bolivarian republic of": "Venezuela",
  "syrian arab republic": "Syria",
  "republic of moldova": "Moldova",
  "lao people s democratic republic": "Laos",
  "cote d ivoire": "Ivory Coast",
  "united kingdom of great britain and northern ireland": "United Kingdom",
  "czechia": "Czech Republic",
  "state of palestine": "Palestine",
  "myanmar burma": "Myanmar",
  // Natural Earth / Wikipedia spelling variants (for the capitals dataset)
  "the bahamas": "Bahamas",
  "the gambia": "Gambia",
  "eswatini swaziland": "Eswatini",
  "eswatini": "Eswatini",
  "swaziland": "Eswatini",
  "east timor": "Timor-Leste",
  "congo brazzaville": "Congo",
  "republic of the congo": "Congo",
  "republic of serbia": "Serbia",
  "north macedonia": "North Macedonia",
  "macedonia": "North Macedonia",
  "guinea bissau": "Guinea-Bissau",
  "united states virgin islands": "United States Virgin Islands",
};

export function normCountry(name) {
  return String(name)
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

// Return a clean canonical country name given the raw spreadsheet name + numeric code.
export function canonicalCountry(rawName, code) {
  const raw = String(rawName ?? "").trim();
  // Glitch rows where the "name" column is actually the numeric code.
  if (/^\d+$/.test(raw) && ISO_NUMERIC_TO_NAME[raw]) return ISO_NUMERIC_TO_NAME[raw];
  const key = normCountry(raw);
  if (CANONICAL[key]) return CANONICAL[key];
  if (code != null && ISO_NUMERIC_TO_NAME[String(code)]) {
    // Trust the code when the name is empty/odd.
    if (!raw || /^\d+$/.test(raw)) return ISO_NUMERIC_TO_NAME[String(code)];
  }
  return raw;
}
