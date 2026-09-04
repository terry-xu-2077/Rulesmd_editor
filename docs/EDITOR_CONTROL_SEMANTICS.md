# Editor control semantics

This document defines semantic rules for controls that edit Rules/Ares values. These rules are separate from visual CSS rules.

## Slider red lines

A slider track is an editing convenience, not a validation boundary.

- Slider `min / max / step` must come from a stable Key rule or a documented Key-family fallback.
- Never calculate a track range by multiplying the current value.
- The same Key must receive the same track range regardless of whether its current value is `1`, `4`, `100`, or a modded extreme value.
- Manual numeric input may be below the track minimum or above the track maximum.
- When a manual value is outside the track, the thumb may pin to the nearest end while the exact numeric value remains unchanged.
- UI range logic must never rewrite a valid Rules/Ares value merely because it falls outside the recommended track.
- **Track range and numeric precision are separate concerns.** A float such as `.016` must never become an integer merely because its Key family uses a broad integer-sized range.
- The editor must preserve at least the finest decimal precision observed for a Key during the editing session. Explicit metadata declaring `float`, `double`, or `decimal` also requires a fractional step.
- Reducing precision during slider interaction is data loss and is prohibited.

The application-side range table lives in `frontend/src/sliderRanges.ts`. Add exact Key rules there when a numeric field needs a domain-specific editing range.

## Interactive latency red lines

Control input must remain local and responsive even when the current Section is large (especially `[General]`).

- Never add a long trailing debounce to the visible control state.
- High-frequency controls may coalesce persistence work, but the user-facing thumb/input state must update immediately.
- Repeated edits to the same INI line must be serialized; an older backend response must never overwrite a newer local value.
- Save, section navigation, raw-text reads, and other synchronization boundaries must flush pending value writes first.
- Dirty tracking must be incremental. A single value edit must not rescan the entire `rulesmd.ini` just to determine whether the document is dirty.
- Backend coalescing windows are for bridge protection only; they are not part of the component's perceived interaction latency.

## Reference-menu red lines

Reference semantics are determined by the **parameter Key / value type**, never by the current value text.

Forbidden inference:

> `DebrisTypes=TIRE`, a section named `[TIRE]` exists, therefore DebrisTypes must reference every section in TIRE's category.

This is unsafe because unrelated scalar/list values can coincidentally equal a section name. It previously caused `DebrisTypes` to open a menu containing `General`, `JumpjetControls`, `AudioVisual`, and other unrelated sections.

Required behavior:

- Weapon-reference Keys resolve only to weapon sections.
- Warhead-reference Keys resolve only to warhead sections.
- Projectile-reference Keys resolve only to projectile sections.
- Deploy/undeploy/spawn/enslave references use their explicitly known object class.
- Numeric weapon-slot selectors such as `OpenTransportWeapon` and `DeployFireWeapon` are **not** weapon Section references. Their documented `0/1` domains must override name-based heuristics.
- Unknown/custom Keys stay ordinary controls unless metadata or an explicit semantic rule says otherwise.
- A jump-to-reference button is shown only when the Key has a known reference class and the current value resolves inside that class.

## Resource-less menu icons

Real thumbnails win when an actual thumbnail resource exists. Missing thumbnails use semantic fallback icons rather than one universal cube:

- weapon -> weapon/crosshair icon
- audio -> speaker icon
- warhead -> warhead/bomb icon
- projectile -> projectile/rocket icon
- debris -> debris/effect icon
- unknown object -> generic object icon

Fallback icons must be visually quieter than real thumbnails, especially in light mode.

## Audio menus

Rules audio references do not necessarily have object sections in `rulesmd.ini`, so they must not be treated as generic section references.

The desktop editor builds a searchable audio value pool from sound/voice/audio reference values observed in the opened Rules document (including `Report`). The current value is always kept available even if it was not previously observed.

## List-like values without registered object classes

For values such as `DebrisTypes`, use values observed for that exact Key in the opened document rather than inferring a section category from the current token. This gives a useful searchable/list menu without inventing a false object type.
