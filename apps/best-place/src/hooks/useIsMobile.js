import { useEffect, useState } from "react";

// Below this width the three-column desktop layout (340 + map + 320) stops fitting, so the
// app switches to the tabbed mobile shell instead. Kept in JS rather than CSS-only because
// the two layouts are different component trees, not just different styling.
const MOBILE_QUERY = "(max-width: 900px)";

export default function useIsMobile() {
  const [isMobile, setIsMobile] = useState(() => window.matchMedia(MOBILE_QUERY).matches);

  useEffect(() => {
    const mq = window.matchMedia(MOBILE_QUERY);
    const onChange = (e) => setIsMobile(e.matches);
    mq.addEventListener("change", onChange);
    setIsMobile(mq.matches); // in case it changed between first render and this effect
    return () => mq.removeEventListener("change", onChange);
  }, []);

  return isMobile;
}
