// Manually-requested cities that fall below the UN 300k threshold and aren't national
// capitals (so they're not in the population spreadsheet or the capitals dataset).
// Use English names; coordinates are the city centre.
export const EXTRA_CITIES = [
  { id: "x-heraklion", name: "Heraklion", country: "Greece", lat: 35.3387, lon: 25.1442, population: 177000 },
  // Funchal, capital of the Madeira autonomous region (Portugal); below 300k and not a
  // national capital, so it isn't in the population sheet or capitals dataset.
  { id: "x-funchal", name: "Funchal", country: "Portugal", lat: 32.6669, lon: -16.9241, population: 105795 },
  // Ponta Delgada, capital of the Azores autonomous region (Portugal); likewise below 300k
  // and not a national capital.
  { id: "x-ponta-delgada", name: "Ponta Delgada", country: "Portugal", lat: 37.7412, lon: -25.6756, population: 68809 },
  // Crown Dependencies: each is its own tax/legal jurisdiction (not part of the UK for our
  // purposes), so each gets its biggest town rather than being folded into "United Kingdom".
  { id: "x-st-helier", name: "St Helier", country: "Jersey", lat: 49.1858, lon: -2.1058, population: 33500 },
  { id: "x-douglas-iom", name: "Douglas", country: "Isle of Man", lat: 54.1500, lon: -4.4819, population: 27938 },
  { id: "x-st-peter-port", name: "St Peter Port", country: "Guernsey", lat: 49.4553, lon: -2.5359, population: 16500 },
];
