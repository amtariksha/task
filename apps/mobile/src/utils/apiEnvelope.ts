/**
 * apiClient returns whatever JSON body the server sent. Most routes wrap it as
 * { success, data }, but some answer with the bare value — GET /api/projects
 * returns the array, POST /api/projects the created project — and the web app
 * reads those bare shapes, so the routes stay as they are. A screen that tests
 * `res.success` on a bare body reports a success as a failure; read the body
 * through here instead.
 */

export type ApiResult<T> = { success: true; data: T } | { success: false; error: string }

type JsonObject = Record<string, unknown>

const isObject = (value: unknown): value is JsonObject =>
  typeof value === 'object' && value !== null && !Array.isArray(value)

const nonEmptyString = (value: unknown): string | undefined =>
  typeof value === 'string' && value.length > 0 ? value : undefined

export function unwrapApiBody<T>(body: unknown, fallbackError: string): ApiResult<T> {
  if (body === null || body === undefined) return { success: false, error: fallbackError }
  if (!isObject(body)) return { success: true, data: body as T }

  if (typeof body.success === 'boolean') {
    if (!body.success) {
      return { success: false, error: nonEmptyString(body.error) ?? nonEmptyString(body.message) ?? fallbackError }
    }
    // PUT /api/projects/{id} spreads the record beside `success: true` instead of nesting it.
    return { success: true, data: ('data' in body ? body.data : body) as T }
  }

  // A bare-value route refuses with { error } and no `success`. apiClient does
  // not pass the HTTP status on, so this is the only sign of a 4xx/5xx.
  const refusal = nonEmptyString(body.error)
  if (refusal !== undefined) return { success: false, error: refusal }

  return { success: true, data: body as T }
}

/** As unwrapApiBody, and a success that is not an array counts as a failure. */
export function unwrapApiList<T>(body: unknown, fallbackError: string): ApiResult<T[]> {
  const result = unwrapApiBody<unknown>(body, fallbackError)
  if (!result.success) return result
  return Array.isArray(result.data)
    ? { success: true, data: result.data as T[] }
    : { success: false, error: fallbackError }
}
