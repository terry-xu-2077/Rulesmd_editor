export const motion = {
  fast: 120,
  normal: 180,
  panel: 220,
  easing: 'cubic-bezier(.2,.8,.2,1)',
} as const

// Motion language inherited from RulesmdEditorWeb, but normalized for the new UI:
// - list rows: subtle enter, no large scale bounce
// - hover: 1–2px lift/translate only
// - state changes: short flash/fade
// - panels/dialogs: small directional reveal
// - persistent status: low-frequency pulse
// - reduced-motion is respected in CSS
