/**
 * Requirement helpers — status/label styling and HTML⇄plain-text conversion.
 *
 * The web editor stores rich HTML (Tiptap). Mobile has no HTML renderer, so we
 * show sections as plain text and, when a section is edited on mobile, convert
 * the edited plain text back to simple, server-sanitizable HTML.
 *
 * That round trip is LOSSY: anything beyond paragraphs and line breaks — lists,
 * headings, bold, links, tables — cannot be reconstructed from the plain text, so
 * saving a formatted section on mobile silently destroyed its formatting (and,
 * because any save adds a revision, sent an Approved requirement back to In
 * Review for nothing). hasRichFormatting() identifies those sections so the UI can
 * show them read-only, and sectionContentUnchanged() lets a screen skip a save
 * that would change nothing.
 */

export const REQUIREMENT_STATUSES = [
  'Draft',
  'In Review',
  'Approved',
  'Rejected',
  'Implemented',
  'Verified',
  'Deprecated',
] as const

export const SECTION_LABELS = [
  'Functional',
  'Non-Functional',
  'Constraint',
  'Acceptance Criteria',
  'Note',
] as const

export interface BadgeStyle {
  bg: string
  text: string
}

/**
 * Fixed pastel badge palette — mirrors the existing mobile badge approach
 * (ProjectDetailsScreen) which uses light backgrounds that read well in both
 * light and dark themes.
 */
export function getRequirementStatusStyle(status: string): BadgeStyle {
  switch (status) {
    case 'Draft':
      return { bg: '#F1F3F4', text: '#5F6368' }
    case 'In Review':
      return { bg: '#FEF7E0', text: '#B06000' }
    case 'Approved':
      return { bg: '#E6F4EA', text: '#137333' }
    case 'Rejected':
      return { bg: '#FCE8E6', text: '#C5221F' }
    case 'Implemented':
      return { bg: '#E8F0FE', text: '#1967D2' }
    case 'Verified':
      return { bg: '#E4F7EC', text: '#0B8043' }
    case 'Deprecated':
      return { bg: '#F1F3F4', text: '#80868B' }
    default:
      return { bg: '#F1F3F4', text: '#5F6368' }
  }
}

export function getSectionLabelStyle(label: string): BadgeStyle {
  switch (label) {
    case 'Functional':
      return { bg: '#E8F0FE', text: '#1967D2' }
    case 'Non-Functional':
      return { bg: '#F3E8FD', text: '#8430CE' }
    case 'Constraint':
      return { bg: '#FEF7E0', text: '#B06000' }
    case 'Acceptance Criteria':
      return { bg: '#E6F4EA', text: '#137333' }
    case 'Note':
      return { bg: '#F1F3F4', text: '#5F6368' }
    default:
      return { bg: '#F1F3F4', text: '#5F6368' }
  }
}

/** Decode the handful of HTML entities that survive tag-stripping. */
function decodeEntities(input: string): string {
  return input
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'")
    .replace(/&apos;/gi, "'")
}

/**
 * Convert stored section HTML to readable plain text for display/editing.
 * Block-level closers and <br> become newlines; list items are bulleted.
 */
export function htmlToPlainText(html: string): string {
  if (!html) return ''
  const withBreaks = html
    .replace(/\r\n/g, '\n')
    .replace(/<\s*br\s*\/?\s*>/gi, '\n')
    .replace(/<\s*li[^>]*>/gi, '• ')
    .replace(/<\/\s*(p|div|li|h[1-6]|tr)\s*>/gi, '\n')
  const stripped = withBreaks.replace(/<[^>]+>/g, '')
  return decodeEntities(stripped)
    .replace(/\n{3,}/g, '\n\n')
    .replace(/[ \t]+\n/g, '\n')
    .replace(/^\s+|\s+$/g, '')
}

/** Escape text before wrapping in HTML tags. */
function escapeHtml(input: string): string {
  return input
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
}

/**
 * Convert edited plain text back to simple HTML for persistence. Blank lines
 * split paragraphs; single newlines become <br>. Output is minimal and is
 * re-sanitized server-side on write.
 */
export function plainTextToHtml(text: string): string {
  if (!text || !text.trim()) return ''
  const paragraphs = text
    .replace(/\r\n/g, '\n')
    .split(/\n{2,}/)
    .map((p) => p.trim())
    .filter((p) => p.length > 0)
  return paragraphs
    .map((p) => `<p>${escapeHtml(p).replace(/\n/g, '<br>')}</p>`)
    .join('')
}

/**
 * Tags the plain-text round trip can reproduce. A section containing only these
 * survives an edit on mobile unchanged; anything else does not.
 */
const LOSSLESS_TAGS = new Set(['p', 'br', 'div'])

/**
 * Does this section carry formatting that a mobile edit would destroy?
 *
 * Errs towards true: an unrecognised tag counts as formatting, because the cost of
 * a false positive is "edit this on the web" and the cost of a false negative is
 * silently flattening someone's document.
 */
export function hasRichFormatting(html: string): boolean {
  if (!html) return false
  const tagPattern = /<\s*\/?\s*([a-zA-Z][a-zA-Z0-9]*)\b[^>]*>/g
  let match: RegExpExecArray | null
  while ((match = tagPattern.exec(html)) !== null) {
    if (!LOSSLESS_TAGS.has(match[1].toLowerCase())) return true
  }
  // A styled paragraph is still formatting we cannot rebuild.
  return /<\s*(p|div)\b[^>]*(style|class)\s*=/i.test(html)
}

/**
 * Would saving this plain text leave the stored HTML as it is? Used to skip a
 * no-op save: every save writes a revision and returns an approved requirement to
 * review, so saving an untouched section had real consequences.
 */
export function sectionContentUnchanged(storedHtml: string, editedText: string): boolean {
  return plainTextToHtml(editedText) === plainTextToHtml(htmlToPlainText(storedHtml))
}

/** Short preview of a section's text for list/collapsed rows. */
export function previewText(html: string, max = 140): string {
  const text = htmlToPlainText(html).replace(/\s+/g, ' ').trim()
  if (text.length <= max) return text
  return text.slice(0, max).trimEnd() + '…'
}
