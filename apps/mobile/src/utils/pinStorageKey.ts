/**
 * SecureStore key for one person's app-lock PIN.
 *
 * expo-secure-store accepts only letters, digits, ".", "-" and "_" in a key. The
 * earlier `userPin:<employeeId>` was rejected on every read and write, so no PIN
 * could ever be set. Anything else an employee ID might carry is replaced for the
 * same reason. No Expo imports, so __tests__/pinStorageKey.test.mjs can run it.
 */
export const SECURE_STORE_KEY_PATTERN = /^[A-Za-z0-9._-]+$/

export function pinStorageKey(employeeId: string): string {
  return `userPin.${employeeId.replace(/[^A-Za-z0-9._-]/g, '_')}`
}
