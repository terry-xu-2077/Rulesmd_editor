# Rulesmd Legacy UI Library

React/TypeScript implementation of the visual language from `RulesmdEditorWeb`.

## Fidelity rule

The old Web UI is the visual reference. Preserve its dimensions, gradients, colors, borders, shadows, hover/focus/active feedback and animation timing unless the old implementation contains a functional bug. Implementation details may be modernized freely.

## Components

- `TextField` — legacy text input with hover glow, focus state and reset action.
- `BoolSwitch` — 220x26 ON/OFF switch using the original traveling knob and green gradient.
- `Select` — legacy single-value dropdown.
- `Slider` — original range + numeric input composition.
- `MultiSelect` — popup multiple-choice selector.
- `SideSelect` — faction-oriented multiple selector.
- `LegacyTooltip` — light-blue legacy tooltip.
- `ResetButton` — contextual reset control.
- `FactionHeader` — Allied/Soviet/Yuri/Preview unit header with watermark and pin motion.
- `PropertyRow` — original option/value row including hover and changed state.
- `LegacyDialog` — legacy elastic popup dialog.
- `ActiveParticleField` — rising-particle active background from `itemEffect.scss`.
- `LegacyButton` — original rounded gray/blue action button.
- `StatusPill` — small status primitive for the rewritten editor.

## Design tokens

All reusable colors and dimensions live in `legacy-tokens.css`. Do not duplicate literal colors in editor feature code when a token exists.

## Motion

Motion is CSS-first so Tauri WebView behavior remains deterministic. Reduced-motion users are respected through `prefers-reduced-motion` while the default theme keeps the original UI's motion character.

## Development

Use `LegacyUiShowcase` as the visual regression playground. New controls should be added to the showcase before being consumed by the real Rulesmd editor.
