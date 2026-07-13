import { defineConfig } from 'vite'

/** GitHub Pages project site base: /<repo>/ — set VITE_BASE in CI. */
function pagesBase(): string {
  const raw = process.env.VITE_BASE
  if (!raw) return '/'

  // Git Bash on Windows may expand "/repo/" into a drive path like C:/.../repo
  if (/^[A-Za-z]:/.test(raw) || raw.includes('\\')) {
    const parts = raw.replace(/\\/g, '/').split('/').filter(Boolean)
    const repo = parts[parts.length - 1]
    return `/${repo}/`
  }

  const withSlash = raw.startsWith('/') ? raw : `/${raw}`
  return withSlash.endsWith('/') ? withSlash : `${withSlash}/`
}

export default defineConfig({
  base: pagesBase(),
})
