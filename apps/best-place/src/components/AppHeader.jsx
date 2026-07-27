// Shared header pieces. Desktop renders them at the top of the filter panel; mobile renders
// them in the shell above the tab bar. Kept in one place so the two can't drift apart.
export const TITLE = "Best Place";
export const TAGLINE = "Find where to live.";

// Mobile shortens the label to "Home" — the full wording crowds the centred title on a phone.
// The accessible name stays explicit either way.
export function BackHome({ short = false }) {
  return (
    <a className="back-home" href="/" aria-label="Back to Home">
      <span aria-hidden="true">&#8592;</span> {short ? "Home" : "Back to Home"}
    </a>
  );
}
