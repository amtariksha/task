/**
 * API Route: /api/feed/og-preview
 * Purpose: Fetch Open Graph metadata from a URL
 * Methods: GET
 */

import { NextRequest, NextResponse } from 'next/server'
import { getAuthUser } from '@/lib/auth-server'

/**
 * GET /api/feed/og-preview?url=<url>
 * Fetch Open Graph metadata from a URL
 */
export async function GET(request: NextRequest) {
  try {
    // Authenticate user
    const user = await getAuthUser(request)
    if (!user) {
      return NextResponse.json(
        { success: false, error: 'Unauthorized' },
        { status: 401 }
      )
    }

    const { searchParams } = new URL(request.url)
    const url = searchParams.get('url')

    if (!url) {
      return NextResponse.json(
        { success: false, error: 'URL parameter is required' },
        { status: 400 }
      )
    }

    // Validate URL format
    try {
      new URL(url)
    } catch {
      return NextResponse.json(
        { success: false, error: 'Invalid URL format' },
        { status: 400 }
      )
    }

    // Fetch the URL
    const response = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (compatible; JSR-Feed-Bot/1.0)',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8'
      },
      signal: AbortSignal.timeout(10000) // 10 second timeout
    })

    if (!response.ok) {
      console.error(`Failed to fetch URL: ${url}, Status: ${response.status} ${response.statusText}`)
      return NextResponse.json(
        {
          success: false,
          error: `Failed to fetch URL (${response.status} ${response.statusText})`,
          details: `The target website returned an error. Please check if the URL is accessible.`
        },
        { status: 200 } // Return 200 with error details instead of 400
      )
    }

    const html = await response.text()

    // Extract Open Graph metadata
    const ogTitle = extractMetaTag(html, 'og:title') || extractTitle(html)
    const ogDescription = extractMetaTag(html, 'og:description') || extractMetaTag(html, 'description')
    const ogImage = extractMetaTag(html, 'og:image')
    const ogUrl = extractMetaTag(html, 'og:url') || url

    // Log successful extraction
    console.log(`OG Preview extracted for ${url}:`, {
      title: ogTitle ? 'Found' : 'Not found',
      description: ogDescription ? 'Found' : 'Not found',
      image: ogImage ? 'Found' : 'Not found'
    })

    return NextResponse.json({
      success: true,
      data: {
        title: ogTitle || 'No title found',
        description: ogDescription || '',
        image: ogImage || '',
        url: ogUrl
      }
    })
  } catch (error) {
    console.error('Error fetching OG preview:', error)

    // AbortSignal.timeout rejects with a DOMException named TimeoutError.
    const isTimeout = error instanceof Error && (error.name === 'TimeoutError' || error.name === 'AbortError')

    return NextResponse.json(
      {
        success: false,
        error: isTimeout
          ? 'Request timed out. The website took too long to respond.'
          : 'Failed to fetch preview. Please check the URL and try again.'
      },
      { status: 200 } // Return 200 so the client reads the message from the body
    )
  }
}

/**
 * Extract meta tag content from HTML
 */
function extractMetaTag(html: string, property: string): string | null {
  // Try og: property
  const ogRegex = new RegExp(`<meta[^>]*property=["']og:${property.replace('og:', '')}["'][^>]*content=["']([^"']*)["']`, 'i')
  const ogMatch = html.match(ogRegex)
  if (ogMatch) return ogMatch[1]

  // Try name attribute
  const nameRegex = new RegExp(`<meta[^>]*name=["']${property}["'][^>]*content=["']([^"']*)["']`, 'i')
  const nameMatch = html.match(nameRegex)
  if (nameMatch) return nameMatch[1]

  // Try reversed order (content before property/name)
  const reversedOgRegex = new RegExp(`<meta[^>]*content=["']([^"']*)["'][^>]*property=["']og:${property.replace('og:', '')}["']`, 'i')
  const reversedOgMatch = html.match(reversedOgRegex)
  if (reversedOgMatch) return reversedOgMatch[1]

  const reversedNameRegex = new RegExp(`<meta[^>]*content=["']([^"']*)["'][^>]*name=["']${property}["']`, 'i')
  const reversedNameMatch = html.match(reversedNameRegex)
  if (reversedNameMatch) return reversedNameMatch[1]

  return null
}

/**
 * Extract title from HTML
 */
function extractTitle(html: string): string | null {
  const titleRegex = /<title[^>]*>([^<]*)<\/title>/i
  const match = html.match(titleRegex)
  return match ? match[1] : null
}

