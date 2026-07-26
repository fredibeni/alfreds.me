// Curated capital-gains tax rates on LISTED SHARES & ETFs for individual (retail, long-term)
// investors, for countries Wikipedia's tax table leaves blank. Compiled from PwC Worldwide
// Tax Summaries, Deloitte tax guides, and national tax authorities.
//
// Notes:
//  - A 0 means gains on locally-listed shares/ETFs are effectively untaxed for individuals
//    (many exchanges grant an exemption: e.g. GSE Ghana, DSE Tanzania, USE Uganda, LuSE
//    Zambia, KASE Kazakhstan, BRVM West Africa, Panama, Nigeria listed shares, Taiwan, etc.).
//  - Transaction-tax-only regimes (Indonesia, Vietnam) are shown at their small final rate.
//  - These are approximate and subject to holding-period / threshold conditions; treat as a
//    guide, not tax advice. Values fill only where Wikipedia has no capital-gains figure.
export const CGT_LISTED_SHARES = {
  // --- Americas ---
  "Mexico": 10, "Peru": 5, "Panama": 0, "Costa Rica": 15, "Guatemala": 10,
  "Honduras": 10, "El Salvador": 10, "Nicaragua": 15, "Bolivia": 0, "Paraguay": 8,
  "Uruguay": 12, "Venezuela": 34, "Cuba": 0, "Guyana": 20, "Suriname": 0,
  "Puerto Rico": 15, "Antigua and Barbuda": 0, "Dominica": 0, "Grenada": 0,
  "Saint Lucia": 0, "Saint Vincent and the Grenadines": 0,

  // --- Europe / Caucasus / Central Asia ---
  "Russia": 13, "Ukraine": 18, "Belarus": 0, "Moldova": 6,
  "Bosnia and Herzegovina": 10, "Montenegro": 15, "North Macedonia": 15,
  "TFYR Macedonia": 15, "Kosovo": 10, "San Marino": 5, "Azerbaijan": 0,
  "Kazakhstan": 0, "Kyrgyzstan": 10, "Uzbekistan": 5, "Tajikistan": 12,
  "Turkmenistan": 10, "Vatican": 0,

  // --- MENA ---
  "Egypt": 10, "Morocco": 15, "Tunisia": 10, "Libya": 0, "Iran": 0, "Iraq": 15,
  "Jordan": 0, "Lebanon": 15, "Syria": 0, "Yemen": 0, "Afghanistan": 0,
  "Palestine": 0,

  // --- Sub-Saharan Africa ---
  "Nigeria": 0, "Ghana": 0, "Ethiopia": 30, "Tanzania": 0, "Uganda": 0,
  "Zambia": 0, "Zimbabwe": 2, "Senegal": 0, "Benin": 0, "Togo": 0,
  "Ivory Coast": 0, "Burkina Faso": 0, "Mali": 0, "Niger": 0, "Haiti": 0, "North Korea": 0,
  "Cameroon": 0, "Gabon": 0, "Congo": 0, "Chad": 0, "Central African Republic": 0,
  "Equatorial Guinea": 0, "DR Congo": 0, "Rwanda": 5, "Burundi": 0,
  "Madagascar": 0, "Mozambique": 10, "Malawi": 0, "Lesotho": 0, "Eswatini": 0,
  "Guinea": 0, "Guinea-Bissau": 0, "Sierra Leone": 0, "Liberia": 0,
  "Mauritania": 0, "Gambia": 0, "Cape Verde": 1, "Sao Tome and Principe": 0,
  "Comoros": 0, "Djibouti": 0, "Eritrea": 0, "Somalia": 0, "Somaliland": 0,
  "South Sudan": 0, "Sudan": 0, "Seychelles": 0,

  // --- Asia-Pacific ---
  "Indonesia": 0.1, "Vietnam": 0.1, "Taiwan": 0, "Bangladesh": 0, "Nepal": 5,
  "Bhutan": 10, "Cambodia": 0, "Laos": 0, "Myanmar": 10, "Mongolia": 10,
  "Maldives": 0, "Papua New Guinea": 0, "Timor-Leste": 0, "Macau": 0,
  "Samoa": 0, "Tonga": 0, "Tuvalu": 0, "Kiribati": 0, "Palau": 0,
  "Marshall Islands": 0, "Federated States of Micronesia": 0,
};

export function cgtListedShares(canonicalName) {
  const v = CGT_LISTED_SHARES[canonicalName];
  return v == null ? null : v;
}

// Caveats shown in the city info box. Generic notes cover the whole category; specific
// entries override for notable exceptions.
export const ZERO_CGT_NOTE =
  "0% on listed shares & ETFs for individual investors. Holding-period or exchange-listing conditions may apply, and other assets (e.g. property) can still be taxed.";
export const CURATED_NOTE =
  "Approximate rate for listed shares & ETFs, curated from tax summaries. Exchange-listing or holding-period conditions often apply — verify before relying.";

export const CGT_NOTES = {
  Indonesia: "0.1% final transaction tax on listed-share sales — a levy on the sale value, not on the gain.",
  Vietnam: "0.1% transaction tax on securities transfers — a levy on the sale value, not on the gain.",
  Taiwan: "The securities capital-gains tax is suspended for individuals; a 0.3% transaction tax applies instead.",
  Bangladesh: "Individual investors are exempt on gains from listed shares; large or founder holdings can be taxed.",
  Russia: "13% (15% on high incomes); listed shares held 3+ years can be exempt.",
  Nigeria: "Gains on listed shares are exempt; unlisted-share gains above a threshold are taxed at 10%.",
  Ghana: "Gains on securities listed on the Ghana Stock Exchange are exempt.",
  Kazakhstan: "Gains on securities listed on KASE/AIX are exempt; other capital gains are taxed.",
  Tanzania: "Gains on shares listed on the Dar es Salaam exchange are generally exempt for small holdings.",
  Panama: "Gains on securities listed/traded through the Panama exchange are exempt; otherwise ~10%.",
  Jordan: "Gains on listed shares are exempt; the value shown reflects that exemption.",
  Venezuela: "Capital gains are generally taxed as ordinary income; the rate shown is approximate.",
  Ethiopia: "Share gains are taxed at 30%, closer to ordinary-income treatment.",
  Nepal: "Listed-share gains are taxed at ~5% for individuals (7.5% short-term).",
  Belarus: "Gains on shares held 3+ years are exempt.",
  Azerbaijan: "Gains on shares held 3+ years are exempt.",
};

export function cgtNote(canonicalName, { zero = false, curated = false } = {}) {
  if (CGT_NOTES[canonicalName]) return CGT_NOTES[canonicalName];
  if (zero) return ZERO_CGT_NOTE;
  if (curated) return CURATED_NOTE;
  return null;
}
