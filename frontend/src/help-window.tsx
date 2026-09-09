import React, { useEffect, useMemo, useRef, useState } from 'react'
import { createRoot } from 'react-dom/client'
import { CircleHelp } from 'lucide-react'
import { Dialog } from 'terry-react-ui-library'
import helpMarkdown from './help.md?raw'
import './help-window.css'

type Heading = { level: number; text: string; id: string }

function slugify(value: string, index: number) {
  const base = value.trim().toLowerCase().replace(/[`*_]/g, '').replace(/[^\p{L}\p{N}]+/gu, '-').replace(/^-+|-+$/g, '')
  return base || `section-${index + 1}`
}

function escapeHtml(value: string) {
  return value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;')
}

function renderInline(value: string) {
  let html = escapeHtml(value)
  html = html.replace(/`([^`]+)`/g, '<code>$1</code>')
  html = html.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
  html = html.replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2" target="_blank" rel="noreferrer">$1</a>')
  return html
}

function parseMarkdown(markdown: string) {
  const lines = markdown.replace(/\r\n/g, '\n').split('\n')
  const headings: Heading[] = []
  const html: string[] = []
  let paragraph: string[] = []
  let listType: 'ul' | 'ol' | null = null
  let codeFence = false
  let codeLines: string[] = []
  let headingIndex = 0

  const flushParagraph = () => {
    if (!paragraph.length) return
    html.push(`<p>${renderInline(paragraph.join(' '))}</p>`)
    paragraph = []
  }
  const closeList = () => {
    if (!listType) return
    html.push(`</${listType}>`)
    listType = null
  }

  for (const rawLine of lines) {
    const line = rawLine.replace(/\s+$/, '')
    if (line.startsWith('```')) {
      flushParagraph()
      closeList()
      if (codeFence) {
        html.push(`<pre><code>${escapeHtml(codeLines.join('\n'))}</code></pre>`)
        codeFence = false
        codeLines = []
      } else {
        codeFence = true
      }
      continue
    }
    if (codeFence) {
      codeLines.push(rawLine)
      continue
    }

    const heading = line.match(/^(#{1,3})\s+(.+)$/)
    if (heading) {
      flushParagraph()
      closeList()
      const level = heading[1].length
      const text = heading[2].trim()
      const id = slugify(text, headingIndex++)
      headings.push({ level, text, id })
      html.push(`<h${level} id="${id}">${renderInline(text)}</h${level}>`)
      continue
    }

    if (/^>\s?/.test(line)) {
      flushParagraph()
      closeList()
      html.push(`<blockquote>${renderInline(line.replace(/^>\s?/, ''))}</blockquote>`)
      continue
    }

    const unordered = line.match(/^[-*]\s+(.+)$/)
    const ordered = line.match(/^\d+\.\s+(.+)$/)
    if (unordered || ordered) {
      flushParagraph()
      const wanted: 'ul' | 'ol' = unordered ? 'ul' : 'ol'
      if (listType !== wanted) {
        closeList()
        html.push(`<${wanted}>`)
        listType = wanted
      }
      html.push(`<li>${renderInline((unordered || ordered)![1])}</li>`)
      continue
    }

    if (!line.trim()) {
      flushParagraph()
      closeList()
      continue
    }

    paragraph.push(line.trim())
  }

  if (codeFence && codeLines.length) html.push(`<pre><code>${escapeHtml(codeLines.join('\n'))}</code></pre>`)
  flushParagraph()
  closeList()
  return { html: html.join('\n'), headings }
}

function helpIconSvg() {
  return '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="10"></circle><path d="M9.09 9a3 3 0 1 1 5.83 1c0 2-3 2-3 4"></path><path d="M12 17h.01"></path></svg>'
}

const OPEN_HELP_EVENT = 'rulesmd:open-help'

function HelpDialogRoot() {
  const parsed = useMemo(() => parseMarkdown(helpMarkdown), [])
  const [open, setOpen] = useState(false)
  const contentRef = useRef<HTMLElement | null>(null)

  useEffect(() => {
    const openHelp = () => setOpen(true)
    window.addEventListener(OPEN_HELP_EVENT, openHelp)
    return () => window.removeEventListener(OPEN_HELP_EVENT, openHelp)
  }, [])

  useEffect(() => {
    if (open && contentRef.current) contentRef.current.scrollTop = 0
  }, [open])

  return <Dialog
    open={open}
    title="帮助文档"
    icon={<CircleHelp size={18}/>} 
    size="wide"
    closeOnBackdrop
    onClose={() => setOpen(false)}
  >
    <div className="helpDialogBody">
      <aside className="helpDialogToc" aria-label="帮助目录">
        <div className="helpDialogTocTitle">目录</div>
        <nav>{parsed.headings.filter(item => item.level >= 2).map(item => <button
          type="button"
          key={item.id}
          className={`level-${item.level}`}
          onClick={() => {
            const target = contentRef.current?.querySelector<HTMLElement>(`#${CSS.escape(item.id)}`)
            target?.scrollIntoView({ block: 'start', behavior: 'smooth' })
          }}
        >{item.text}</button>)}</nav>
      </aside>
      <article ref={contentRef} className="helpDialogContent" dangerouslySetInnerHTML={{ __html: parsed.html }}/>
    </div>
  </Dialog>
}

function installWhenToolbarReady(attempt = 0) {
  const toolbar = document.querySelector('.toolbar')
  const app = document.querySelector('.app')
  if (toolbar && app) {
    installHelpWindow(toolbar, app)
    return
  }
  if (attempt < 20) window.setTimeout(() => installWhenToolbarReady(attempt + 1), 50)
}

export function installHelpWindow(toolbarElement?: Element, appElement?: Element) {
  if (document.querySelector('[data-rulesmd-help-button]')) return
  const toolbar = toolbarElement ?? document.querySelector('.toolbar')
  const app = appElement ?? document.querySelector('.app')
  if (!toolbar || !app) {
    installWhenToolbarReady()
    return
  }

  const button = document.createElement('button')
  button.type = 'button'
  button.className = 'iconButton'
  button.dataset.rulesmdHelpButton = '1'
  button.setAttribute('aria-label', '帮助')
  button.innerHTML = `${helpIconSvg()}<span class="iconButtonLabel">帮助</span>`
  toolbar.appendChild(button)

  const mount = document.createElement('div')
  mount.dataset.rulesmdHelpRoot = '1'
  app.appendChild(mount)
  createRoot(mount).render(<HelpDialogRoot/>)

  button.addEventListener('click', () => window.dispatchEvent(new Event(OPEN_HELP_EVENT)))
}
