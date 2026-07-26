// Selectable continents (excludes Antarctica: no cities there, and it's outside the
// habitable climate grid band anyway). Asia is split into finer regions since it's too
// large/heterogeneous as one bucket. "E Asia (exc CN, MN)" excludes China and Mongolia,
// which stay in "Rest of Asia".
export const CONTINENTS = [
  "Africa", "Europe", "Middle East", "North America", "South America",
  "E Asia (exc CN, MN)", "SE Asia", "Rest of Asia", "Oceania",
];
