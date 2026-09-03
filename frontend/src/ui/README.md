# Legacy UI Library

Project-agnostic React/TypeScript implementation of the visual language originally developed in `RulesmdEditorWeb`.

## Core rule

The library must not depend on Rulesmd, Red Alert, units, factions, INI files, or any other product/domain concept. Product code composes generic UI primitives and may add domain-specific adapters outside the library.

The old Web UI remains the visual reference. Preserve its dimensions, gradients, colors, borders, shadows, hover/focus/active feedback and animation timing unless the old implementation contains a functional bug. Implementation details may be modernized freely.

## Components

- `TextField` — text input with legacy hover glow, focus state and reset action.
- `BoolSwitch` — 220x26 ON/OFF switch using the original traveling knob and green gradient.
- `Select` — single-value dropdown.
- `Slider` — original range + numeric input composition.
- `MultiSelect` — popup multiple-choice selector.
- `LegacyTooltip` — light-blue legacy tooltip.
- `ResetButton` — contextual reset control.
- `EntityHeader` — generic icon/title/subtitle/watermark header with accent tone and pin motion.
- `PropertyRow` — generic label/value row including hover and changed state.
- `LegacyDialog` — elastic popup dialog.
- `ActiveParticleField` — rising-particle active background extracted from the original effect layer.
- `LegacyButton` — rounded gray/blue action button.
- `StatusPill` — small status primitive.

## Compatibility adapters

Rulesmd-specific names such as `FactionHeader` and `SideSelect` may temporarily remain as deprecated adapters so existing editor code does not break. New code must use the generic primitives (`EntityHeader`, `MultiSelect`, etc.).

## Themes

Blue, red, purple and neutral accent presets are generic visual themes. Products may map their own concepts to these presets or supply custom styles without changing component semantics.

## Design tokens

Reusable colors and dimensions live in `legacy-tokens.css`. Feature code should not duplicate literal colors when a token exists. Token names will progressively move from historical `ra2-*` aliases to project-neutral `legacy-*` names while retaining compatibility aliases during migration.

## Motion

Motion is CSS-first so desktop WebView behavior remains deterministic. Reduced-motion users are respected through `prefers-reduced-motion` while the default theme keeps the original UI's motion character.

## Development

Use `LegacyUiShowcase` as the visual regression playground. New controls should be added to the showcase before being consumed by any product-specific application.
