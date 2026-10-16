// Run: npm test (node --experimental-strip-types --test)
//
// Fixtures are trimmed copies of the shapes the stores served in October 2026,
// with made-up apps. If a store changes its page, update the fixture from a
// fresh fetch and keep the assertions: they describe what the tab relies on.
import { test, describe } from 'node:test'
import assert from 'node:assert/strict'
import { compareVersions, isVersionString, pickCurrentAndPrevious, sortVersionsDesc } from '../versions.ts'
import {
  appStoreLookupUrl,
  appStorePageUrl,
  parseAppStoreUrl,
  parsePlayStoreUrl,
  playStorePageUrl,
} from '../store-urls.ts'
import { parseAppStoreHistory, parseAppStoreLookup, parsePlayStorePage } from '../store-parsers.ts'

describe('compareVersions', () => {
  test('compares segments as numbers, not strings', () => {
    assert.ok(compareVersions('2.1.16', '2.1.2') > 0)
    assert.ok(compareVersions('1.10.0', '1.9.9') > 0)
    assert.ok(compareVersions('1.4', '1.4.1') < 0)
  })

  test('treats missing trailing segments as zero', () => {
    assert.equal(compareVersions('1.4', '1.4.0'), 0)
  })

  test('ranks a final release above its pre-release', () => {
    assert.ok(compareVersions('1.4.0', '1.4.0-beta') > 0)
  })

  test('isVersionString rejects store placeholders', () => {
    assert.equal(isVersionString('2.1.16'), true)
    assert.equal(isVersionString('Varies with device'), false)
    assert.equal(isVersionString(''), false)
  })
})

describe('pickCurrentAndPrevious', () => {
  test('picks the two highest versions regardless of input order', () => {
    const { current, previous } = pickCurrentAndPrevious([
      { version: '2.0.6' },
      { version: '2.1.16' },
      { version: '2.1.2' },
    ])
    assert.equal(current.version, '2.1.16')
    assert.equal(previous.version, '2.1.2')
  })

  test('returns nulls for an app with no versions yet', () => {
    assert.deepEqual(pickCurrentAndPrevious([]), { current: null, previous: null })
  })

  test('sortVersionsDesc breaks a version tie by the later date', () => {
    const sorted = sortVersionsDesc([
      { version: '1.0.0', releasedAt: '2026-01-01T00:00:00.000Z', id: 'old' },
      { version: '1.0.0', releasedAt: '2026-02-01T00:00:00.000Z', id: 'new' },
    ])
    assert.equal(sorted[0].id, 'new')
  })
})

describe('parseAppStoreUrl', () => {
  test('reads the id and storefront from a share link', () => {
    assert.deepEqual(parseAppStoreUrl('https://apps.apple.com/in/app/demo-app/id1234567890?uo=4'), {
      appId: '1234567890',
      country: 'in',
    })
  })

  test('defaults the storefront to us and accepts a link without a scheme', () => {
    assert.deepEqual(parseAppStoreUrl('apps.apple.com/app/id1234567890'), { appId: '1234567890', country: 'us' })
  })

  test('rejects other hosts, so a pasted link cannot steer the server fetch', () => {
    assert.equal(parseAppStoreUrl('https://evil.example.com/in/app/x/id1234567890'), null)
    assert.equal(parseAppStoreUrl('https://apps.apple.com.evil.example/app/id1234567890'), null)
    assert.equal(parseAppStoreUrl('not a url'), null)
  })

  test('builds canonical urls from the id alone', () => {
    const ref = { appId: '1234567890', country: 'in' }
    assert.equal(appStorePageUrl(ref), 'https://apps.apple.com/in/app/id1234567890')
    assert.equal(appStoreLookupUrl(ref), 'https://itunes.apple.com/lookup?id=1234567890&country=in')
  })
})

describe('parsePlayStoreUrl', () => {
  test('reads the package from a details link with extra params', () => {
    assert.deepEqual(parsePlayStoreUrl('https://play.google.com/store/apps/details?id=com.example.demo&hl=en_IN&pli=1'), {
      packageName: 'com.example.demo',
    })
  })

  test('rejects non-details pages, other hosts and malformed packages', () => {
    assert.equal(parsePlayStoreUrl('https://play.google.com/store/apps/developer?id=Example'), null)
    assert.equal(parsePlayStoreUrl('https://example.com/store/apps/details?id=com.example.demo'), null)
    assert.equal(parsePlayStoreUrl('https://play.google.com/store/apps/details?id=nodots'), null)
    assert.equal(parsePlayStoreUrl('https://play.google.com/store/apps/details?id=com.x%26y'), null)
  })

  test('builds the canonical English page url', () => {
    assert.equal(
      playStorePageUrl({ packageName: 'com.example.demo' }),
      'https://play.google.com/store/apps/details?id=com.example.demo&hl=en&gl=US'
    )
  })
})

describe('parseAppStoreLookup', () => {
  test('reads name, icon and the current version', () => {
    const listing = parseAppStoreLookup({
      resultCount: 1,
      results: [
        {
          trackName: 'Demo App',
          artworkUrl512: 'https://is1-ssl.mzstatic.com/demo/512x512bb.jpg',
          version: '3.2.1',
          currentVersionReleaseDate: '2026-10-01T10:00:00Z',
          releaseNotes: 'Bug fixes',
        },
      ],
    })
    assert.equal(listing.name, 'Demo App')
    assert.equal(listing.iconUrl, 'https://is1-ssl.mzstatic.com/demo/512x512bb.jpg')
    assert.deepEqual(listing.versions, [
      { version: '3.2.1', releasedAt: '2026-10-01T10:00:00.000Z', notes: 'Bug fixes' },
    ])
  })

  test('returns null when the app is not in that storefront', () => {
    assert.equal(parseAppStoreLookup({ resultCount: 0, results: [] }), null)
  })
})

describe('parseAppStoreHistory', () => {
  const page = (payload) =>
    `<html><script type="application/json" id="serialized-server-data">${JSON.stringify(payload)}</script></html>`

  const historyPayload = {
    data: [
      {
        shelves: {
          mostRecentVersion: {
            items: [{ primarySubtitle: 'Version 3.2.1', text: 'What is new' }],
            seeAllAction: {
              page: 'versionHistory',
              pageData: {
                shelves: [
                  {
                    items: [
                      {
                        primarySubtitle: '3.2.1',
                        secondarySubtitle: 'Thu Oct 01 2026 10:00:00 GMT+0000 (Coordinated Universal Time)',
                        text: '- Bug Fixes',
                      },
                      {
                        primarySubtitle: '3.2.0',
                        secondarySubtitle: 'Mon Sep 21 2026 08:30:00 GMT+0000 (Coordinated Universal Time)',
                        text: '',
                      },
                    ],
                  },
                ],
              },
            },
          },
        },
      },
    ],
  }

  test('lists every version with its UTC date and notes', () => {
    assert.deepEqual(parseAppStoreHistory(page(historyPayload)), [
      { version: '3.2.1', releasedAt: '2026-10-01T10:00:00.000Z', notes: '- Bug Fixes' },
      { version: '3.2.0', releasedAt: '2026-09-21T08:30:00.000Z', notes: null },
    ])
  })

  test('returns [] for a page without the blob or with broken JSON', () => {
    assert.deepEqual(parseAppStoreHistory('<html></html>'), [])
    assert.deepEqual(
      parseAppStoreHistory('<script id="serialized-server-data">{not json</script>'),
      []
    )
  })
})

describe('parsePlayStorePage', () => {
  const playPage = ({ version = '4.0.2', withNotes = true } = {}) =>
    [
      '<meta property="og:title" content="Demo &amp; Co - Apps on Google Play">',
      '<meta property="og:image" content="https://play-lh.googleusercontent.com/demo=s0">',
      "<script>AF_initDataCallback({key: 'ds:5', data:[{",
      `"141":[[["${version}"]],[[[36]],[[[24,"7.0"]]]]],`,
      withNotes ? '"145":[null,[null,"Faster sync\\u003cbr\\u003eFixes"]],' : '',
      '"146":[["Oct 1, 2026",[1790848800,0]]]',
      '}]});</script>',
    ].join('')

  test('reads name, icon, current version, update date and notes', () => {
    assert.deepEqual(parsePlayStorePage(playPage()), {
      name: 'Demo & Co',
      iconUrl: 'https://play-lh.googleusercontent.com/demo=s0',
      versions: [{ version: '4.0.2', releasedAt: '2026-10-01T10:00:00.000Z', notes: 'Faster sync\nFixes' }],
    })
  })

  test('tolerates a listing without "What\'s new"', () => {
    assert.equal(parsePlayStorePage(playPage({ withNotes: false })).versions[0].notes, null)
  })

  test('reports no version when Play shows "Varies with device"', () => {
    assert.deepEqual(parsePlayStorePage(playPage({ version: 'Varies with device' })).versions, [])
  })

  test('returns null for something that is not a Play page', () => {
    assert.equal(parsePlayStorePage('<html>captcha</html>'), null)
  })
})
