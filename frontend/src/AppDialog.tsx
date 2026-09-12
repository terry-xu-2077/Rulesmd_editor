import type { CSSProperties, ComponentProps } from 'react'
import { createPortal } from 'react-dom'
import { Dialog } from 'terry-react-ui-library'

type AppDialogProps = ComponentProps<typeof Dialog>
type PortalStyle = CSSProperties & Record<`--${string}`, string>

const PORTAL_THEME_VARS = [
  '--theme-base',
  '--theme-accent',
  '--theme-effect',
  '--theme-text',
  '--theme-text-bright',
  '--theme-surface-0',
  '--theme-surface-1',
  '--theme-surface-2',
  '--theme-surface-soft',
  '--theme-surface-strong',
  '--theme-surface-hover',
  '--theme-surface-focus',
  '--theme-border',
  '--theme-line',
  '--theme-shadow',
  '--tc-base',
  '--tc-accent',
  '--tc-effect',
  '--tc-text-main',
  '--tc-text-bright',
  '--tc-bg',
  '--tc-surface',
  '--tc-surface-2',
  '--tc-panel',
  '--tc-panel-2',
  '--tc-row-hover',
  '--tc-border-color',
  '--tc-line',
  '--tc-shadow',
  '--tc-tone-blue',
  '--tc-tone-red',
  '--tc-tone-purple',
  '--tc-tone-neutral',
] as const

function portalTheme() {
  const app = document.querySelector<HTMLElement>('.app.tc-theme')
  const style: PortalStyle = {}
  if (app) {
    const computed = window.getComputedStyle(app)
    for (const variable of PORTAL_THEME_VARS) {
      const value = computed.getPropertyValue(variable).trim()
      if (value) style[variable] = value
    }
  }
  return {
    mode: app?.dataset.mode === 'light' ? 'light' : 'dark',
    style,
  }
}

/**
 * Application modal boundary.
 *
 * Every new Rulesmd Editor modal must go through this component. The UI Library owns
 * the Dialog itself; this wrapper only moves the whole component to document.body so
 * table/editor overflow, stacking contexts and transformed ancestors cannot hide it.
 * It also bridges the active application theme into the portal subtree.
 *
 * New ordinary feature dialogs should target an 800x480 envelope by default. The
 * envelope may be fixed, but its interior must use flexible layout so the main content
 * fills the available body instead of leaving unused space in the lower-right area.
 * Larger dialog sizes are reserved for workflows that genuinely need more room.
 */
export function AppDialog(props: AppDialogProps) {
  if (!props.open || typeof document === 'undefined') return null
  const theme = portalTheme()
  return createPortal(
    <div className="tc-theme appDialogPortalContext" data-mode={theme.mode} style={theme.style}>
      <Dialog {...props}/>
    </div>,
    document.body,
  )
}
