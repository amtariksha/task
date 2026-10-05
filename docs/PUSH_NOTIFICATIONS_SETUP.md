# Push Notifications: Expo and Firebase Setup

**Last Updated:** 2026-09-17
**Audience:** founder / whoever holds the Expo and Firebase accounts

A live push test on 2026-09-17 sent to AM-0001's 5 active Android tokens. Expo
rejected 2 of them with:

> `Unable to retrieve the FCM server key for the recipient's app`

This is an Expo/Firebase credentials problem. It cannot be fixed in code, and
no credentials were changed as part of this work. This page covers:

- what the repo says about the setup
- the likely cause
- what to configure

---

## 1. What the repo says

| Item | Value | Where |
|---|---|---|
| Expo project ID | `46456ef5-ee4f-49dc-b244-f265d16402d6` | `apps/mobile/app.json` → `expo.extra.eas.projectId` |
| Expo project owner | `whokevalshah` (a personal Expo account) | `apps/mobile/app.json` → `expo.owner` |
| Android application ID | `com.karmayog` | `apps/mobile/app.json` → `android.package`; `apps/mobile/android/app/build.gradle` → `applicationId` |
| Firebase project | `karmayog-task` (sender ID `242622641703`), Android client `com.karmayog` | `apps/mobile/android/app/google-services.json` (committed 2026-06-12) |
| iOS Firebase config | same project, bundle `com.karmayog` | `apps/mobile/ios/GoogleService-Info.plist` |
| Token creation | `getExpoPushTokenAsync({ projectId })`, which reads the project ID from the app config | `apps/mobile/src/services/pushNotificationService.ts` |
| Token registration | on every app start while signed in; upserts `push_tokens` and refreshes `last_used_at` | `apps/mobile/src/App.tsx`, `apps/web/src/graphql/push-token-resolvers.ts` |
| Android builds | local Gradle (`./gradlew assembleRelease`) through `apps/mobile/deploy.sh`, `apps/mobile/mobile-deploy.sh` and `build_local.sh`, not EAS Build | — |

**History that matters:**

- **Before 2026-05-23:** the app was `com.jsr.taskmanagement` on Expo project
  `d5eaa1b3-d1a5-4f59-836b-814831a766dd`.
- **2026-05-23:** the rebrand changed the app ID to `com.karmayog`. Commit
  `e5d008d` moved the app to project `46456ef5-…` under `whokevalshah`.
- **2026-06-12:** `google-services.json` (FCM) was added.

**Stale config — watch out:** the repo-root `app.json` still points at the old
project `d5eaa1b3-…` with package `com.amtariksha.jsrtaskmanagement`. `eas`
reads the `app.json` in the current directory, so run every `eas` command from
`apps/mobile`, never from the repo root.

**The server side is not the cause.** It posts all of a user's tokens to Expo
in one request, and Expo accepted 3 of the 5. The error came from Expo's own
credentials lookup for the other 2.

## 2. Likely cause

Expo stores FCM V1 keys per project and per Android application identifier.
This error means Expo found no usable FCM key for the app those 2 tokens were
issued to. Two explanations fit:

1. **Old or foreign installs.** The 2 tokens were issued to an install whose
   application identifier has no FCM V1 key in Expo, for example a build from
   around the rebrand or a test build with a different app ID.
   - A token from a *different* Expo project would have failed the whole request
     with `PUSH_TOO_MANY_EXPERIENCE_IDS`, so these tokens are most likely in the
     same project.
   - `push_tokens` rows only become inactive on sign-out or
     `DeviceNotRegistered`, so an uninstalled or replaced app can leave active
     rows behind.
2. **No FCM V1 key for `com.karmayog` at all.** The 3 "ok" tickets only mean
   Expo queued them. Delivery failures show up later in push receipts, and the
   server does not read receipts.

Steps 2 and 5 below tell the two apart.

## 3. What to configure

1. **Get access to the Expo project.** It belongs to the personal account
   `whokevalshah`. Ask that account's owner to add you, or do the next steps
   together.
2. **Check the existing credentials.** On expo.dev, open project `karmayog`
   (`46456ef5-…`) → **Credentials** → **Android**.
   - Is there an application identifier `com.karmayog` with a **FCM V1 service
     account key** under *Service Credentials*?
   - Note any other application identifiers listed.
3. **Upload an FCM V1 key if it is missing.** Follow `DEPLOYMENT_GUIDE.md` →
   *Push Notifications (Expo / FCM)* → Step 2.
   - The key must come from the Firebase project `karmayog-task`, the same one
     as `google-services.json`. A key from any other project gives
     `MismatchSenderId` errors.
   - If you use the CLI: `cd apps/mobile && eas credentials`.
4. **Check the Firebase API key restrictions.** If the API key in
   `google-services.json` is restricted in Google Cloud, it must allow the
   **FCM Registration API** and the **Firebase Installations API**. Otherwise
   devices never get a token.
5. **Find the 2 failing tokens.**
   1. Deploy this change and send a test push. Server logs now look like this:
      ```
      [sendPushNotification] Error for token ExponentPushToken[abcdef…] (InvalidCredentials): …
      ```
   2. Match the 6-character prefix against this read-only query:
      ```sql
      SELECT left(split_part(push_token, '[', 2), 6) AS token_prefix,
             device_id, created_at, last_used_at
      FROM push_tokens
      WHERE user_id = 'AM-0001' AND is_active = true AND device_type = 'android'
      ORDER BY last_used_at DESC;
      ```
   A `last_used_at` weeks older than the other rows means that install has not
   opened the app since then. `device_id` is the phone's device name.
6. **Clean up stale rows (your call).**
   - If the device still has the current app: open it signed in. That
     re-registers the token.
   - If the install is gone: deactivate the row. Don't delete it.
   ```sql
   UPDATE push_tokens
   SET is_active = false, updated_at = CURRENT_TIMESTAMP
   WHERE user_id = 'AM-0001' AND is_active = true
     AND left(split_part(push_token, '[', 2), 6) IN ('<prefix-1>', '<prefix-2>');
   ```
7. **Optional: enhanced push security.** Create an Expo access token and set
   `EXPO_ACCESS_TOKEN` in Vercel. Redeploy and confirm a test push arrives.
   Only then enable *Enhanced Security for Push Notifications* in Expo. Once it
   is on, pushes without the token fail with `UNAUTHORIZED`. See
   `DEPLOYMENT_GUIDE.md` → Step 1.

## 4. Why the server keeps these tokens active

Expo documents only `DeviceNotRegistered` as permanent ("stop sending messages
to the corresponding Expo push token"). `InvalidCredentials` and
`MismatchSenderId` are project credential problems: once the key is fixed, the
same tokens deliver again. The server therefore deactivates tokens only on
`DeviceNotRegistered` (`isPermanentTokenError` in
`apps/web/src/lib/expo-push.ts`).

Sources:
- https://docs.expo.dev/push-notifications/sending-notifications/#errors
- https://docs.expo.dev/push-notifications/fcm-credentials/

## 5. Known gaps (not addressed here)

- **No receipt checks.** The server never calls Expo's `getReceipts`, so
  receipt-only failures are never logged. That includes `DeviceNotRegistered`
  after an uninstall, so stale tokens stay active.
- **Device-side token logging.** The mobile app still logs the first 20
  characters of its push token on the device (`apps/mobile/src/App.tsx`).
