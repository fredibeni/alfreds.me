// Shared header pieces. Desktop renders them at the top of the filter panel; mobile renders
// them in the shell above the tab bar. Kept in one place so the two can't drift apart.
export const TITLE = "Best Place";
export const TAGLINE = "Find where to live.";

// Short label so it can sit beside the title without crowding it; the accessible name stays
// explicit.
export function BackHome() {
  return (
    <a className="back-home" href="/" aria-label="Back to Home">
      <span aria-hidden="true">&#8592;</span> Home
    </a>
  );
}
