import { useEffect, useRef, useState } from "react";

// Small "i" that reveals explanatory text when clicked. Click it again, click anywhere else,
// or press Escape to dismiss.
//
// Open state is held in React rather than driven by :hover/:focus. Hover is wrong here — these
// tooltips are wide enough to cover the control directly below them, so they should only ever
// appear deliberately. :focus alone isn't enough either: Safari on macOS doesn't focus a button
// on click, so clicking the icon there would do nothing.
//
// It has to be a <button> rather than a focusable <span>: most of these sit inside a <label>,
// and a click on a label is forwarded to the label's control, which would activate the slider
// instead. Interactive content is exempt from that forwarding.
export default function InfoIcon({ text }) {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);

  useEffect(() => {
    if (!open) return undefined;
    // Registered after the opening click has already been dispatched, so it can't self-close.
    const onPointerDown = (e) => {
      if (!ref.current || !ref.current.contains(e.target)) setOpen(false);
    };
    const onKeyDown = (e) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [open]);

  return (
    <button
      ref={ref}
      type="button"
      className="info"
      aria-label={text}
      aria-expanded={open}
      onClick={(e) => { e.preventDefault(); e.stopPropagation(); setOpen((o) => !o); }}
    >
      i{open && <span className="info-tip" aria-hidden="true">{text}</span>}
    </button>
  );
}
