// Compatibility facade. New visual work should import from ./visualIcons directly.
// Keeping this file means existing callers do not need to move all at once while the
// implementation is centralized in the unified three-source icon system.
export {
  LEGACY_COUNTRY_TILE,
  LEGACY_ICON_TILE,
  countryIconStyle,
  createOpenIcon,
  createSimpleIcon,
  createTileIconStyle,
  hasLegacyIcon,
  legacyIconStyle,
  resolveVisualIcon,
  semanticOpenIconKind,
  type OpenIconKind,
  type TileIconSource,
  type VisualIconResolverOptions,
  type VisualOptionIconDescriptor,
} from './visualIcons'
