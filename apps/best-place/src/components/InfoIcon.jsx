// Small "i" that reveals explanatory text on hover (pointer) or focus (touch/keyboard).
//
// It has to be a <button> rather than a focusable <span>: most of these sit inside a <label>,
// and a click on a label is forwarded to the label's control — which steals the focus the
// tooltip depends on. Interactive content is exempt from that forwarding, so a real button is
// what makes the tooltip openable at all on touch, where there is no hover to fall back on.
export default function InfoIcon({ text }) {
  return (
    <button
      type="button"
      className="info"
      aria-label={text}
      onClick={(e) => { e.preventDefault(); e.stopPropagation(); }}
    >
      i<span className="info-tip" aria-hidden="true">{text}</span>
    </button>
  );
}
