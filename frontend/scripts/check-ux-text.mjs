import fs from 'node:fs'
import path from 'node:path'
import process from 'node:process'

const root = process.cwd()
const src = path.join(root, 'src')
const banned = [
  '右键：',
]
const extensions = new Set(['.ts', '.tsx', '.js', '.jsx', '.html'])
const violations = []

function walk(dir) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name)
    if (entry.isDirectory()) {
      walk(full)
      continue
    }
    if (!extensions.has(path.extname(entry.name))) continue
    const text = fs.readFileSync(full, 'utf8')
    for (const token of banned) {
      if (text.includes(token)) violations.push({ file: path.relative(root, full), token })
    }
  }
}

walk(src)

if (violations.length) {
  console.error('\n[UX TEXT RED LINE] Unrequested explanatory text found:\n')
  for (const item of violations) console.error(`- ${item.file}: ${item.token}`)
  console.error('\nSee docs/UX_TEXT_RED_LINES.md.\n')
  process.exit(1)
}

console.log('[UX TEXT] red-line checks passed.')
