// Countries/territories where an individual (retail, buy-and-hold) investor pays
// 0% capital gains tax on gains from LISTED SHARES & ETFs.
//
// This is deliberately about listed securities — many places tax property or other gains
// but exempt listed shares/ETFs. Some apply a holding-period condition (noted); those are
// included because a long-term investor pays 0%. Compiled from PwC/Deloitte tax summaries
// and national tax authorities (Wikipedia's single "capital gains" column doesn't capture
// this, so it's curated here). Names are canonicalCountry() spellings.
export const ZERO_CGT_COUNTRIES = new Set([
  // No capital gains tax at all (or none on movable/financial assets)
  "United Arab Emirates", "Qatar", "Kuwait", "Bahrain", "Oman", "Saudi Arabia",
  "Switzerland", "Monaco", "Liechtenstein", "Andorra", "Gibraltar",
  "Isle of Man", "Guernsey", "Jersey",
  "Singapore", "Hong Kong", "Malaysia", "New Zealand", "Brunei",
  "Georgia", "Mauritius", "Namibia", "Botswana", "Kenya",
  "Jamaica", "Bahamas", "Barbados", "Belize", "Bermuda", "Cayman Islands",
  "Saint Kitts and Nevis", "Trinidad and Tobago", "Fiji", "Vanuatu", "Solomon Islands",

  // Listed shares / ETFs specifically exempt for individuals
  "Belgium",        // private individuals: 0% on shares (normal management of wealth)
  "Netherlands",    // no realised CGT — box 3 taxes deemed return, not share gains
  "Luxembourg",     // 0% on listed shares held > 6 months (non-substantial holding)
  "Malta",          // gains on listed securities are exempt
  "Cyprus",         // securities (incl. listed shares/ETFs) exempt from CGT
  "Greece",         // 0% on listed shares for < 0.5% holdings (exemption in force)
  "Bulgaria",       // 0% on shares/ETFs traded on an EU/EEA-regulated market
  "Slovakia",       // 0% on listed securities held > 1 year
  "Czech Republic", // 0% on shares held > 3 years (time test)
  "Croatia",        // 0% on shares held > 2 years
  "Slovenia",       // 0% after long holding period (tapered to 0)
  "South Korea",    // retail investors: 0% on listed shares below the large-holder threshold
  "Thailand",       // 0% on gains from SET-listed shares for individuals
  "Turkey",         // 0% on BIST-listed shares held by individuals (holding condition)
]);

export function isZeroCgt(canonicalName) {
  return ZERO_CGT_COUNTRIES.has(canonicalName);
}
