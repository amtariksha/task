// Run: npm test (node --experimental-strip-types --test)
import { test, describe } from 'node:test'
import assert from 'node:assert/strict'
import {
  hasRichFormatting,
  htmlToPlainText,
  plainTextToHtml,
  previewText,
  sectionContentUnchanged,
} from '../requirementHelpers.ts'

describe('hasRichFormatting', () => {
  // The defect: saving a formatted section on mobile rewrote its HTML from the
  // plain-text projection, silently destroying lists, headings and emphasis.
  test('flags everything the plain-text round trip cannot rebuild', () => {
    assert.equal(hasRichFormatting('<ul><li>one</li></ul>'), true)
    assert.equal(hasRichFormatting('<h2>Heading</h2>'), true)
    assert.equal(hasRichFormatting('<p><strong>bold</strong></p>'), true)
    assert.equal(hasRichFormatting('<p><a href="https://x">link</a></p>'), true)
    assert.equal(hasRichFormatting('<table><tr><td>a</td></tr></table>'), true)
  })

  test('plain paragraphs and line breaks are safe to edit', () => {
    assert.equal(hasRichFormatting('<p>one</p><p>two</p>'), false)
    assert.equal(hasRichFormatting('<p>one<br>two</p>'), false)
    assert.equal(hasRichFormatting(''), false)
    assert.equal(hasRichFormatting('bare text'), false)
  })

  test('a styled paragraph is still formatting', () => {
    assert.equal(hasRichFormatting('<p style="text-align:center">one</p>'), true)
    assert.equal(hasRichFormatting('<p class="lead">one</p>'), true)
  })

  test('an unrecognised tag counts as formatting rather than being flattened', () => {
    assert.equal(hasRichFormatting('<blockquote>quoted</blockquote>'), true)
  })
})

describe('sectionContentUnchanged', () => {
  // Every save writes a revision and returns an Approved requirement to In Review,
  // so opening a section and closing it must not count as an edit.
  test('an untouched round trip is unchanged', () => {
    const stored = '<p>one</p><p>two</p>'
    assert.equal(sectionContentUnchanged(stored, htmlToPlainText(stored)), true)
  })

  test('trailing whitespace alone is not a change', () => {
    assert.equal(sectionContentUnchanged('<p>one</p>', 'one\n\n'), true)
  })

  test('a real edit is a change', () => {
    assert.equal(sectionContentUnchanged('<p>one</p>', 'one two'), false)
  })

  test('emptying a section is a change', () => {
    assert.equal(sectionContentUnchanged('<p>one</p>', ''), false)
  })
})

describe('htmlToPlainText', () => {
  test('block closers and breaks become newlines', () => {
    assert.equal(htmlToPlainText('<p>one</p><p>two</p>'), 'one\ntwo')
    assert.equal(htmlToPlainText('<p>one<br>two</p>'), 'one\ntwo')
  })

  test('list items are bulleted', () => {
    assert.equal(htmlToPlainText('<ul><li>one</li><li>two</li></ul>'), '• one\n• two')
  })

  test('entities are decoded', () => {
    assert.equal(htmlToPlainText('<p>a &amp; b &lt;c&gt;</p>'), 'a & b <c>')
  })

  test('empty input is an empty string', () => {
    assert.equal(htmlToPlainText(''), '')
  })
})

describe('plainTextToHtml', () => {
  test('blank lines split paragraphs and single newlines become breaks', () => {
    assert.equal(plainTextToHtml('one\n\ntwo'), '<p>one</p><p>two</p>')
    assert.equal(plainTextToHtml('one\ntwo'), '<p>one<br>two</p>')
  })

  test('angle brackets are escaped, not injected', () => {
    assert.equal(plainTextToHtml('<script>x</script>'), '<p>&lt;script&gt;x&lt;/script&gt;</p>')
  })

  test('whitespace-only text produces nothing', () => {
    assert.equal(plainTextToHtml('   \n  '), '')
  })
})

describe('previewText', () => {
  test('truncates with an ellipsis and collapses whitespace', () => {
    assert.equal(previewText('<p>one   two</p>'), 'one two')
    assert.equal(previewText('<p>' + 'a'.repeat(200) + '</p>', 10), 'aaaaaaaaaa…')
  })
})
