// continents.mjs — static ckey (normalized country name) -> continent lookup.
// Keyed on the same `ckey` join key used throughout the pipeline (see lib/countries.mjs),
// so it lines up directly with both public/data.json cities and public/world.geojson features.

const CONTINENT_BY_CKEY = {
  afghanistan: "Asia", albania: "Europe", algeria: "Africa", andorra: "Europe",
  angola: "Africa", antarctica: "Antarctica", "antigua and barbuda": "North America",
  argentina: "South America", armenia: "Asia", australia: "Oceania", austria: "Europe",
  azerbaijan: "Asia", bahamas: "North America", bahrain: "Asia", bangladesh: "Asia",
  barbados: "North America", belarus: "Europe", belgium: "Europe", belize: "North America",
  benin: "Africa", bermuda: "North America", bhutan: "Asia", bolivia: "South America",
  "bosnia and herzegovina": "Europe", botswana: "Africa", brazil: "South America",
  brunei: "Asia", bulgaria: "Europe", "burkina faso": "Africa", burundi: "Africa",
  cambodia: "Asia", cameroon: "Africa", canada: "North America", "cape verde": "Africa",
  "central african republic": "Africa", chad: "Africa", chile: "South America",
  china: "Asia", colombia: "South America", comoros: "Africa", congo: "Africa",
  "costa rica": "North America", croatia: "Europe", cuba: "North America", cyprus: "Asia",
  "czech republic": "Europe", denmark: "Europe", djibouti: "Africa", dominica: "North America",
  "dominican republic": "North America", "dr congo": "Africa", ecuador: "South America",
  egypt: "Africa", "el salvador": "North America", "equatorial guinea": "Africa",
  eritrea: "Africa", estonia: "Europe", eswatini: "Africa", ethiopia: "Africa",
  "falkland islands": "South America", "federated states of micronesia": "Oceania",
  fiji: "Oceania", finland: "Europe", france: "Europe",
  "french southern and antarctic lands": "Antarctica", gabon: "Africa", gambia: "Africa",
  georgia: "Asia", germany: "Europe", ghana: "Africa", greece: "Europe",
  greenland: "North America", grenada: "North America", guatemala: "North America",
  guinea: "Africa", "guinea bissau": "Africa", guernsey: "Europe", guyana: "South America",
  haiti: "North America", honduras: "North America", "hong kong": "Asia", hungary: "Europe",
  iceland: "Europe", "isle of man": "Europe",
  india: "Asia", indonesia: "Asia", iran: "Asia", iraq: "Asia", ireland: "Europe",
  israel: "Asia", italy: "Europe", "ivory coast": "Africa", jamaica: "North America",
  japan: "Asia", jersey: "Europe", jordan: "Asia", kazakhstan: "Asia", kenya: "Africa",
  kiribati: "Oceania",
  kosovo: "Europe", kuwait: "Asia", kyrgyzstan: "Asia", laos: "Asia", latvia: "Europe",
  lebanon: "Asia", lesotho: "Africa", liberia: "Africa", libya: "Africa",
  liechtenstein: "Europe", lithuania: "Europe", luxembourg: "Europe", macau: "Asia",
  madagascar: "Africa", malawi: "Africa", malaysia: "Asia", maldives: "Asia", mali: "Africa",
  malta: "Europe", "marshall islands": "Oceania", mauritania: "Africa", mauritius: "Africa",
  mexico: "North America", moldova: "Europe", monaco: "Europe", mongolia: "Asia",
  montenegro: "Europe", morocco: "Africa", mozambique: "Africa", myanmar: "Asia",
  namibia: "Africa", nepal: "Asia", netherlands: "Europe", "new caledonia": "Oceania",
  "new zealand": "Oceania", nicaragua: "North America", niger: "Africa", nigeria: "Africa",
  "north korea": "Asia", "north macedonia": "Europe", "northern cyprus": "Asia",
  norway: "Europe", oman: "Asia", pakistan: "Asia", palau: "Oceania", palestine: "Asia",
  panama: "North America", "papua new guinea": "Oceania", paraguay: "South America",
  peru: "South America", philippines: "Asia", poland: "Europe", portugal: "Europe",
  "puerto rico": "North America", qatar: "Asia", romania: "Europe", russia: "Europe",
  rwanda: "Africa", "saint kitts and nevis": "North America", "saint lucia": "North America",
  "saint vincent and the grenadines": "North America", samoa: "Oceania", "san marino": "Europe",
  "sao tome and principe": "Africa", "saudi arabia": "Asia", senegal: "Africa",
  serbia: "Europe", seychelles: "Africa", "sierra leone": "Africa", singapore: "Asia",
  slovakia: "Europe", slovenia: "Europe", "solomon islands": "Oceania", somalia: "Africa",
  somaliland: "Africa", "south africa": "Africa", "south korea": "Asia",
  "south sudan": "Africa", spain: "Europe", "sri lanka": "Asia", sudan: "Africa",
  suriname: "South America", sweden: "Europe", switzerland: "Europe", syria: "Asia",
  taiwan: "Asia", tajikistan: "Asia", tanzania: "Africa", "tfyr macedonia": "Europe",
  thailand: "Asia", "timor leste": "Asia", togo: "Africa", tonga: "Oceania",
  "trinidad and tobago": "North America", tunisia: "Africa", turkey: "Asia",
  turkmenistan: "Asia", tuvalu: "Oceania", uganda: "Africa", ukraine: "Europe",
  "united arab emirates": "Asia", "united kingdom": "Europe", "united states": "North America",
  uruguay: "South America", uzbekistan: "Asia", vanuatu: "Oceania", vatican: "Europe",
  venezuela: "South America", vietnam: "Asia", "western sahara": "Africa", yemen: "Asia",
  zambia: "Africa", zimbabwe: "Africa",
};

// Asia is split further for the continent filter: it's too large/heterogeneous as one bucket.
const MIDDLE_EAST = new Set([
  "bahrain", "cyprus", "northern cyprus", "iran", "iraq", "israel", "jordan", "kuwait",
  "lebanon", "oman", "palestine", "qatar", "saudi arabia", "syria", "turkey",
  "united arab emirates", "yemen",
]);
const SE_ASIA = new Set([
  "brunei", "cambodia", "indonesia", "laos", "malaysia", "myanmar", "philippines",
  "singapore", "thailand", "timor leste", "vietnam",
]);
// East Asia minus China and Mongolia (those two stay in "Rest of Asia").
const E_ASIA_EXC_CN_MN = new Set(["hong kong", "japan", "macau", "north korea", "south korea", "taiwan"]);

export function continentFor(ckey) {
  const base = CONTINENT_BY_CKEY[ckey] || null;
  if (base !== "Asia") return base;
  if (MIDDLE_EAST.has(ckey)) return "Middle East";
  if (SE_ASIA.has(ckey)) return "SE Asia";
  if (E_ASIA_EXC_CN_MN.has(ckey)) return "E Asia (exc CN, MN)";
  return "Rest of Asia";
}

export { CONTINENT_BY_CKEY };
