/**
 * What a route handler may tell the client about an error it caught.
 *
 * Handlers answered `error instanceof Error ? error.message : '<fallback>'`,
 * which sends driver text to the browser: GET
 * /api/projects/[projectId]/users/[employeeId]/artifacts answered
 * "op ANY/ALL (array) requires array on right side". A node-postgres error can
 * name tables, columns and constraints or quote part of the query.
 *
 * A 5xx now always carries the route's own fixed message, and the detail stays
 * in the server log. The handlers that answer a 4xx with a message their own
 * code threw ("Cannot delete project with sub-projects") still do, through
 * describeFailure, which shows a message only when the app wrote it.
 *
 * No imports, so it runs under `node --test` (see __tests__/client-error.test.mjs).
 */

export interface ClientFailure {
  status: number
  message: string
}

/**
 * True for an error this codebase raised with `new Error('…')`.
 *
 * Anything else was not written for a user: a subclass (node-postgres'
 * DatabaseError, a TypeError, an SDK exception), or an Error that a driver or
 * Node decorated with fields such as `code`, `errno` or `syscall`. That
 * includes a subclass of our own (lib/db/founder's FounderInputError): a
 * handler that wants to show one has to recognise it itself.
 *
 * A bare Error raised inside a library is indistinguishable from one of ours
 * and passes — node-postgres' "Connection terminated unexpectedly" is one. It
 * names no table, column or query, and only reaches a client through a handler
 * that surfaces its own errors as a 4xx.
 */
export function isApplicationError(error: unknown): error is Error {
  return (
    error instanceof Error &&
    Object.getPrototypeOf(error) === Error.prototype &&
    Object.keys(error).length === 0 &&
    error.message.trim() !== ''
  )
}

function isClientErrorStatus(status: number): boolean {
  return status >= 400 && status < 500
}

/**
 * Status and message for a catch block that surfaces what its own code threw.
 *
 * An application error goes out with `ownErrorStatus` (a 4xx) and its message.
 * Everything else is a 500 with `fallback`: log the error before calling this,
 * because nothing of it is returned.
 */
export function describeFailure(error: unknown, fallback: string, ownErrorStatus: number): ClientFailure {
  if (isClientErrorStatus(ownErrorStatus) && isApplicationError(error)) {
    return { status: ownErrorStatus, message: error.message }
  }
  return { status: 500, message: fallback }
}
