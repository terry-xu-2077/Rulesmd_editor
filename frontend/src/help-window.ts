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

function closeIconSvg() {
  return '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M18 6 6 18"></path><path d="m6 6 12 12"></path></svg>'
}

export function installHelpWindow() {
  if (document.querySelector('[data-rulesmd-help-button]')) return
  const toolbar = document.querySelector('.toolbar')
  if (!toolbar) return

  const parsed = parseMarkdown(helpMarkdown)
  const button = document.createElement('button')
  button.type = 'button'
  button.className = 'iconButton'
  button.dataset.rulesmdHelpButton = '1'
  button.title = '帮助'
  button.setAttribute('aria-label', '帮助')
  button.innerHTML = `${helpIconSvg()}<span class="iconButtonLabel">帮助</span>`
  toolbar.appendChild(button)

  const overlay = document.createElement('div')
  overlay.className = 'helpWindowOverlay'
  overlay.hidden = true
  overlay.innerHTML = `
    <section class="helpWindow" role="dialog" aria-modal="true" aria-labelledby="rulesmd-help-title">
      <header class="helpWindowHeader">
        <div><strong id="rulesmd-help-title">帮助文档</strong><span>Rulesmd Editor 使用说明</span></div>
        <button type="button" class="helpWindowClose" aria-label="关闭帮助">${closeIconSvg()}</button>
      </header>
      <div class="helpWindowBody">
        <aside class="helpWindowToc" aria-label="帮助目录">
          <div class="helpWindowTocTitle">目录</div>
          <nav>${parsed.headings.filter(item => item.level >= 2).map(item => `<button type="button" data-help-target="${item.id}" class="level-${item.level}">${escapeHtml(item.text)}</button>`).join('')}</nav>
        </aside>
        <article class="helpWindowContent">${parsed.html}</article>
      </div>
    </section>`
  document.body.appendChild(overlay)

  const closeButton = overlay.querySelector('.helpWindowClose') as HTMLButtonElement
  const content = overlay.querySelector('.helpWindowContent') as HTMLElement
  let previousFocus: HTMLElement | null = null

  const close = () => {
    if (overlay.hidden) return
    overlay.hidden = true
    document.body.classList.remove('helpWindowOpen')
    previousFocus?.focus()
  }

  const open = () => {
    previousFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null
    overlay.hidden = false
    document.body.classList.add('helpWindowOpen')
    content.scrollTop = 0
    closeButton.focus()
  }

  button.addEventListener('click', open)
  closeButton.addEventListener('click', close)
  overlay.addEventListener('mousedown', event => {
    if (event.target === overlay) close()
  })
  overlay.querySelectorAll<HTMLButtonElement>('[data-help-target]').forEach(item => {
    item.addEventListener('click', () => {
      const id = item.dataset.helpTarget
      if (!id) return
      const target = content.querySelector<HTMLElement>(`#${CSS.escape(id)}`)
      target?.scrollIntoView({ block: 'start', behavior: 'smooth' })
    })
  })
  document.addEventListener('keydown', event => {
    if (event.key === 'Escape' && !overlay.hidden) {
      event.preventDefault()
      close()
    }
  })
}
