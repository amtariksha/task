# Karmayog — Founder Start: User Manual

**Version:** 1.3  
**Last Updated:** 2026-10-10  
**For:** Founder (AM-0001) and platform admins  
**App version:** mobile 1.4.0 (build 22)

---

## Changelog
- **2026-10-10 (1.3)**: Re-baselined on mobile 1.4.0 (build 22) and the current web app. The manual now describes the app as it is today, and everything that differs in an older version is in one table, [If you are on an older version](#if-you-are-on-an-older-version). New sections: [Brain Dump](#brain-dump) and [Offline on mobile](#offline-on-mobile) (what works without a connection, and the **System Maintenance** screen). Rewritten: [What's New in 1.4.0](#whats-new-in-140), [Security PIN](#security-pin) (a PIN can be set from the fix merged on 2026-10-06), [Getting Everything Out of Your Head](#getting-everything-out-of-your-head) (projects and tasks now work on the phone), [Start is missing](#start-is-missing) (the founder check is logged) and what an expired session does (the app signs you out). New for admins: [What you see in each company](#what-you-see-in-each-company), the requirements rule, the optional `EXPO_ACCESS_TOKEN`, the push setup guide, masked push tokens in the logs, [Server changes merged on 2026-10-05](#server-changes-merged-on-2026-10-05) and the code paths.
- **2026-10-05 (1.2.1)**: What the earlier entries called "the next mobile build" is now named: mobile 1.4.0 (build 22).
- **2026-10-05 (1.2)**: Updated for mobile 1.3.0 (build 21) and the current web app. New sections: What's New in 1.3.0 (replaced in manual version 1.3), [Security PIN](#security-pin), [Getting Everything Out of Your Head](#getting-everything-out-of-your-head), [Start is missing](#start-is-missing) (a step-by-step check) and [Companies, Roles, Secrets and Approvals](#companies-roles-secrets-and-approvals). Changed for 1.3.0: the rank screen asks before discarding, close-out text stops at 2000 characters, the Notifications row opens Start, the security PIN is optional, and a company switch reloads Start. Corrections: the in-app notification title, what an expired session does on mobile (the automatic sign-out on Start is not in 1.3.0), the migration 065 note, the cron check now in `proxy.ts`, and code paths.
- **2026-09-17 (1.1)**: Review corrections: weekday names in the examples, parked-thread labels, thread deletion, deleted projects, push timing and failure checks, nested repos in the machine scripts, token setup, first-morning checklist, adding a founder and calling the API.
- **2026-09-17**: First version of the Founder Start manual. Covers the mobile app (1.2.0, build 20), the web page at `/start`, the 09:00 IST push, the scripts on the founder's machine and admin setup.

---

## Table of Contents
1. [What's New in 1.4.0](#whats-new-in-140)
2. [What Start Is](#what-start-is)
3. [Key Ideas](#key-ideas)
4. [How the Top 3 Is Chosen](#how-the-top-3-is-chosen)
5. [Opening Start](#opening-start)
6. [The Start Screen](#the-start-screen)
7. [Daily Close-out](#daily-close-out)
8. [Ranking Threads for the Week](#ranking-threads-for-the-week)
9. [Managing Threads](#managing-threads)
10. [Brain Dump](#brain-dump)
11. [Getting Everything Out of Your Head](#getting-everything-out-of-your-head)
12. [The 09:00 Push](#the-0900-push)
13. [Automatic Activity from Your Machine](#automatic-activity-from-your-machine)
14. [Working with Claude](#working-with-claude)
15. [FAQ](#faq)
16. [Troubleshooting](#troubleshooting)
17. [For Admins](#for-admins)

---

## What's New in 1.4.0

The current app is mobile 1.4.0 (build 22). This manual describes it, and the web app, as they are today. To see which version is on your phone, open the drawer and tap **Account**: the last line, under **Logout**, reads **Version** and the number. On the current app it is **Version 1.4.0**.

| New in 1.4.0 | What you see |
|--------------|--------------|
| **Brain dump** | On Start, **⋮** → **Brain dump**: type, dictate or paste everything in your head, one thought per line, check the rows and save them all as threads in one go. The text is kept as a draft until it is saved. See [Brain Dump](#brain-dump). |
| An expired session signs you out | When your session runs out, the app shows the sign-in screen by itself, on Start as well as on Feed, Notifications and Attendance. Sign in again with OTP. See [Opening Start](#opening-start). |
| The founder check is logged | When the phone cannot confirm that you are a founder, the reason is listed in **Debug Menu** → **Logs**. When the server says yes but the phone cannot store the answer, Start still appears. See [Start is missing](#start-is-missing). |
| Projects on the phone | **Add New Project** and **Create Sub-Project** say **Project created successfully** and **Subproject created successfully** when the project is created. |
| **Create Task** on the phone | **Project \*** lists your real projects, and **Subproject** lists only that project's sub-projects. |
| **Rank threads** | **Save** shows **Ranks saved** and goes straight back to Start. |

One fix was merged on 2026-10-06, after the 1.4.0 version stamp: the security PIN can be set. It changed neither the version name nor the build number, so the code still says 1.4.0 (build 22). See [Security PIN](#security-pin).

### If you are on an older version

This table is the one place where this manual describes older versions. Everywhere else it describes the app as it is now. 1.4.0 has two columns, and both are 1.4.0 (build 22): the fix merged on 2026-10-06 changed neither number. "Code of 2026-10-05" is a build made before that fix. "Current code" is a build made from the code as it is now, which includes it.

An app older than 1.2.0 (for example 1.1.9) has no Start at all: there is no **Start** in the drawer, and the 09:00 push opens **Notifications**.

| What | 1.2.0 (build 20) | 1.3.0 (build 21) | 1.4.0 (build 22), code of 2026-10-05 | 1.4.0 (build 22), current code |
|------|------------------|------------------|------------------|----------------|
| **Brain dump** in the **⋮** menu | Not there. The menu has five items. Enter threads with the close-out (**+ new**) or **Add thread**. | Not there, as in 1.2.0 | Yes | Yes |
| An expired session on Start, Feed, Notifications or Attendance | Those screens just fail to load. Start can show **UNAUTHENTICATED: You must be signed in.** Open **Home** or **Account**, or tap **Logout** in the drawer, and sign in again. | As in 1.2.0 | The app signs you out by itself | Same |
| A founder check that fails | Leaves no trace in the app. If the phone cannot store the server's answer, Start stays hidden until a later check succeeds. | As in 1.2.0 | Listed in **Debug Menu** → **Logs**. Start still appears when only the storing failed. | Same |
| **Add New Project** and **Create Sub-Project** | Show **Failed to create project** (or **Failed to create subproject**) even when the project was created. Check **Projects** before trying again, or you get a duplicate. | As in 1.2.0 | Report success | Same |
| **Project \*** in **Create Task** | Lists five built-in names (**dsn**, **amtariksha**, **task management**, **swarg**, **other**), and the sub-project list three (**testing**, **development**, **reporting**). None is a real project. Create tasks on the web. | As in 1.2.0 | Lists your real projects and their sub-projects | Same |
| **Save** on **Rank threads** | Goes straight back to Start | Then asks **Discard your new order?** Tap **Discard**: the ranks are already saved. | Goes straight back to Start | Same |
| Leaving **Rank threads** with an unsaved order | The new order is lost with no warning | Asks **Discard your new order?** | As in 1.3.0 | As in 1.3.0 |
| Close-out text boxes | Take more than 2000 characters. The save then fails with **\<field> must be at most 2000 characters.** | Stop at 2000 characters | As in 1.3.0 | As in 1.3.0 |
| The **Start · \<date>** row in **Notifications** | Tapping it only marks it read. Use the push or the drawer. | Tapping it opens Start | As in 1.3.0 | As in 1.3.0 |
| Security PIN: is it required? | Yes, at every sign-in. One PIN for everyone on the phone. **Logout** removes it. | No, it is optional. Each person has their own, and **Logout** keeps it. A PIN set in 1.2.0 is deleted the first time this version starts. | As in 1.3.0 | As in 1.3.0 |
| Security PIN: can you set one? | Yes | **No.** **Save** on **Confirm New PIN** does nothing, no PIN is stored and the app never locks. | **No**, as in 1.3.0 | **Yes**, from the fix merged on 2026-10-06. If the phone cannot store the PIN you see **Could not save the PIN. Please try again.** |
| Switching company | Only Settings refreshes. The drawer does not show a company. | Every screen reloads and you land on Start. The drawer shows your company when you belong to more than one. | As in 1.3.0 | As in 1.3.0 |
| Project **Secrets** vault, the project role badge on member rows, and **Your own request — waiting for your manager.** on **Approvals** | Not there | Yes | Yes | Yes |

**Which build is on my phone?** The app shows the version name only, never the build number, and the build number would not settle it: a 1.4.0 build with the PIN fix and one without it both read **Version 1.4.0** and both carry build number 22. The only test is to set a PIN: if you see **Security PIN set**, the fix is in your build. This manual cannot know which version is on your phone or on the Play Store. Check the Version line on the phone and the Play listing.

### On the web and the server

These were merged on 2026-10-05. They do not depend on the app version: they apply to every phone and browser once the web app is deployed from that code. The web Start page itself is unchanged.

- The web **Tasks** and **Development** lists show only the company you are working in, for everyone, platform admins and founders included. Opening a single task or bug, and reading a project's requirements, follow the company too. See [What you see in each company](#what-you-see-in-each-company).
- Server logs no longer show full device push tokens, and the push can carry an optional `EXPO_ACCESS_TOKEN`. See [The daily push job](#the-daily-push-job).
- Security clean-up on the server. See [Server changes merged on 2026-10-05](#server-changes-merged-on-2026-10-05).

---

## What Start Is

Start is a screen in Karmayog that only founders can see. It helps you keep about a dozen work "threads" moving. For each thread it keeps one next step, and each day it picks the three threads to look at first (your **Top 3**). It also shows the rest of your threads, the tasks and bugs waiting on you, and any notes Claude left for you. You can open Start in the mobile app (1.2.0 or later) or at https://task.amtariksha.com/start.

### The daily rhythm

| When | What happens |
|------|--------------|
| Around 09:00 IST (between about 08:30 and 09:30) | A push titled **Start · Wed 16 Sep** (today's date) lists your Top 3. Tap it to open Start. |
| During the day | You work. Your Claude Code sessions, your git commits and your team's work in linked projects mark threads as touched on their own. |
| End of day | A 60-second close-out: tap the threads you worked on and type each one's next step. |
| Once a week | Rank your threads. Only ranked threads can enter the Top 3. Ranks stay until you save a new ranking or park the thread. Nothing clears them each week, and there is no reminder. |

All Start dates use Indian time (IST). For example, 18:31 UTC on 16 Sep is already 17 Sep on Start.

### Before your first morning

The 09:00 push only goes out when you have at least one active thread. With none, the daily job sends nothing (it skips with `nothing-to-send`). On 17 Sep 2026 the live database had no active threads, only four parked test threads named "[gate-test] …" (not re-checked since). Do this before your first morning:

1. Open https://task.amtariksha.com/start (or **Start** in the mobile app).
2. Click **Close-out** → **+ new**. Type the label exactly as it appears as a value in `~/.config/karmayog/founder-map.json` (for example "Karmayog" or "Swarg"), then click **Add** and type the next action. Repeat for each thread, then click **Save (N)**. A new label in a close-out creates the thread, sets its next action and marks it touched in one step. The labels in this manual's examples, such as "Swarg menu", are only examples. If a label differs from the map, activity from your machine creates a second thread.
3. Open **Rank threads**, rank the threads that matter and click **Save ranks** (**Save** on mobile). A thread needs both a rank and a next action to enter the Top 3.
4. Check that the **Top 3** shows cards and that there is no grey **Paused until …** line.
5. Leave the four "[gate-test]" parked threads parked. They are test data. Do not unpark them.

On the phone, **⋮** → **Brain dump** does step 2 for a whole list at once (see [Brain Dump](#brain-dump)). For a long list of work, with projects and tasks as well as threads, see [Getting Everything Out of Your Head](#getting-everything-out-of-your-head).

---

## Key Ideas

| Term | What it means |
|------|---------------|
| **Thread** | One piece of work you are keeping moving, such as "Karmayog". It has a label, a next action, an optional rank, an optional "waiting on", a last-touched time, and can be linked to one Karmayog project. Threads are private to founders and never show in the team screens. |
| **Label** | The thread's name, up to 120 characters. Two threads cannot share a label, even with different capital letters. This includes parked threads. |
| **Next action** | The one physical step you will take next on the thread (up to 2000 characters). |
| **Rank** | Your weekly order of importance (1, 2, 3 …). A thread without a rank never enters the Top 3. Ranks do not expire. They stay until you save a new ranking or park the thread. |
| **Waiting on** | Who or what the thread is blocked on (optional). Shown as "waiting on \<who>". |
| **Last touched** | The last time anyone or anything moved the thread forward. |
| **Stale** | Not touched for 4 or more days, or never touched. Stale threads get a ⚠ and move up in the Top 3. |
| **Parked** | Put aside. A parked thread is hidden from Start and loses its rank, but keeps everything else, including its label (see [Parking and unparking](#parking-and-unparking)). |
| **Check-in** | One line of history: a close-out, some activity, a ranking save or a daily Start card. History can only be added to. Nobody can change or delete a check-in. |

### Age chip

Every thread shows a small age chip:

| Chip | Meaning |
|------|---------|
| **today** | Touched today (IST) |
| **yesterday** | Touched yesterday |
| **2d**, **3d** | Touched 2 or 3 days ago |
| **4d ⚠**, **5d ⚠** … | Stale: touched 4 or more days ago (highlighted and bold) |
| **never ⚠** | Never touched (always stale) |

Days are counted by calendar date in IST, not by 24-hour periods. A thread touched at 23:50 on Monday shows **yesterday** on Tuesday morning.

### Who moves "last touched"

| Who | How | Recorded as |
|-----|-----|-------------|
| You | Saving a close-out entry for the thread (even without a new next action), or a [Brain dump](#brain-dump) row for it | `closeout` |
| Anyone using the API | Changing the next action with `updateFounderResumePoint` (see [For Admins](#for-admins)) | `manual` |
| Your machine | A Claude Code session or your git commits in a mapped repo (see [Automatic Activity](#automatic-activity-from-your-machine)) | `hook` |
| Your team | Task or bug activity (including sub-projects) in the linked project in the last 24 hours, if newer than the current touch. It is saved when Start is loaded, or when the 09:00 job runs and builds the push (not while the push is turned off or paused, or after today's push was already sent). | `karmayog` |

"Last touched" only ever moves forward.

Until Start is loaded (or the 09:00 job builds a push, which it does not while the push is turned off or paused, or after today's push was already sent), the stored thread does not have the team-activity touch yet. A direct database read, for example by Claude, can then show an older last-touched time than Start does.

### Who writes check-ins

Each check-in has a **kind** (`closeout`, `activity`, `rank`, `start`) and a **source** (`app`, `hook`, `claude`, `manual`).

| Check-in | Written by |
|----------|------------|
| `closeout` · `app` | You, one per thread in each close-out or Brain dump save |
| `activity` · `hook` | Your machine (Claude Code sessions, nightly git scan) |
| `rank` · `app` | You, each time you save a ranking. The note lists the labels in order, like "Karmayog > Swarg", or "(all unranked)". |
| `start` · `app` | The server, when the 09:00 push goes out (a text copy of that day's Start) |
| `start` · `claude` | Claude, when it writes your daily brief. This shows as **Claude's notes**. |

Ranking saves and the 09:00 Start card are not tied to any thread, so they never appear under a thread.

The database allows `manual`, but the app never writes it. Changing the next action through `updateFounderResumePoint` marks the thread touched (`manual`) without adding a check-in, so such edits leave no history line.

---

## How the Top 3 Is Chosen

### The rules

1. **A thread must have a rank and a next action.** Unranked threads and threads without a next action never enter the Top 3, even when stale. A next action that is only spaces does not count. Parked threads are never considered.
2. **Your rank-1 thread always comes first.** This holds even when other threads are stale (as long as rank 1 has a next action).
3. **Stale threads come next**, ahead of fresher threads with better ranks. The oldest touch goes first, and a never-touched thread counts as the oldest. Ties go to the better rank.
4. **Fresh threads fill the rest, by rank.**
5. **Only three make it.** Every other active thread goes to **Other threads**.

**Other threads** order: ranked threads first, by rank. Then unranked threads, most recently touched first, with never-touched threads last. Unranked threads with the same touch time are sorted by label. Ranked threads with the same rank (rare, and only possible through direct database writes) go by creation order.

### Worked example

Today is Thu 17 Sep. You have five active threads:

| Thread | Rank | Next action | Last touched | Age chip |
|--------|------|-------------|--------------|----------|
| Karmayog | 1 | Ship Start manual | Today | today |
| Swarg menu | 2 | Call chef about Diwali box | Yesterday | yesterday |
| Investor deck | 3 | Update traction slide | 11 Sep | 6d ⚠ |
| Robot arm | 4 | Order new servo | Never | never ⚠ |
| Hiring | none | Post job ad | 12 Sep | 5d ⚠ |

Result:

- **Top 3:** 1. Karmayog (rank 1 always first), 2. Robot arm (stale, never touched = oldest), 3. Investor deck (stale, 6 days).
- **Other threads:** Swarg menu (ranked, so first), then Hiring. Hiring is stale but has no rank, so it can never be in the Top 3.

Swarg menu has a better rank than Investor deck, but it is fresh, so the two stale threads go ahead of it. To get Swarg menu into the Top 3, make it rank 1, or touch either of the stale threads (or unrank or park one of them). For example, after a close-out on Investor deck, the Top 3 is Karmayog, Robot arm, Swarg menu.

### "Not today"

**Not today** on a Top 3 card moves that card to the bottom of the Top 3 on your screen. The thread you marked last goes last. Nothing is saved to the server, and the order only changes on that device or browser page. The marks are dropped when the date changes, when you reload the web page, and on mobile when the app restarts, when you switch company, when you unlock it with your security PIN (only if you set one), or when the **System Maintenance** screen has taken over (see [Offline on mobile](#offline-on-mobile)).

---

## Opening Start

### Who can open it

- Every **platform admin** is a founder.
- Employee IDs in the server setting `FOUNDER_EMPLOYEE_IDS` are founders too. When that setting is empty, the list is just AM-0001.
- Start is not a normal tab permission. You cannot grant it from the Permissions settings.
- The server decides who is a founder, from the `FOUNDER_EMPLOYEE_IDS` server setting and the platform-admin flag in the database, never from your login token. Anyone else is turned away and never sees founder data. The 09:00 push goes only to founders whose user status is active.
- The company does not matter. A **Company admin** on the Company page is not a founder, and switching company does not remove Start.

### On mobile

- **Check the version first:** open the drawer and tap **Account** (or **Settings**). The bottom of the screen, under **Logout**, shows **Version** and the number (**Version 1.4.0** on the current app). No build number is shown. Start needs 1.2.0 or later. A Play Store copy can be older: the Play release in early October 2026 was 1.1.9, which has no Start, so neither a drawer item nor the push can open it. If your version is lower than 1.4.0, see [If you are on an older version](#if-you-are-on-an-older-version). To install a newer build of Karmayog (`com.karmayog`), see [Start is missing](#start-is-missing). Ignore the **Version** row in **Debug Menu** → **Info**: it shows the Android API level, not Karmayog's version.
- **After login:** Home shows first, and Start takes over once the server confirms you are a founder, which needs a connection. This happens after every sign-in, because **Logout** and a fresh install both clear the stored founder answer. No PIN screen comes first unless you set a PIN. With a PIN, the lock screen comes first and you land on Start after unlocking. When the app restarts while you are still signed in, it opens straight on Start.
- **With a security PIN:** the lock screen appears right after sign-in and whenever you come back after 5 minutes or more away. After you unlock, you land on Start, and any screens you had opened on top are closed. See [Security PIN](#security-pin).
- **Without a PIN:** coming back to the app on the same IST day leaves you on the screen you were on. Start comes back on its own only on a new IST day (see **Next morning**) or when the app restarts.
- **From the drawer:** open the menu (hamburger) and tap **Start**. It is the first item, above **Home**, right under your name, role and employee ID. If you belong to more than one company, a small chip there shows the company you are working in.
- **From the push:** tap the 09:00 notification.
- **From Notifications:** tap the bell, then the **Start · Wed 16 Sep** row. The row is marked read and Start opens.
- **Back to the normal app:** tap **⋮** then **Home**, or open the drawer and tap **Home**. Start stays open underneath. From Home, the Android back button first moves to the **Feed** tab; press it again to come back to Start (or open the drawer and tap **Start**). The parked list and your **Not today** marks are as you left them.
- **Next morning:** if you bring the app back on a new IST day, it shows today's Start and closes any screens you had opened on top. If Start, **Rank threads** or **Brain dump** is the screen on show, or you opened the app from a notification, it reloads today's Start in place instead, so an open close-out, unsaved rank changes or a brain dump are kept.
- **The Start notification while another Start screen is open:** tapping it takes you back to Start. From **Rank threads** with unsaved changes you are first asked **Discard your new order?**. From **Brain dump** you go back without a question (unless a save is running, which asks **Still saving**), and the draft is kept.
- **The app remembers you are a founder**, so it still opens on Start when you are offline. Offline, Start stays readable for only about half a minute (see [Offline on mobile](#offline-on-mobile)). It asks the server again at sign-in, each time the app restarts, each time you come back to it and after a company switch. When it gets no answer it keeps the stored one and notes why in **Debug Menu** → **Logs** (see [Start is missing](#start-is-missing)). If you stop being a founder, Start, **Rank threads**, **Brain dump** and the drawer item disappear.
- **Switching company:** drawer → **Account** → tap the **Company** row (it shows the current company and ▾) → in the **Switch company** sheet, tap the company. The row shows only when you belong to two or more companies. The switch reloads every screen and puts you back on Start. Start shows the same threads in every company. It also clears **Not today** marks and closes the parked list.
- **When your session expires:** sessions last 7 days. When the server refuses a request because your session has run out, the app signs you out by itself and shows the sign-in screen. No message explains it. If a save set it off, that save's red error toast, **UNAUTHENTICATED: You must be signed in.**, can show for up to 3 seconds as the sign-in screen appears. This happens on Start (loading it, refreshing it or saving from it) as well as on the other screens. Sign in again with OTP: Home shows first, and Start takes over after the founder check. A request that only overlapped a sign-in, a sign-out or a company switch does not sign you out, and neither does a **FORBIDDEN** answer (signed in, but not allowed).
- **What a sign-out keeps:** any sign-out, **Logout** or the automatic one, keeps your security PIN and your Brain dump draft. It clears the stored founder answer, the saved project filter and the data cached on the phone. A close-out you were typing when the automatic sign-out happens is lost, because it exists only on screen. Unsaved rank changes are lost the same way.

### On the web

1. Go to https://task.amtariksha.com and sign in.
2. Open the **Work** menu (hover on desktop; tap **Work** in the phone menu).
3. Click **Start**. It is the first item, above **Dashboard**.

You can also go straight to https://task.amtariksha.com/start.

While the page checks your access, you see a spinner. If you are not signed in, you are sent to the login page; if you are not a founder (or your web session has expired), to the dashboard. If the check itself fails (for example, no network), the error shows in red with a **Retry** button.

### Security PIN

The security PIN locks the mobile app. It is optional: sign-in does not make you create one, and without one the app never locks. If you have set one, it is asked for right after you sign in.

- **Turn it on:** drawer → **Account** → **App Settings** → **Security PIN**. Without a PIN the row reads **Off. Turn it on to lock the app when you leave it.** Tap **Set up**, type 4 digits under **Enter New PIN** and tap **Next**, then type them again under **Confirm New PIN** and tap **Save**. You see **Security PIN set**. If the phone cannot store the PIN, the dialog stays open and says **Could not save the PIN. Please try again.**
- **If nothing happens after Save,** your build does not have the fix merged on 2026-10-06 and cannot store a PIN, so the app never locks. A 1.4.0 build with the fix and one without it both read **Version 1.4.0** and both carry build number 22, so trying it is the only test. See [If you are on an older version](#if-you-are-on-an-older-version).
- **With a PIN** the row reads **The app asks for this PIN after 5 minutes in the background.** It has two buttons. **Change** asks for the current PIN first. **Turn off** asks only **Turn off the security PIN?**, not for the PIN, so anyone holding your unlocked phone can turn it off.
- **When it locks:** when you come back after 5 minutes or more away (from the background, or reopening a closed app) and right after you sign in. The lock screen is titled **App Locked**. If you switched on biometric login in Settings (for example **Fingerprint Login**), you can also tap **Unlock with Fingerprint**.
- **After you unlock** you land on Start. Screens that were open on top are closed, **Not today** marks are cleared and the parked list is closed. A close-out you were typing and unsaved rank changes are lost, without a question. A Brain dump you were writing is not lost: its draft was saved when the app went to the background.
- **It belongs to you on this phone.** **Logout** does not remove it, and someone else signing in on the same phone does not get it.
- **What removes it:** **Turn off**, **Forgot PIN? Sign out**, and uninstalling the app. A PIN set in 1.2.0 is also deleted the first time a newer version starts. Set it up again if you want the lock.
- **Forgot it:** on the lock screen tap **Forgot PIN? Sign out**, then **Sign out**. This deletes your PIN and signs you out. Sign in again with OTP. The dialog says you will need to set a new PIN, but that is optional.

---

## The Start Screen

### Layout at a glance

| Part | Mobile | Web |
|------|--------|-----|
| Heading | **START · Wed 16 Sep** (the IST date) | Same |
| Actions | **Close-out** button at bottom right; **⋮** menu at the right of the header | Toolbar: **Close-out**, **Rank threads**, **Add thread**, **Show parked** (**Hide parked** while the list is open), **Refresh** |
| Refresh | Pull down on the screen | **Refresh** button (**Refreshing…** while it runs) |
| Messages | Short pop-up toast for 3 seconds | Green (success) or red (error) box under the toolbar |
| Pause | **⋮** → **Pause Start until…** | **Pause Start push** section on the page |
| Brain dump | **⋮** → **Brain dump** | Not on the web |
| Out-of-date warning | Banner under the heading | Amber banner |

The mobile **⋮** menu holds six items, in this order: **Rank threads**, **Show parked** (it reads **Hide parked** while the parked list is open), **Pause Start until…**, **Add thread**, **Brain dump**, **Home**. The button has no printed name; a screen reader calls it "More Start options".

The mobile header shows, left to right: the hamburger button, the title **Start**, the project filter (a folder icon that opens **Filter Projects**), the light/dark toggle, the notification bell and **⋮**. The project filter does not change what Start shows.

Top to bottom, the web page shows: heading, toolbar, status message, **Add thread** box (when open), out-of-date banner, close-out warning, paused line, **Pause Start push**, **Top 3**, **Other threads**, **Waiting on you**, **Claude's notes** and **Parked threads** (when shown). Mobile uses the same order for the thread sections. On both, the section titles are shown in capitals (**TOP 3**, **OTHER THREADS** …); this manual writes them as **Top 3**, **Other threads** and so on. On the web the same goes for the **Add thread** and **Pause Start** box titles and for **Unranked** in the rank dialog.

### Warning lines under the heading

| Line | When it shows |
|------|---------------|
| **No close-out since Sat 12 — next actions may be stale.** | Your last close-out was before yesterday (IST). |
| **No close-out yet — next actions may be stale.** | You have never done a close-out. |
| **Paused until Wed 16 Sep** (grey) | The 09:00 push is paused. The date shown is still a paused day. |

### Out-of-date banners

Start first shows the last copy it loaded, then fetches a fresh one. If the fresh one does not arrive, the old copy stays on screen with a banner.

| Banner | Where | Meaning |
|--------|-------|---------|
| **Offline — showing the Start for Wed 16 Sep.** | Mobile | No connection, and the copy is from an earlier day |
| **Offline — showing the last loaded Start.** | Mobile | No connection |
| **Showing the Start for Wed 16 Sep — today’s hasn’t loaded yet.** | Both | The copy on screen is from an earlier IST day |
| **Couldn’t refresh — showing the last loaded Start.** | Both (web adds the error in brackets) | The last refresh failed |

The web page reloads itself shortly after IST midnight. It also reloads when you come back to the tab and the date has changed.

If nothing could be loaded at all, you see the error (for example **Could not load Start.**) and a **Retry** button.

### Offline on mobile

Whenever the phone has no connection, the app shows its own banner at the top of every screen, Start included: **You're offline**, with **Some features may be limited** under it. It is separate from Start's banners above and can show for a moment when they do not.

For the first half minute or so offline, you can still read Start, and **Not today** still works because it never leaves the phone. Nothing else can be saved, and nothing is kept to send later:

| Where | What you see offline |
|-------|----------------------|
| Close-out | **Offline — close-out needs a connection**. **Save** is disabled. |
| **Rank threads** | Opened while offline: the load error (or **Could not load threads**) with **Retry**, and no list. If the connection drops after the list loaded: **You are offline. Connect to save ranks.** and **Save** is disabled. |
| **Add thread** | **You are offline — connect to add a thread.** |
| **Pause Start until…** | **You are offline — connect to change the pause.** **Pick date** and **Clear pause** are disabled. |
| **Brain dump** | You can write and review. **Save** is disabled with **Offline — Brain dump needs a connection to save. Your draft is kept.** |
| Parked list | **Unpark** is disabled, with no message |
| **Park** on a card or row | The button is not disabled. The attempt fails with an error toast and the thread stays where it is. |

**After about half a minute the whole app is replaced.** The app checks the server every 30 seconds. After two failed checks in a row (30 to 60 seconds with no connection, or with the server down), every screen gives way to a **System Maintenance** screen with a **Retry Connection** button, and Start cannot be read. When the connection is back, tap **Retry Connection** or wait for the next check: the app reloads and you land on Start. **Not today** marks, the open parked list, an open close-out and unsaved rank changes are gone. A Brain dump draft is kept.

### Top 3

With no threads at all, Start shows **No threads yet — close out what you worked on to start.** and a **Close-out** button instead.

- Up to three numbered cards. Each shows the position number, the label, the age chip, the next action in large text (or **no next action**), and **waiting on \<who>** when set.
- If no thread qualifies: **Rank threads and set next actions to fill your Top 3.**
- Tap or click a card to open it, and again to close it.

An open Top 3 card shows:

- Team activity, if the linked project or its sub-projects had any in the last 24 hours: a line like "3 team updates in 24h" ("1 team update in 24h" for one), then up to three task or bug titles, each starting with "•". Each task or bug updated in that window counts once, and each of their activity-log entries counts once more.
- Then your last 3 check-ins, newest first, as `<kind> · <day> · <note or next action> · <source>` (for example `closeout · Sat 12 · Sent deck to Ravi · app`). With none: **No check-ins yet**. For the full history, see [Calling the API](#calling-the-api).
- Three buttons: **Done → next** (opens the close-out with this thread selected), **Not today** and **Park**.

On the web, **Not today** shows "\<label> moved to the end of Top 3 for today."

### Other threads

Every active thread that is not in the Top 3, as one-line rows: an arrow, the label, the next action (or **no next action**) and the age chip, with **waiting on \<who>** underneath when set. The section is hidden when empty.

Opening a row shows the full next action and "waiting on" text, team activity and check-ins, and two buttons: **Done → next** and **Park**. Rows have no **Not today**.

### Waiting on you

Up to 5 items that need you. The section is hidden when there are none. It covers tasks and bugs in every company (Amtariksha, Swarg and Tattva Silicon), whichever company you are working in. The web **Tasks** and **Development** lists show only the company you are working in, so on the web this is the one place where you see every company's tasks and bugs without switching. On the phone, **Tasks**, **Your Work** and Home also list your own tasks from every company (see [What you see in each company](#what-you-see-in-each-company)).

- **Open tasks** where you are an assignee or on the support list, due today, tomorrow or the day after. Overdue tasks are included. Tasks with no due date are not.
- **Open bugs** assigned to you, whatever their due date.
- Finished work is left out: tasks marked Done, Completed, Cancelled, Cancel, Stop or Closed, bugs marked Resolved or Closed, and anything deleted.

Items are sorted by due date, earliest first. Bugs with no due date come last, then items are ordered by ID. Only the first 5 are shown, so undated bugs drop off first. Each row shows a task or bug icon, "\<ID> · \<title>", the project (the sub-project when there is one) and a due label: **overdue · Wed 16 Sep** (red), **due today**, **due tomorrow**, **due Fri 18 Sep** or **no due date**. Tap a row to open that task or bug.

### Claude's notes

A folded panel with a robot icon and the time it was written. It only appears on days when Claude has written your daily brief (see [Working with Claude](#working-with-claude)). Open it to read the note in a fixed-width font, with "Check-in at \<time>" underneath. The time uses your device's time zone and format, for example 08:45 or 8:45 AM. On mobile you can select and copy the text. A note with no text shows **No note text.**

### Parked threads

Tap **Show parked** (mobile: in the **⋮** menu) to add a **Parked threads** list at the bottom. Each row shows the label, the next action (or **no next action**) and an **Unpark** button. If there are none: **No parked threads** on mobile, **No parked threads.** on the web. To hide the list again, use **Hide parked** in the same place. On mobile the parked list stays open until you hide it, the app restarts, you switch company, the app locks (only with a security PIN), or the **System Maintenance** screen takes over. Coming back from Home keeps it open. Offline on mobile, **Unpark** is disabled.

---

## Daily Close-out

A close-out tells Start what you worked on today and what comes next. For each thread you pick, Start:

- sets **last touched** to now,
- replaces the next action if you typed one (otherwise keeps the old one),
- saves your **What happened** note, if any,
- changes **Waiting on** only if you edited it (empty it to remove it),
- adds a `closeout` check-in.

The whole close-out saves together or not at all. You can include 1 to 50 threads at a time.

On the phone, a [Brain dump](#brain-dump) save is a close-out too: it writes the same `closeout` check-ins, for a whole list at once.

### On mobile

1. Tap the **Close-out** button at the bottom right of Start. The **Close out** sheet opens: "Tap what you touched, then set each next step."
2. Tap the chip for each thread you worked on. Ranked threads come first, then the rest alphabetically. Each chip you tap adds a block below and puts the cursor in its **Next action** box.
3. Type the next physical step. The grey hint shows the current next action, or **One physical step** if there is none. Leave it blank to keep the current one.
4. Optional: tap **+ details** to fill **What happened** and **Waiting on**. **Waiting on** starts with the current value. Empty it to remove it.

   **Next action**, **What happened** and **Waiting on** each stop taking text at 2000 characters, the server's limit. No counter or message appears. Typing just stops.
5. For work that is not a thread yet, tap **+ new**, type the label under **New thread** and tap **Add**. The new chip shows as "\<label> (new)" and is selected. If the label matches an active thread (ignoring capitals), that thread is selected instead. A label that matches a parked thread still shows as "\<label> (new)", but saving updates the parked thread and creates nothing (see [Parking and unparking](#parking-and-unparking)).
6. Tap **Save (N)**. You see **Close-out saved**, the sheet closes and Start reloads.

To leave a thread out, tap its chip again. Its block is hidden, but the text you typed is kept and comes back if you tap the chip again. The text still counts as typed, so only **Cancel** or **Save** closes the sheet.

### On the web

1. Click **Close-out** in the toolbar. The **Close out** dialog opens: "Pick what you touched, then set each next step."
2. Under **Threads you touched**, click each thread you worked on (a check mark appears). The cursor jumps to that thread's **Next action** box.
3. Type the next step (or leave it blank to keep the current one).
4. Optional: click **+ details** for **What happened (optional)** and **Waiting on (optional, clear to remove)**.
5. For a new thread, click **+ new**, type the label in **New thread** and press Enter or click **Add**. As on mobile, a label that matches a parked thread goes to that parked thread.
6. Click **Save (N)** (it shows **Saving…** while working). The dialog closes and the page shows **Close-out saved for 2 threads.**

On both web and mobile, unselecting a chip keeps its text. Select it again and the text comes back.

### The fast path (6 taps or fewer)

| Goal | Taps (mobile) |
|------|---------------|
| Close out one Top 3 thread | Tap the card → **Done → next** → type → **Save (1)** = 3 taps |
| Close out three threads | **Close-out** → chip 1, type → chip 2, type → chip 3, type → **Save (3)** = 5 taps |
| Mark threads as touched, keep their next actions | **Close-out** → tap the chips → **Save (N)**, with no typing |

You can tap the next chip while the keyboard is still open.

### Tips

- Write the next action as one physical step you could do in the next session, for example "Email Ravi the pricing sheet".
- A new label in a close-out creates a new thread, unless a parked thread already has that label (see [Linking to a project](#linking-to-a-project) and [Parking and unparking](#parking-and-unparking)).
- Each time you open the close-out it starts empty. A background refresh of Start will not wipe what you are typing.

### Protection against losing typed text

| | Mobile | Web |
|---|--------|-----|
| Close with nothing typed | Tap above the sheet, or press the Android back button | Press Escape or click the dark background |
| Close after typing | Blocked. Of the buttons and gestures, only **Cancel** throws the text away. Opening **+ details**, text in the **New thread** box, adding a new thread, or text in a chip you have since unselected also counts as typing. Selecting chips alone does not. | Blocked, with the message **You have typed a close-out. Use Cancel to discard it.** Selecting chips alone does not count as typing, but text in an unselected chip does. |
| Always closes and discards | **Cancel** | **Cancel** or the **X** |
| Text lost without a question | When the app locks (security PIN set, 5 minutes or more in the background), when the **System Maintenance** screen takes over, when the app signs you out, and when the app restarts. Unsaved rank changes are lost the same way. | When you reload or close the page |
| Offline | **Offline — close-out needs a connection**, and **Save** is disabled. Nothing is saved for later. After about half a minute offline the **System Maintenance** screen takes over and the text is lost (see [Offline on mobile](#offline-on-mobile)). | — |
| Save fails | The sheet stays open with your text and **Save** stops spinning. An error toast is shown (the server's message, or **Could not save close-out**), but it may be hidden behind the sheet. Check the connection and tap **Save (N)** again. | Red message (for example **Could not save the close-out.**). The dialog stays open with your text. |

---

## Ranking Threads for the Week

A ranking gives your chosen threads ranks 1, 2, 3 … in order. **Every other active thread becomes unranked.** Saving an empty ranked list unranks everything. Parked threads cannot be ranked. Ranks stay until you save a new ranking or park the thread; nothing resets them each week. Tip: put the thread that must move every day at rank 1. It takes Top 3 slot 1 whenever it has a next action.

### On mobile

1. On Start, tap **⋮** → **Rank threads**. The **Rank threads** screen loads your active threads.
2. Ranked threads appear at the top with position numbers. Use the up and down arrows to move a thread one place at a time. Use the unrank button to move it to the **Unranked** list.
3. Under **Unranked** (sorted alphabetically), tap the rank button to add a thread to the bottom of the ranked list. To rank a fresh list, tap the threads in priority order and no reordering is needed.
4. Tap **Save** at the bottom. You see **Ranks saved** and return to Start, which reloads.

Moving threads around changes nothing until you tap **Save**. If the connection drops while the list is open, the bar shows **You are offline. Connect to save ranks.** and **Save** is disabled. If you open **Rank threads** while already offline, the list cannot load and you see only the error and **Retry**.

To leave without saving, use the back arrow or the Android back button. If you changed the order, the app asks **Discard your new order?** ("The ranking has not been saved yet."). Tap **Keep editing** to stay with nothing lost, or **Discard** to leave without saving. If the order is the same as when you opened the screen (for example, you moved a thread and then moved it back), back leaves without asking. After a successful **Save** the question does not appear. Tapping the Start notification while you have unsaved changes takes you to Start, so the same question appears. Other notifications open their task, bug and so on on top, and your unsaved order stays underneath.

The question is not asked, and the unsaved order is lost, when the app locks (security PIN set, 5 minutes or more in the background), when the **System Maintenance** screen takes over (see [Offline on mobile](#offline-on-mobile)), when the app signs you out, and when the app restarts.

If saving fails you see the server's message or **Could not save ranks**, and you stay on the screen. If the list cannot load, you see the error (or **Could not load threads**) with **Retry**.

### On the web

1. Click **Rank threads** in the toolbar. The dialog shows **Loading threads…** and then your active threads.
2. Use the up and down arrows to reorder, the double-down arrow to unrank, and the double-up arrow (**Rank \<label>**) on an **Unranked** row to rank it at the bottom. Click them in priority order and no reordering is needed.
3. Click **Save ranks**. The dialog closes, the page shows **Ranks saved.** and Start reloads.

The second button reads **Close** until you change something, then **Cancel**. Both, and the **X**, close without saving. Escape or a click on the background only closes the dialog when nothing has changed. On the web any change counts, even if you move the thread back.

### Messages on both

**Nothing ranked yet. Rank a thread from the list below.** (no thread is ranked), **Every active thread is ranked.** (the Unranked list is empty) and **No active threads to rank.** (nothing to rank; **Save**, or **Save ranks** on the web, is disabled).

---

## Managing Threads

### Adding a thread

| Where | How |
|-------|-----|
| Mobile | **⋮** → **Add thread** → type the **Label** (the counter shows **\<n>/120**) → **Add**. You see **Thread added**. |
| Web | **Add thread** in the toolbar → type the **Thread label** → Enter or **Add**. You see **Thread added: \<label>**. The box stays open for the next one. Click **Add thread** again to hide it. |
| Close-out | **+ new** (see [Daily Close-out](#daily-close-out)) |
| Brain dump (mobile) | **⋮** → **Brain dump**: many threads in one save (see [Brain Dump](#brain-dump)) |

A thread added with **Add thread** has no next action, no rank and has never been touched, so it shows **never ⚠** and stays in **Other threads**. Give it a next action in a close-out and rank it to get it into the Top 3. Adding it from a close-out or a Brain dump marks it as touched straight away.

Labels must be unique across all threads, parked ones included, ignoring capitals. A second "karmayog" gives **A thread with this label already exists.** You get the same message when the label belongs to a parked thread, even though no such thread is visible on Start. Unpark that thread instead. Offline on mobile, the dialog shows **You are offline — connect to add a thread.**

### Changing the next action or "waiting on"

Use the close-out. It is the app's editing screen for threads (see [Daily Close-out](#daily-close-out)).

The app has no buttons to rename a thread or change its project link. Claude works on the same data, so you can ask Claude to do these. An admin can also use the API (see [Calling the API](#calling-the-api)).

After renaming a thread, update its label in `~/.config/karmayog/founder-map.json` too. Otherwise your next Claude Code session or commit creates a new thread with the old name.

### Parking and unparking

- **Park:** open a card or row and tap **Park**. You see **Parked \<label>** and Start reloads without it. The thread keeps its next action and "waiting on", but **its rank is removed**. Parked threads get no team-activity touches. If it fails you see the server's message or **Could not park the thread.**
- **Parking keeps the label taken.** Close-outs and Brain dump rows that use that label, and machine activity mapped to it, still go to the parked thread. It is marked touched and gets the check-in, but stays parked and hidden from Start. Brain dump warns you about this before you save; the close-out does not. To work on the thread again, unpark it.
- **Unpark:** open **Show parked** and tap **Unpark** next to the thread. It comes back **unranked**, so rank it again if it belongs in the Top 3. Mobile shows **Thread unparked**; the web shows **Unparked \<label>**. If it fails you see the server's message or **Could not unpark the thread.**

Parking is how you retire a thread. A thread that has any check-in cannot be deleted: the database refuses with **Rows in founder_checkins are immutable (append-only audit table)**, because check-in history can never be changed. Only a thread with no check-ins (for example one added with **Add thread** and never touched) can be deleted.

### Linking to a project

Linking a thread to a Karmayog project lets your team's work count as touches and shows **team updates in 24h** on the card.

- **Automatic link:** a thread created from a new label (close-out **+ new**, a Brain dump row, or activity from your machine) is linked when exactly one live project has that exact name (capitals ignored) and no other thread uses that project. Otherwise it starts unlinked. The link is only made when the thread is created, so create the project first. **Add thread** never links a project.
- **Any company:** projects from every company count, so Swarg (COMP-002) and Tattva Silicon (COMP-003) projects can be linked and their team activity shows on Start.
- **Team activity** includes the project and all its sub-projects: tasks and bugs updated in the last 24 hours, plus their activity-log entries in that window. Deleted tasks and bugs are skipped.
- **One project, one thread.** Linking a project that another thread already uses gives **That project is already linked to another thread.** A missing or deleted project gives **Project not found.**
- **If the project is deleted in Karmayog** (a soft delete), the thread stays linked to it and keeps showing its name. It can still pick up team activity from that project's remaining tasks and bugs, and the project stays taken under the one-project rule. To unlink it, ask Claude or set `projectId` to empty through the API (see [Calling the API](#calling-the-api)). The link is cleared automatically only if the project row is removed from the database.

---

## Brain Dump

Brain dump turns a typed, dictated or pasted list into threads in one save. It is on the phone only: on Start, tap **⋮** → **Brain dump**. The web Start page has no Brain dump; there, use the close-out's **+ new**. Like the close-out, it makes and updates threads only, never projects or tasks.

It has two steps, Write and Review. Nothing reaches the server until you tap **Save (N)** in Review.

### Write

The screen is titled **Brain dump** and opens on one large text box. When the box is empty, the keyboard opens by itself. Above the box is this hint: "One thought per line. Put its next action after -> (for example, Hiring -> Post job ad), or after : on a line with no arrow. When dictating, say “new line” between thoughts." The empty box shows a grey example:

```text
Hiring -> Post job ad
Investor deck: Update traction slide
GST filing
```

Type, paste or dictate one thought per line. Dictation means the microphone on your phone's keyboard. The app has no recorder of its own.

| You write | You get |
|-----------|---------|
| `Hiring -> Post job ad` | Label **Hiring**, next action "Post job ad". `→` works like `->`. |
| `Investor deck: Update traction slide` | Label **Investor deck**, next action "Update traction slide" |
| `GST filing` | Label **GST filing**, no next action |
| `Re: pricing -> call Ravi` | Label **Re: pricing**, next action "call Ravi". An arrow always wins over a colon. |
| `Deck -> fix chart -> send` | Label **Deck**, next action "fix chart -> send". Only the first arrow splits. |
| `Re: Investor email` | Label **Re**, next action "Investor email". With no arrow, the first colon splits. Fix the label in Review. |
| `Standup at 10:30` or `Read https://…` | The whole line is the label. A colon splits only when a space follows it, or when it ends the line. |
| `a->b` | The whole line is the label. An arrow splits only with a space on each side, or at the start or end of the line. |
| `Hiring ->` or `Hiring:` | Label **Hiring**, no next action |
| `-> call Ravi` | A row with no label. Review flags it **Needs a label**. |
| `- Hiring`, `* Hiring`, `• Hiring`, `1. Hiring`, `1) Hiring` | Label **Hiring**. One bullet or list number at the start of a line is dropped. Other numbers stay, as in `2026 plan`. |

Blank lines are ignored, and so is a line that holds only a bullet or only an arrow or colon. Extra spaces inside a label become one space, so a dictated or pasted label matches the typed one. A list pasted from another app works as it is.

Under the box, on the left, is the count of thoughts: **0 thoughts**, **1 thought**, **12 thoughts**. On the right, while the box has text, is the draft line:

| Draft line | Meaning |
|------------|---------|
| **Saving draft…** | The draft is being stored |
| **Draft saved** | The draft is stored on the phone |
| **Draft not saved on this phone — save before you leave** | The phone could not store the draft |
| **Drafts can’t be kept on this phone — save before you leave** | The phone has nowhere to keep a draft |

The button reads **Review (N)**. With no thoughts it reads **Review** and is disabled.

### Review

Tap **Review (N)**. Every thought becomes a numbered row. At the top is this hint: "Check each row, then save. Saved threads can be parked but not deleted, so fix dictation slips here. A row you remove is left out of this save and stays in your draft. New threads have no rank: rank them on ⋮ → Rank threads to fill your Top 3." The draft line from the Write step is shown here too.

Each row has its number, its flags, a remove button (**×**), a **Label** box and a **Next action** box (both editable; the grey prompt in **Next action** is **One physical step**) and sometimes one line underneath, such as **Now: …**. A row that blocks the save has a red border.

**Matching against your threads.** The app fetches your threads, parked ones included, fresh from the server every time **Brain dump** opens. Until the list arrives, Review shows **Checking which of these are already threads…** and the rows do not yet say **New thread**, **Already on Start** or **Parked**. If the list cannot be fetched, Review shows **Couldn’t load your threads to check for matches.** with a **Retry** button. If the retry fails too, a toast shows the error (or **Could not load threads**).

| Flag | What Save does with the row |
|------|-----------------------------|
| **New thread** | Creates the thread, touched today. If exactly one project has exactly that name (ignoring capitals) and no other thread is linked to it, the new thread is linked to that project. |
| **No next action — stays out of the Top 3 until it has one and a rank** | Shown next to **New thread**. The thread is still created, with no next action. |
| **Already on Start — replaces its next action** | The label matches an active thread, ignoring capitals and extra spaces. Your next action replaces its current one, shown below as **Now: …** (**Now: no next action** when it has none). |
| **Already on Start — nothing to save. Add a next action to update it.** | Left out of the save, so the thread is not marked touched for nothing. |
| **Already on Start — same next action, nothing to save** | The thread already has this next action (ignoring capitals and spacing). Left out of the save, so a stale thread does not look fresh. |
| **Parked — gets this next action but stays parked and hidden from Start** | Updates the parked thread, which stays parked. Underneath: "To see it on Start, unpark it from ⋮ → Show parked." |
| **Parked — nothing to save. Add a next action to update it.** or **Parked — same next action, nothing to save** | Left out of the save. |
| **Same label as row N — merged into it** | Rows with the same label (ignoring capitals and extra spaces) and at most one next action between them (ignoring capitals and spacing) are saved once, as row N: the row that has the next action, or the first of them if none has one. |
| **Same label as row N with a different next action — edit a label or remove a row** (red) | Every row of that group turns red. Save is blocked until the rows no longer disagree: remove a row, change a label, or edit the next actions so that at most one different next action is left (the rows then merge). |
| **Needs a label**, **Label is N characters — limit 120**, **Next action is N characters — limit 2000** (red) | Save is blocked until you fix the row. Unlike the close-out, these boxes do not stop your typing at the limit; they flag the row instead. |

**Removing a row.** **×** leaves the row out of this save only. Its line stays in your draft as you first wrote it, not as you edited it in the row. There is no undo for a single row: to get removed rows back before saving, tap **Edit text** → **Undo changes**. With every row removed, the list reads **No rows left. Tap Edit text to add your thoughts.**

**Going back to the text.** **Edit text** takes you back to the Write step. If you changed or removed rows, it first asks **Undo your changes to the rows?** ("Going back to the text undoes the edits and removals made here. The text is kept.") with **Keep reviewing** and **Undo changes**. Changes made to rows are never written back into the text, and typing in the text starts the Review again from the text.

### Save

The bottom bar has **Edit text** and **Save (N)**. N is the number of threads that will be sent. Four kinds of row are not sent:

- a row that matches an existing thread and has no next action,
- a row with the same next action the thread already has,
- a duplicate merged into another row,
- a row you removed with **×**.

While **Save** is disabled, one line above the buttons says why. The first of these that applies is shown:

| Line | Meaning |
|------|---------|
| **Nothing to save — tap Edit text to add your thoughts.** | No rows are left |
| **Offline — Brain dump needs a connection to save. Your draft is kept.** | The phone is offline |
| **Checking your threads…** | Your thread list is still loading |
| **Couldn’t load your threads to check for matches. Tap Retry.** | Your thread list could not be loaded |
| **Fix row 4 to save.**, **Fix rows 4 and 9 to save.** or **Fix rows 1, 2, 3, 4, 5 and 3 more to save.** | Those rows have a red flag |
| **Nothing to save — every row is an existing thread with no new next action.** | Nothing is left to send |
| **One save takes up to 50 threads and this has 53. Remove 3 to save; removed rows stay in your draft for the next save.** | More than 50 threads, counted after merging duplicates and leaving out rows with nothing to save |

Tap **Save (N)**. This is what the save does:

- **It is one close-out, all or nothing.** Either every row is saved or none is.
- **New threads** are created by label, with their next action if they have one, and are touched today. They have no rank.
- **Existing threads** get the new next action. A row is tied to the thread it was shown against, so it still updates that thread if the thread is renamed elsewhere before you tap **Save**. A parked thread is updated and stays parked.
- **Waiting on and What happened are never sent**, so an existing thread keeps its "waiting on". Use the [close-out](#daily-close-out) to set them.
- **It counts as your close-out.** Each saved row marks its thread touched and writes a `closeout` check-in, so the **No close-out since …** line on Start goes away.

On success you see **Brain dump saved — N threads** (**1 thread** for one), plus **, N still parked** when some rows went to parked threads, plus **. N removed rows kept in your draft** when you removed rows. For example: **Brain dump saved — 12 threads, 1 still parked. 2 removed rows kept in your draft**. The screen closes and you are back on Start, which reloads.

If the save fails, an error toast shows the server's message (or **Could not save the brain dump**). You stay in Review, nothing was saved and the draft still holds everything.

Going back while it saves asks **Still saving** ("If you leave now, the save carries on. If it fails, your draft is still here.") with **Stay** and **Leave**. The rows cannot be edited during the save.

**More than 50 threads?** Remove rows with **×** until **Save** is enabled and save. Then open **Brain dump** again: the removed lines are in the text, ready for a second save. The text box itself has no line limit.

### The draft

- **It is saved on the phone** about 0.7 seconds after each change, and at once when the app goes to the background or the screen closes.
- **It holds the text and, if you were in Review, the rows as you edited them.** The next time you open **Brain dump** it comes back in the step you left. While it is being read, the screen shows only a spinner.
- **One draft per person on this phone**, by employee ID, not per company. It stays after **Logout** and comes back when the same person signs in again.
- **It is not encrypted.** It sits in the app's ordinary storage. **Debug Menu** → **Storage** shows its value only as **(hidden: Brain dump draft)**.
- **A successful save replaces it:** with nothing, or with the lines of the rows you removed with **×**, back in the Write step. Delete them there once you no longer need them.
- **A newer draft wins.** If you opened **Brain dump** a second time and changed the draft while a save was still running, the newer draft is kept.
- **Emptying the text box** removes the stored draft.
- **Uninstalling the app deletes it**, with the rest of the app's data on the phone. Nothing has reached the server before **Save (N)**, so save the brain dump or copy the text somewhere else before you uninstall.

### If the app is interrupted

| What happens | Brain dump |
|--------------|------------|
| You come back on a new IST day | Stays open. Start is refreshed underneath. |
| The app locks (security PIN set, 5 minutes or more in the background) | The lock screen closes every screen, Brain dump included. The draft was saved when the app went to the background. Open **Brain dump** again after you unlock. |
| The **System Maintenance** screen takes over (about half a minute offline, or the server is down) | Every screen closes, Brain dump included. The draft is kept. Open **Brain dump** again once the app is back. |
| You switch company | Every screen reloads. The draft is kept. |
| You tap the Start notification | You go back to Start without a question, unless a save is running (**Still saving**). The draft is kept. |
| You sign out, or the app signs you out | The draft is kept for the next time you sign in on this phone. |

### What Brain dump does not do

- It does not create projects or tasks.
- It does not rank. Rank the new threads on **⋮** → **Rank threads** to bring them into the Top 3.
- It does not set **Waiting on** or **What happened**. Use the close-out.
- It does not unpark a parked thread.
- It cannot delete or undo a saved thread. Saving writes check-ins, and a thread with check-ins can be parked but not deleted, so fix dictation slips in Review.
- It does not let you pick a project. A new thread is linked only by an exact, unique project-name match (see [Linking to a project](#linking-to-a-project)).
- It is not on the web.

---

## Getting Everything Out of Your Head

Use this when you have a long list of work in your head and want all of it in Karmayog. Every step works on the phone and on the web. Threads go in fastest on the phone, with Brain dump. Projects and tasks are quicker on the web when you have many.

### Thread, project or task?

Sort each item before you type anything.

| Put it in as | When | Where it shows |
|--------------|------|----------------|
| **Thread** | Something you personally keep moving, with one next physical step | Start only (founders) |
| **Project** | A body of work your team will carry out through tasks and bugs | **Projects**, task and bug lists. It can be linked to one thread. |
| **Task** | A concrete piece of work with an owner and a real end date | **Tasks**. Yours also show in **Waiting on you** when they are nearly due. |

An idea with no next step yet is not a thread. Keep it somewhere else until it has one.

How they connect:

- A thread can be linked to one project (see [Linking to a project](#linking-to-a-project)). Any task or bug in that project or its sub-projects that changed in the last 24 hours, your own changes included, marks the thread touched and shows as **N team updates in 24h**. So creating tasks in a linked project touches its thread.
- Tasks never become threads. On Start, tasks appear only as rows in **Waiting on you** (open tasks where you are an assignee or on the support list, due by the day after tomorrow, overdue included, and open bugs assigned to you; only 5 rows show) and, by title, in the team-activity lines of an opened linked thread.
- **How many threads:** Karmayog sets no limit. Keep about a dozen active, and rank only the 5 to 8 that should compete this week. A ranked thread you do not touch for 4 days goes stale and moves into the Top 3 ahead of fresher ones, so with 20 ranked threads the Top 3 fills with whatever is oldest. Leave the rest unranked, or park them.

### What works where

| Step | On the phone | On the web |
|------|--------------|------------|
| Many threads at once | **⋮** → **Brain dump**: type, dictate or paste the whole list, up to 50 threads per save. The fastest way. | **Close-out** → **+ new**, one thread at a time inside one save, up to 50. Or paste a prepared list through the browser console. |
| **Waiting on** or **What happened** | **Close-out** → **+ details**. Brain dump cannot set them. | **Close-out** → **+ details** |
| Ranking | **⋮** → **Rank threads** | **Rank threads** |
| A project or sub-project | Works: **Projects** → **+**, and **Add Subproject** on **Project Details** | Works: **Admin** → **Projects** → **Add Project** |
| People on a project | Works: **Project Details** → **Add User** | Works: project page → **Add User** |
| One or two tasks | Works: **Create Task** | Works: **Create Task** |
| Many tasks in a row | Slower. Both dates are typed by hand as YYYY-MM-DD, **End Date** does not follow **Start Date**, and every task starts from an empty form. | Better. The form has date pickers, **End Date** follows **Start Date**, and a bookmark can fill in the project and department. |

### The fastest way, on the phone

1. **Write the list down and sort it** into threads, projects and tasks.
2. **Projects first**, and only those that do not exist yet. Open the drawer, tap **Projects** and check before adding one. Projects come first because a thread is linked to its project only at the moment the thread is created.
   1. Tap the round **+** button at the bottom right. In **Add New Project**, fill **Project Name \***, leave **Parent Project (Optional)** on **None (Main Project)**, set **Status** (**Active** or **Inactive**) and tap **Create**. You see **Project created successfully** and the list reloads. The **+** button shows only when your global role is admin, top_management or management. The server makes the real decision: if you may not create projects in the company you are working in, you see **You do not have permission to create projects in this company.** If you have no **+**, use the web.
   2. For a sub-project, open the main project and, in the **Sub-Projects** card, tap **Add Subproject**. In **Create Sub-Project**, fill **Subproject Name \*** and tap **Create**. You see **Subproject created successfully**. In **Add New Project**, **Parent Project (Optional)** lists only active main projects you are a member of, so **Add Subproject** is the surer way. Karmayog will not create a sub-project of a sub-project.
   3. Add yourself and the team. On **Project Details**, in the **Assigned Team Members** card, tap **Add User**. In **Assign User to Project**, type in **Search User by Name/ID...** and tap the person. You see **User assigned successfully**. The list shows only the first 15 matches, so search by name. Creating a project adds nobody, not even you, and **Create Task** lists only main projects you are a member of. For a sub-project, add yourself and the team to its main project.
   4. Give every project a different name. Karmayog allows two projects with the same name, but then a thread with that name is not linked automatically.

   A new main project goes into the company you are working in (Amtariksha unless you switched). A sub-project always goes into its parent's company.
3. **All threads in one Brain dump.** On Start, tap **⋮** → **Brain dump**. Write one line per thread: the label, then ` -> `, then the next step, for example `Hiring -> Post job ad`. For a thread that has a project, use exactly the project's name as the label. Tap **Review (N)**, check the rows, then tap **Save (N)**. One save takes up to 50 threads and creates each one with its next action, touched today. Details: [Brain Dump](#brain-dump).
4. **Waiting on.** For a thread that someone else must move, tap **Close-out**, tap its chip, tap **+ details**, fill **Waiting on** and tap **Save (N)**.
5. **Rank.** Tap **⋮** → **Rank threads**. Under **Unranked**, tap the rank button on each thread that should compete, in priority order. Tap **Save**. You see **Ranks saved**. See [Ranking Threads](#ranking-threads-for-the-week).
6. **Tasks.** Open the drawer, tap **Tasks** and tap the **+** button (or **Dashboard** → **➕ Create Task**). Fill **Task Name \***, **Description \***, **Project \***, **Subproject** (shown only when the chosen project has sub-projects), **Priority \*** (nothing is chosen at first; without one, **Create Task** stops with **Please select priority**), **Status \*** (it starts as Open), **Assigned To \*** (only members of the chosen project; it starts as you), **Start Date \*** and **End Date \***, then tap **Create Task**. You see **Task created successfully**; **OK** takes you back. Check both dates before you save: they are typed as YYYY-MM-DD, **End Date** does not change when you change **Start Date**, and between midnight and 05:30 IST both start as yesterday's date. If **Project \*** says **No projects to choose from. Tasks can only be filed in projects you have been added to.**, add yourself to the project first (step 2). An open task assigned to you that is due within 2 days shows in **Waiting on you**. Assign to yourself only what you will do yourself.
7. **Your machine.** If you use the [automatic activity](#automatic-activity-from-your-machine) scripts, make the labels in `~/.config/karmayog/founder-map.json` match the new thread labels exactly. A map label that matches no thread creates a new one.

Do not use **⋮** → **Add thread** for a list. It closes after each thread, and each thread it makes has no next action, shows **never ⚠** and stays out of the Top 3 until a close-out gives it one (see [Adding a thread](#adding-a-thread)).

### The fastest way, on the web

1. **Write the list down and sort it** into threads, projects and tasks.
2. **Projects first**, and only those that do not exist yet. Check **Admin** → **Projects** before adding one.
   1. Click **Add Project**. In **Add New Project**, fill **Project Name \***, leave **Parent Project (Optional)** empty for a main project, set **Status \*** and click **Create Project**. The dialog closes and the list reloads; it does not open the new project. For a sub-project, open the parent project and click **Add Subproject**. Karmayog will not create a sub-project of a sub-project, so new projects go two levels deep at most (one existing Tattva Silicon branch is three deep: PRJ-051 → PRJ-049 → PRJ-050).
   2. Click **View Details** on the new project's row to open its page. Under **Assigned Users**, click **Add User** and add yourself and the team. The panel lists only the first 10 matches, so search by name or employee ID. Creating a project adds nobody, and **Create Task** only lists projects you are assigned to. For a sub-project, add yourself and the team to its main project: **Create Task** lists only main projects you are a member of, and **Assign To** lists that main project's members whichever **Sub Project (Optional)** you pick.
   3. Give every project a different name. Karmayog allows two projects with the same name, but then a thread with that name is not linked automatically.

   A new main project goes into the company you are working in (Amtariksha unless you switched). A sub-project always goes into its parent's company, so a sub-project of PRJ-037 Swarg Food is a Swarg project. Projects come first because a thread is linked to its project only at the moment the thread is created.
3. **All threads in one close-out.** On Start, click **Close-out** → **+ new**. Type the label (exactly the project's name, if it has one) and press Enter. The chip **\<label> (new)** is selected and the cursor jumps to its **Next action** box. Type the next step. For work someone else must move, click **+ details** and fill **Waiting on (optional, clear to remove)**. Click **+ new** for the next item and repeat. Then click **Save (N)**. One save takes up to 50 threads and creates each one with its next action, touched today. A label that matches an active thread selects that thread instead. Details: [Daily Close-out](#daily-close-out).
4. **Rank.** Click **Rank threads**. Under **Unranked**, click the double-up arrow (**Rank \<label>**) on each thread that should compete, in priority order. Click **Save ranks**. See [Ranking Threads](#ranking-threads-for-the-week).
5. **Tasks.** **Work** → **Tasks** → **Create Task**. Fill **Task Name \*** (3 to 150 characters), **Task Description \***, **Project \***, **Department \***, **Priority \***, **Assign To \*** (only members of the main project), **Start Date \*** and **End Date \***, then click **Create Task**. Both dates start as today. Set **Start Date** first, then the real **End Date**: changing **Start Date** resets **End Date** to the same day. An open task assigned to you that is due within 2 days shows in **Waiting on you**. Assign to yourself only what you will do yourself. After each task the page goes back to the task list. That list shows only the company you are working in, and a task takes the company of its project, so a task you create in another company's project is not in the list you return to: switch company to see it. To skip refilling the project and department each time, bookmark a link such as `https://task.amtariksha.com/tasks/create?projectId=<project ID>&department=<department>`.
6. **Your machine.** If you use the [automatic activity](#automatic-activity-from-your-machine) scripts, make the labels in `~/.config/karmayog/founder-map.json` match the new thread labels exactly. A map label that matches no thread creates a new one.

Do not use **Add thread** for a list. Each thread it makes has no next action, shows **never ⚠** and stays out of the Top 3 until a close-out gives it one (see [Adding a thread](#adding-a-thread)). You can also ask Claude to do the close-out for you (see [Working with Claude](#working-with-claude)).

### Limits

| What | Limit |
|------|-------|
| Thread label | 120 characters. Unique, ignoring capitals, parked threads included. |
| Next action, What happened, Waiting on | 2000 characters each |
| Threads in one close-out or one Brain dump save | 1 to 50, saved all together or not at all |
| Number of threads | No limit. Keep about a dozen active. |
| Top 3 | 3 threads |
| Waiting on you | 5 rows |
| Project levels | 2 for new projects (main project and sub-project). One existing Tattva Silicon branch has 3. |
| Project names | Not checked for duplicates |
| Task name | 3 to 150 characters in the web form. The mobile form checks only that it is not empty. |
| Bulk entry | Threads: up to 50 per save, with Brain dump on the phone, the close-out's **+ new**, or the console snippet below. Projects and tasks: none, one form at a time. The only CSV import is for users. |

### What a thread needs to reach the Top 3

1. It is active, not parked.
2. It has a next action that is not blank.
3. It has a rank.

The rules in [How the Top 3 Is Chosen](#how-the-top-3-is-chosen) then pick three: rank 1 first, then stale threads, then the rest by rank. Threads you just created in a close-out or a Brain dump are touched today, so right after the dump the Top 3 is simply ranks 1 to 3. A thread from **Add thread** or from your machine's activity has neither a next action nor a rank, so it stays in **Other threads** until a close-out and a ranking give it both. A Brain dump line with no next action makes a thread that is touched but has no next action, so it also waits for one.

### Pasting a prepared list

If the list is already typed somewhere, you can send it in one go.

**On the phone:** copy the list, open **⋮** → **Brain dump** and paste it into the box. Each line becomes a row to check in Review (see [Brain Dump](#brain-dump)).

**On the web:** on the Start page, open the browser console, define the `gql` helper from [Calling the API](#calling-the-api), and run one close-out with every entry:

```js
await gql('mutation($e:[FounderCloseoutEntryInput!]!){ createFounderCloseout(entries:$e){ id label } }', { e: [
  { label: 'Investor deck', nextAction: 'Update traction slide' },
  { label: 'Hiring', nextAction: 'Post job ad', waitingOn: 'Ravi' },
] })
```

It works exactly like the close-out: up to 50 entries, all or nothing, and new labels become threads. Each entry names its thread by `label` (or by `resumePointId`, the thread's ID) and can carry `nextAction`, `waitingOn` and `note`. It cannot take a project ID, so a project link comes only from an exact name match. Click **Refresh** afterwards.

---

## The 09:00 Push

### What it says

- **Title:** **Start · Wed 16 Sep**
- **Body:** your Top 3, one line each: "1. Karmayog · Ship Start manual". The body is at most 180 characters, so long next actions are shortened with "…".
- With no Top 3: **No Top 3 yet — rank your threads and set next actions.**
- If you have no active threads at all, no push is sent.

Tap the push to open Start. If the phone does not know you as a founder, it opens Notifications instead. An app older than 1.2.0 has no Start, so there the push always opens Notifications (see [If you are on an older version](#if-you-are-on-an-older-version)).

After the push goes out, you also get an in-app notification with the same title, **Start · Wed 16 Sep**, and the text **Your Start for Wed 16 Sep is ready.**, linking to `/start`. It never contains thread names or next actions. No email is sent. In the mobile Notifications list, tapping that row marks it read and opens Start. If the phone does not yet know you are a founder (for example right after a fresh install), it only marks the row read.

### When it comes

The push is scheduled for 09:00 IST, once a day, and goes to every founder. The hosting service can run the daily job at any point in its scheduled hour, so the push can arrive any time between about 08:30 and 09:30 IST. The time cannot be changed from the app; trying through the API gives **The Start push time is fixed at 09:00 IST by the daily cron; change vercel.json to move it.**

### Pausing it

A pause stops the push for everyone who gets it, up to and including the chosen date. It starts again the day after.

**Mobile**
1. On Start, tap **⋮** → **Pause Start until…**. The **Pause Start** dialog shows **The 09:00 Start push is on.** or **Paused until Wed 16 Sep**.
2. Tap **Pick date** and choose a date (today or later). It saves as soon as you pick.
3. You see **Paused until \<date>**. Tap **Close**.
4. To resume early, open the dialog again and tap **Clear pause**. You see **Start push resumed**.

**Web**
1. Open **Pause Start push** on the Start page. The **Pause Start** box shows the current state (**The daily Start push is on.** or **Paused until \<date>**).
2. Pick a date in **Pause the Start push until** (today or later) and click **Save**.
3. The page shows **Paused until \<date>**.
4. To resume early, click **Clear pause**. The page shows **Start push resumed**.

On the web, **Save** stays disabled until you pick a date, and a typed past date gives **Pick today or a later date.** On both: **Could not update the Start pause.** (or the server's message). On both, **Clear pause** shows only while a pause is active. On mobile the date picker only lets you pick today or later, and you need a connection to change the pause (**You are offline — connect to change the pause.**).

The "push is on" text only looks at the pause. It still says the push is on when an admin has turned the push off (see [For Admins](#for-admins)).

### If the push did not arrive

Work through these in order:

1. **Too early?** The push can come as late as about 09:30 IST. Wait until then.
2. **Turned off?** An admin may have called `updateFounderStartSettings(enabled: false)`. Start shows nothing for this. Check it on the Start web page with the browser console (see [Calling the API](#calling-the-api)): `await gql('{ founderStartSettings { enabled pausedUntil lastSentDate } }')`. `enabled` must be `true`. `lastSentDate` equal to today means today's send was already claimed.
3. **Paused?** Look for the grey **Paused until …** line on Start.
4. **Any active threads?** With no active (not parked) thread, nothing is sent.
5. **Already sent today?** Only one push goes out per day. Check the in-app Notifications for **Your Start for \<today> is ready.** If it is there, Expo (the push service) accepted the push for your account. Your phone can still have missed it, for example because its device registration expired.
6. **Phone set up for pushes?** The push counts as failed only when your account has no active push token or the request to Expo fails. A device that Expo rejects is only logged, and if Expo says the device is no longer registered, its token is marked invalid. The server does not ask Expo afterwards whether each phone really got the push, so "accepted" is not the same as "delivered". To fix it: open the app on that phone while signed in (it registers the phone again at start), allow notifications for Karmayog in Android settings, or sign out and in again. The push goes to every phone and emulator where you are signed in.
7. **Some phones get it and others do not?** That can be a problem with the push credentials, not with Start. Ask an admin to follow `docs/PUSH_NOTIFICATIONS_SETUP.md` (see [The daily push job](#the-daily-push-job)).
8. **Still nothing?** Ask an admin to check the server log and the cron result (see [The daily push job](#the-daily-push-job)).

Start itself does not depend on the push. Open it any time.

---

## Automatic Activity from Your Machine

*This section is technical. The authoritative setup guide is `scripts/founder/README.md`.*

### What it does

Two scripts on your own computer report work that happens outside Karmayog:

| Script | When | What it posts |
|--------|------|---------------|
| Claude Code Stop hook | After Claude Code replies in a mapped repo (at most once per 20 minutes per thread label) | `Claude Code session in <repo>`, plus ` · last commit: <subject>` if the last commit is under 2 hours old |
| Nightly git scan | Daily at about 23:30 IST (18:00 UTC, up to 2 minutes later) | `[<repo>: ]<n> commits: <latest three subjects, joined with "; ">` (`1 commit:` for a single commit; the `<repo>: ` prefix only for repos nested in a project folder) |

Each post becomes an `activity` check-in from `hook`, and the thread's last touched moves forward to the time of the post (for the scan, the time of your newest commit). It never moves backwards. The server ignores a repeat of the same text for the same thread within 20 minutes.

The repo-to-thread map decides which thread gets the post. **If the label in the map matches no thread, a new thread is created**, so spell labels exactly as they appear on Start. A map label that matches a parked thread goes to that parked thread, which stays parked and hidden (see [Parking and unparking](#parking-and-unparking)).

### One-time setup

**Prerequisites:** `bash` 4+, `curl`, `jq` 1.6+, `git` 2.31+, GNU coreutils (`sha256sum`, `timeout`, `stat`, `date`, `readlink`) and GNU `find`; optionally systemd for the nightly timer.

**Token (one time):**
1. Run `openssl rand -hex 32`.
2. In Vercel → task project → Settings → Environment Variables, add `FOUNDER_INGEST_TOKEN` for Production, then redeploy. While it is unset, every ingest is rejected.
3. Put the same value in `~/.config/karmayog/founder.env` (step 1 below). Open the file in an editor instead of pasting the token into a heredoc, so it stays out of your shell history.

**Steps:**

1. Create the config file. It lives outside the repo:
   ```bash
   mkdir -p ~/.config/karmayog
   touch ~/.config/karmayog/founder.env
   chmod 600 ~/.config/karmayog/founder.env
   ${EDITOR:-nano} ~/.config/karmayog/founder.env
   ```
   In the editor, enter these two lines, with your token in place of the placeholder:
   ```bash
   KARMAYOG_GRAPHQL_URL='https://task.amtariksha.com/api/graphql'
   FOUNDER_INGEST_TOKEN='<same value as the server FOUNDER_INGEST_TOKEN>'
   ```
   The file is read, not run, so a `$` in the token stays as typed. Use an `https` URL. A plain `http` URL still works, but for anything other than localhost or 127.0.0.1 the script warns that the token is sent unencrypted (and sends it anyway). Any URL that is not `http(s)` is rejected.
2. Map repo folder names, or project folders that hold several repos, to thread labels. The nightly scan only looks under `/mnt/work/projects` (or `FOUNDER_PROJECTS_DIR`); the Stop hook matches the folder name wherever the repo is.
   ```bash
   cat > ~/.config/karmayog/founder-map.json <<'EOF'
   { "task": "Karmayog", "amtarikshadev-Swarg": "Swarg" }
   EOF
   ```
   Repos not listed (directly or through their folder) are ignored.
3. From the repo root, copy the scripts. Use copies, not symlinks, and repeat this step after pulling script changes:
   ```bash
   install -m 755 scripts/founder/founder-ingest.sh scripts/founder/founder-claude-stop-hook.sh \
     scripts/founder/founder-git-scan.sh ~/.config/karmayog/
   ```
4. Turn on the nightly scan:
   ```bash
   mkdir -p ~/.config/systemd/user
   cp scripts/founder/systemd/founder-git-scan.service scripts/founder/systemd/founder-git-scan.timer ~/.config/systemd/user/
   systemctl --user daemon-reload && systemctl --user enable --now founder-git-scan.timer
   ```
5. Add the Stop hook to `~/.claude/settings.json`, merged with any hooks you already have:
   ```json
   { "hooks": { "Stop": [ { "matcher": "", "hooks": [ { "type": "command", "command": "f=\"$HOME/.config/karmayog/founder-claude-stop-hook.sh\"; [ -x \"$f\" ] && \"$f\"; exit 0" } ] } ] } }
   ```

**Good to know**

- The scripts never print the token and always exit 0, so a problem never breaks Claude Code or the timer. The nightly scan logs problems as one line on stderr (see `journalctl`). The Stop hook is silent unless you run it with `FOUNDER_INGEST_DEBUG=1`.
- The hook finds the repo from the session folder. It tries these map keys in order: the main checkout's folder name (so sub-folders and git worktrees count as the main repo), the session folder's name, and the name of the folder that holds the checkout. The post names the repo you worked in.
- The scan only counts **your** commits: the repo's `git config user.email` plus any emails in `FOUNDER_GIT_AUTHORS`. Commits made as another identity (for example `noreply@anthropic.com`) only count if you list that email. To set it for the timer, run `systemctl --user edit founder-git-scan.service` and add `[Service]` and `Environment=FOUNDER_GIT_AUTHORS=...`.
- The scan skips teammates' fetched commits, stashes and merge commits. It checks every git repo directly under `/mnt/work/projects` (or `FOUNDER_PROJECTS_DIR`). A folder there that is not a git repo itself is searched one level down: each repo inside it is matched by its own name, or else by the folder's name, so one entry such as `"amtarikshadev-Swarg": "Swarg"` covers the whole folder. Posts from these nested repos start with "\<repo>: ".
- The first scan covers the last 24 hours. After that, each scan picks up where the last good one started (at most 7 days back). The timer runs in your user session. If a scan was missed (computer off, or you were logged out), it runs the next time the timer can run: at boot if lingering is on, otherwise at your next login. Turn lingering on with `loginctl enable-linger $USER` (check with `loginctl show-user $USER -p Linger`) if you want the scan to run without logging in.
- The hook creates its 20-minute marker before it posts, so a failed post also blocks posts for that label for the next 20 minutes.

### Checking that it works

```bash
# One test entry ("applied: 1" = recorded, "applied: 0" = duplicate)
FOUNDER_INGEST_DEBUG=1 ~/.config/karmayog/founder-ingest.sh "Karmayog" "manual test"
# Clear the hook's 20-minute marker first, or the hook test may print "debounced"
rm -f ~/.cache/karmayog/Karmayog-*.last
# The hook, as Claude Code calls it
echo '{"cwd":"/mnt/work/projects/task"}' | FOUNDER_INGEST_DEBUG=1 ~/.config/karmayog/founder-claude-stop-hook.sh
# The scan, now
FOUNDER_INGEST_DEBUG=1 ~/.config/karmayog/founder-git-scan.sh
# Timer and scan log
systemctl --user list-timers founder-git-scan.timer
journalctl --user -u founder-git-scan.service -n 20
```

The test entries have lasting effects. Each one stays in the thread's history for good and marks the thread touched today. If no thread with that label exists, the test creates it.

Then open the thread on Start (web or mobile). The entry appears in its recent check-ins, for example `activity · Thu 17 · manual test · hook`.

The hook is silent by design. Run it with `FOUNDER_INGEST_DEBUG=1` to see messages. If the hook skipped a post because of the 20-minute wait, delete its marker to post again straight away: run `ls ~/.cache/karmayog/` and delete the `.last` file that starts with your label (spaces and other special characters in the label appear as `_`), or run `rm -f ~/.cache/karmayog/Karmayog-*.last` with your label. The hook creates this marker even when the post fails, so after fixing `founder.env` the first test may print "debounced".

---

## Working with Claude

Claude (the assistant) reads and writes the same Start threads and check-ins through the Supabase connector. Its own entries are marked with the source `claude`.

- **Claude's daily brief** follows the same Start rules and date format as the app, so from the same data both pick the same Top 3, provided Claude also applies the 24-hour team-activity touch (Start only saves that touch when it is loaded, or when the 09:00 job builds a push, which it does not while the push is turned off or paused, or after today's push was already sent).
- **Claude's notes:** when Claude writes today's brief as a Start check-in, it appears on Start in the **Claude's notes** panel. It can include calendar and inbox lines that the app does not have. A note shows there only if it is a check-in with kind `start`, source `claude` and `checkin_date` equal to today in IST (the column defaults to that). The newest such note is shown. Leave `resume_point_id` empty: the panel does not need a thread, and a note tied to a thread also shows in that thread's check-ins.
- **Close-out through Claude** (ask Claude to do your close-out) and the app close-out work on the same threads, so you can use either one.
- **Edits the app cannot make** (rename a thread, link or unlink a project, clear a next action) can be done by asking Claude. After a rename, update `founder-map.json` too (see [Changing the next action](#changing-the-next-action-or-waiting-on)).

### Switching off Claude's scheduled brief

The app has no switch for Claude's brief, because it runs separately from Karmayog. Once the 09:00 app push has been reaching your phone reliably each morning (the **Your Start for \<date> is ready.** row in Notifications only shows that Expo accepted the push, not that your phone got it):

1. Turn off the schedule that runs Claude's morning brief, so you do not get two Starts each morning. It is not in this repo, and on 17 Sep 2026 the Claude Code scheduled-tasks list on the founder's machine was empty (not re-checked since). Ask Claude, where you set up the brief: "show my scheduled tasks and turn off the morning Start brief".
2. You can still ask Claude for a brief or a close-out whenever you like.

Without a brief from Claude, the **Claude's notes** panel stays hidden on those days. The rest of Start is unchanged.

---

## FAQ

**Why isn't my rank-2 thread in the Top 3?**  
Stale ranked threads go ahead of fresh ones. See the [worked example](#worked-example).

**I touched a thread at 11 pm. Why does it say "yesterday" the next morning?**  
Ages count IST calendar days.

**Can I undo a close-out?**  
Check-ins cannot be changed or deleted. To replace a wrong next action, do another close-out; the newest one wins. A close-out with a blank next action keeps the old one, so to remove a next action entirely, ask Claude or call `updateFounderResumePoint(id, nextAction: "")`. The "last touched" time and any note from the wrong close-out remain.

**Will parking lose my notes?**  
No. Only the rank is removed. Unpark it and rank it again.

**Can I delete a thread?**  
Only if it has no check-ins. Park it instead (see [Parking and unparking](#parking-and-unparking)).

**Why did a thread I never created appear?**  
A close-out **+ new**, a Brain dump row or your machine's activity used a label that matched no thread, active or parked. Check the spelling in `founder-map.json`, and update the map after renaming a thread.

**Can another person use Start?**  
Only founders: platform admins and the employee IDs in `FOUNDER_EMPLOYEE_IDS`. All founders share the same threads and the same push settings. A **Company admin** is not a founder. The member list on the Company page tags platform admins with **platform admin**, and each of them is a founder. Those whose user status is active also get the 09:00 push.

**Does switching company change Start?**  
No. Threads, **Waiting on you** and team activity cover every company, and founder status does not depend on the company. On mobile a switch reloads the app and lands you on Start. What does change with the company is outside Start: the web **Tasks** and **Development** lists and the mobile **Development** list, for everyone, and, unless you are a platform admin, the people lists and **Projects**. The mobile **Tasks**, **Your Work** and Home lists do not change: they show your own tasks from every company.

**Why are Swarg or Tattva Silicon tasks missing from my Tasks list?**  
The web **Tasks** and **Development** lists show only the company you are working in, for everyone, platform admins included. Switch company to see them. On Start, **Waiting on you** still shows yours from every company, and so do the phone's **Tasks**, **Your Work** and Home for your own tasks. See [What you see in each company](#what-you-see-in-each-company).

**Do I have to set a PIN?**  
No. The security PIN is optional. Without one the app never locks. Setting one needs a build that has the fix merged on 2026-10-06. See [Security PIN](#security-pin).

**Why did the app sign me out?**  
Your session ran out (sessions last 7 days) and the server refused a request. The app then signs you out by itself. No message explains it, though a save that was refused can flash a red **UNAUTHENTICATED: You must be signed in.** toast first. Sign in again with OTP. Your security PIN and your Brain dump draft are kept.

**How do I know which version I have?**  
Drawer → **Account**: the last line, under **Logout**, reads **Version** and the number, for example **Version 1.4.0**. No build number is shown anywhere. See [If you are on an older version](#if-you-are-on-an-older-version).

**Is Brain dump on the web?**  
No. It is on the phone only. On the web, use the close-out's **+ new**, which also takes up to 50 threads in one save.

**Can Brain dump set "waiting on", rank a thread or make a task?**  
No. It makes and updates threads with a label and a next action. Use the close-out for **Waiting on**, **Rank threads** for ranks, and **Create Task** for tasks. See [What Brain dump does not do](#what-brain-dump-does-not-do).

**Is there an import for tasks or projects?**  
No. Threads can be entered up to 50 at a time: on the phone with Brain dump, or on the web in one close-out. Projects and tasks are entered one form at a time. See [Getting Everything Out of Your Head](#getting-everything-out-of-your-head).

---

## Troubleshooting

| Symptom | Cause | Fix |
|---------|-------|-----|
| **Rank threads and set next actions to fill your Top 3.** | No active thread has both a rank and a next action | Rank threads and give them next actions in a close-out |
| A thread shows **never ⚠** | It was added with **Add thread** and never touched | Include it in a close-out |
| **No close-out since … — next actions may be stale.** | No close-out yesterday or today | Do a close-out |
| **Showing the Start for … — today’s hasn’t loaded yet.** | Today's Start has not loaded yet | Pull down (mobile) or click **Refresh** (web) |
| **Couldn’t refresh — showing the last loaded Start.** | Network or server error | Check your connection and refresh |
| **Offline — close-out needs a connection** | Phone offline | Reconnect within about half a minute, then **Save**. If the phone stays offline longer, the **System Maintenance** screen takes over and the typed close-out is lost. |
| The phone shows only **System Maintenance** | Two server checks in a row failed: the phone has had no connection for 30 to 60 seconds, or the server is down | Reconnect and tap **Retry Connection**, or wait for the next check. The app reloads and you land on Start (see [Offline on mobile](#offline-on-mobile)). |
| Close-out sheet will not close | You typed something (also in a chip you have since unselected) | Tap **Cancel** to discard, or **Save** |
| **A thread with this label already exists.** | Same label, maybe with different capitals | Use the existing thread or pick another label |
| **A thread with this label already exists.** but no such thread on Start | The thread is parked | **Show parked** → **Unpark** |
| Close-out or Brain dump saved (or Claude Code or commit activity recorded) but the thread never appears | The label belongs to a parked thread. Brain dump says so on the row (**Parked — …**) and in its success message (**, N still parked**). | **Show parked** → **Unpark**, or change the label in `founder-map.json` |
| Deleting a thread fails with **Rows in founder_checkins are immutable (append-only audit table)** | The thread has check-ins | Park it instead |
| **That project is already linked to another thread.** | One project can have only one thread | Unlink the other thread first (ask Claude) |
| **Project not found.** | The project does not exist or was deleted | Check the project ID |
| **Ranking includes an unknown or parked thread.** | A thread in your list was parked or removed | Close and reopen **Rank threads**, then save again |
| **Provide between 1 and 50 entries.** | Close-out with no threads or more than 50 | Select 1 to 50 threads |
| **\<field> must be at most \<N> characters.** | Text too long (label 120; next action, note and waiting on 2000; activity summary 500; project ID 64). The close-out and **Add thread** boxes on the web and on mobile stop at these limits, Brain dump flags a row that is over them and will not save it, and the machine scripts shorten labels and summaries themselves, so in practice this comes only from direct API calls, such as the console snippets in [Pasting a prepared list](#pasting-a-prepared-list) and [Calling the API](#calling-the-api). | Shorten it |
| No **Start** in the drawer or **Work** menu, `/start` sends you to the dashboard, or **FORBIDDEN: You do not have permission to perform this action.** | An app older than 1.2.0, the wrong account, not a founder, or an expired session | Work through [Start is missing](#start-is-missing) |
| The phone suddenly shows the sign-in screen | Your session expired (sessions last 7 days). The app signs you out by itself. No message explains it; a save that was refused can flash a red **UNAUTHENTICATED: You must be signed in.** toast first. | Sign in again with OTP. Your security PIN and Brain dump draft are kept; a close-out you were typing and unsaved rank changes are not. |
| **UNAUTHENTICATED: You must be signed in.** | The server found no valid session. In a browser console call: your web session expired. For scripts: a wrong or missing token. On the phone you see it only as a brief red toast when a save was refused, just before the sign-in screen appears. | On the web, sign in again. For scripts, check the token in `founder.env`. On the phone, sign in again with OTP. If the phone shows it on Start and you stay signed in, check the app version (see [If you are on an older version](#if-you-are-on-an-older-version)), then tap **Logout** and sign in again. |
| The phone does something this manual does not describe: no **Brain dump** in **⋮**, **Discard your new order?** right after **Ranks saved**, **Failed to create project** for a project that was created, made-up project names in **Create Task**, or Start failing to load instead of signing you out | The app is older than 1.4.0 | Check the **Version** line (drawer → **Account**), then see [If you are on an older version](#if-you-are-on-an-older-version) |
| Nothing happens after **Save** on **Confirm New PIN**, and the app never locks | Your build does not have the PIN fix merged on 2026-10-06 | Install a 1.4.0 build made from code that includes the fix merged on 2026-10-06 (see [If you are on an older version](#if-you-are-on-an-older-version)) |
| **Could not save the PIN. Please try again.** | The phone could not store the new PIN | Tap **Save** again |
| Forgot the security PIN | — | On the lock screen tap **Forgot PIN? Sign out** → **Sign out**, then sign in with OTP (see [Security PIN](#security-pin)) |
| The app stopped asking for your PIN after an update from 1.2.0 | A PIN set in 1.2.0 is deleted the first time a newer version starts | Set a new one. That needs a build that can store a PIN (see [Security PIN](#security-pin)). |
| A test APK will not install over the Play Store copy (adb reports `INSTALL_FAILED_UPDATE_INCOMPATIBLE`) | The test APK is signed with the Android debug key, the installed copy with the Play Store key | Uninstall Karmayog first (see [Start is missing](#start-is-missing), step 1) |
| **Draft not saved on this phone — save before you leave** or **Drafts can’t be kept on this phone — save before you leave** (Brain dump) | The phone could not store the draft, or has nowhere to keep one | Do not leave the screen: tap **Review (N)** and **Save (N)** now, or copy the text somewhere else first |
| **Couldn’t load your threads to check for matches.** (Brain dump) | The thread list could not be fetched, so the app cannot tell new threads from existing ones | Check your connection and tap **Retry**. Your text is kept. |
| **Fix row 4 to save.** (Brain dump) | That row has a red flag: no label, text over the limit, or the same label as another row with a different next action | Edit the row, or remove it with **×** |
| **Nothing to save — every row is an existing thread with no new next action.** (Brain dump) | Every row matches a thread you already have and gives it nothing new | Type a new next action on a row, or tap **Edit text** and add new thoughts |
| **Could not save the brain dump** | The save failed. Nothing was saved. | Check your connection and tap **Save (N)** again. The draft still holds everything. |
| **Unpark** is greyed out (mobile) | The phone is offline | Reconnect |
| No **+** button on mobile **Projects** | Your global role is not admin, top_management or management | Create the project on the web |
| **You do not have permission to create projects in this company.** | You are not a platform admin, and not an admin of the company you are working in | Switch to the right company, or ask a platform admin |
| **No projects to choose from. Tasks can only be filed in projects you have been added to.** (mobile **Create Task**) | You have not been added to any project that the list can show. Unless you are a platform admin, it shows only projects of the company you are working in. | Add yourself to the project, or switch company (see [Getting Everything Out of Your Head](#getting-everything-out-of-your-head)) |
| A task you just created is not in the web **Tasks** list | Its project belongs to another company, and the list shows only the company you are working in | Switch company (see [What you see in each company](#what-you-see-in-each-company)) |
| The phone shows only **Update Required**, and **Update App** finds nothing newer | An admin set **Minimum Android Version** higher than the Play Store version | Ask an admin to lower it on **App Version Management** (`/settings/app-management`) |
| No 09:00 push | Push turned off (`enabled: false`), paused, no active threads, already sent, or no push registration | See [If the push did not arrive](#if-the-push-did-not-arrive) |
| Claude Code work does not touch the thread | Repo not in the map, 20-minute wait, or setup problem (for example no `founder.env`) | Run the hook test with `FOUNDER_INGEST_DEBUG=1`. Look for "no founder-map entry for …", "debounced: …", "map not found: …", "config not found: …" or "jq is not installed". |
| Hook test prints `debounced: …` right after setup | An earlier post, even a failed one, set the 20-minute marker | `rm -f ~/.cache/karmayog/Karmayog-*.last` (with your label), then test again |
| Test post shows "applied: 0" | Same text posted for that thread in the last 20 minutes | Use different text or wait 20 minutes |
| `config not found`, or `… is not set in …` | `founder.env` missing or incomplete | Redo setup step 1 |
| `… is readable by other users …` | File permissions too open | `chmod 600 ~/.config/karmayog/founder.env` |
| `HTTP <status> from <url>` or `GraphQL error: …` | Wrong URL or token, or a server problem | Check `founder.env`. Ask an admin to check `FOUNDER_INGEST_TOKEN`. |
| Scan log: `no author to match; set git user.email or FOUNDER_GIT_AUTHORS` | The repo has no author email set | Set `git config user.email` or `FOUNDER_GIT_AUTHORS` |
| Hook broke after switching branches | Scripts were symlinked into the repo | Reinstall as copies (setup step 3) |

### Start is missing

Work through these in order and stop at the first one that explains it.

1. **Check the app version.** Open the drawer and tap **Account**. The last line, under **Logout**, reads **Version …**.
   - **Version 1.2.0** or later (**1.3.0**, **1.4.0**): this app has Start. Go to step 2. If it is lower than **1.4.0**, some things work differently from this manual: see [If you are on an older version](#if-you-are-on-an-older-version).
   - **1.1.9**, or anything below **1.2.0**: this app has no Start. There is no drawer item, and the 09:00 push opens **Notifications**. A Play Store release can carry an old build: the Play release in early October 2026 was 1.1.9, built from code older than 1.2.0. This manual cannot know what the Play Store has now, so check the Play listing. Install 1.4.0 (build 22) or a later build.
   - A test APK handed to you directly is a release build signed with the Android debug key, not the Play Store key, so it will not install over the Play Store copy. Uninstall Karmayog first (from Android settings, or `adb uninstall com.karmayog`), then install the APK and sign in again with OTP. Uninstalling deletes the app's data on that phone (security PIN, fingerprint setting, saved project filter, any unsaved Brain dump draft and the stored founder answer, so Start appears only once the first founder check succeeds; see step 4), but nothing on the server. Save or copy a Brain dump draft before you uninstall. Such an APK cannot be uploaded to the Play Store, and while it is installed a Play Store update cannot install over it either. Going back to the Play Store copy means uninstalling again. The lasting fix is a Play Store release of 1.4.0 or later, signed with the app's own key.
   - Ignore the **Version** row in **Debug Menu** → **Info**. It shows the Android API level.
2. **Check the account.** Open the drawer. The line under your name and role is your employee ID, and it must read **AM-0001**. If not, tap **Logout** and sign in as AM-0001.
3. **Ask the server.** On a computer, open https://task.amtariksha.com/start while signed in as AM-0001.

   | What you see | What it means | What to do |
   |--------------|---------------|------------|
   | Start loads | The server says you are a founder. The problem is on the phone. | Go to step 4 |
   | The login page | This browser is not signed in | Sign in and open `/start` again |
   | A spinner | The founder check is still running | Wait for it |
   | The dashboard | The server answered "not a founder", or your web session expired | Sign out and in on the web, then open `/start` again. If you still land on the dashboard, ask an admin to check `FOUNDER_EMPLOYEE_IDS` and your platform-admin flag (see [Adding a founder](#adding-a-founder)). On 2026-10-05 production had `FOUNDER_EMPLOYEE_IDS=AM-0001`, and AM-0001 was an active platform admin. |
   | An error in red with **Retry**, and no **START · …** heading | The founder check failed, for example no network. The red text is the error itself, not a fixed message. | Click **Retry**. If it keeps failing, ask an admin to check the Vercel logs. |
   | The **START · …** heading and toolbar, with an error in red and **Retry** below (for example **Could not load Start.**) | You are a founder, but Start's data did not load | Click **Retry** |

   You can also ask the server directly. On that page, open the browser console, define the `gql` helper from [Calling the API](#calling-the-api) and run `await gql('{ me { employeeId isFounder } }')`. `isFounder: true` means the server counts you as a founder. `me: null` means this browser is not signed in.

4. **Let the phone check again.** The phone asks the server whether you are a founder at sign-in, each time the app restarts, each time you come back to the app and after a company switch. When it gets no usable answer, it keeps the answer it has stored. On a fresh install, or after a **Logout**, the stored answer is "not a founder", so Start stays hidden until a check succeeds.

   With a working connection, switch to another app and back. Then open the drawer and tap **Debug Menu** → **Logs**. Entries are listed newest first, each with its level, category, time and message. Look for the category **Founder**:

   | Log message | What it means | What to do |
   |-------------|---------------|------------|
   | `ME_IS_FOUNDER returned an error; using the cached founder flag` | The request failed: no connection, the server could not be reached, or the server answered with an error. The entry shows the error text underneath. | Check the connection, then switch away and back again. If the text is a server error and it keeps failing, ask an admin to check the Vercel logs. |
   | `ME_IS_FOUNDER request failed; using the cached founder flag` | The request was cancelled before any answer came back, for example because a sign-out or a company switch was running. This is rare. | Switch away and back again |
   | `ME_IS_FOUNDER returned me = null; using the cached founder flag` | The server did not recognise your session. It has probably expired. | The next real request signs you out. If it does not, tap **Logout**. Sign in again with OTP. |
   | `Could not cache the founder flag; using the server answer anyway` | The server answered, but the phone could not store the answer. The server's answer is used for now. After a restart the app may open on Home first, until a later check is stored. | Nothing to do if Start is showing |
   | `Could not read the cached founder flag` | The phone could not read its stored answer and treats it as "not a founder" until a check succeeds | Switch away and back again with a working connection |
   | No **Founder** entry after you switched away and back, and still no **Start** | The server answered, and the answer was "not a founder" for this account | Go back to steps 2 and 3 |

   The log lives only in the running app and holds the last 500 entries. Closing or restarting the app empties it, so read it, or tap **Export**, before you close the app. The stored answer itself is listed under **Debug Menu** → **Storage** as `founder_flag`.

   If **Start** still does not appear, tap **Logout** in the drawer and sign in again.

---

## For Admins

### Server environment variables

Set these on the web server (Vercel). Never commit their values. Vercel applies a changed variable only to new deployments, so redeploy after every change.

| Variable | Purpose |
|----------|---------|
| `FOUNDER_EMPLOYEE_IDS` | Comma-separated employee IDs that count as founders, on top of all platform admins. When empty, it defaults to `AM-0001`. Setting it **replaces** that default (AM-0001 still qualifies if it is a platform admin). |
| `FOUNDER_INGEST_TOKEN` | Shared secret for `ingestFounderActivity` (the Stop hook and the nightly scan). Generate it with `openssl rand -hex 32` and put the same value in `founder.env` on the founder's machine. When unset, every ingest call is rejected. |
| `CRON_SECRET` | Required for the 09:00 push and every other `/api/cron/*` job. Vercel sends it as `Authorization: Bearer <CRON_SECRET>`. `apps/web/src/proxy.ts` checks it before the route runs: a missing or wrong header gets HTTP 401 `{"success":false,"error":"Invalid cron credentials"}`, and if the variable is not set at all, 401 `Cron secret is not configured`. |
| `EXPO_ACCESS_TOKEN` | Optional. When it is set, every push request to Expo carries `Authorization: Bearer <token>`. When it is unset or blank, no such header is sent. It becomes required only if "Enhanced Security for Push Notifications" is switched on in the Expo account: pushes without it then fail with `UNAUTHORIZED`. So set the variable and redeploy before switching that on, and deploy a new value before revoking an old token. The steps are in `DEPLOYMENT_GUIDE.md`, section "Push Notifications (Expo / FCM)". |

The founder code reads no other variable. Like the rest of the web app, it also needs `JWT_SECRET` (sessions; at least 16 characters; read only on the server) and `DATABASE_URL`.

The repo cannot show what production has. To see which code is live, check Vercel → Deployments for the commit. To see which variables are set, check Settings → Environment Variables.

### Adding a founder

1. In Vercel → task project → Settings → Environment Variables (Production), set `FOUNDER_EMPLOYEE_IDS=AM-0001,AM-00xx`. Keep AM-0001 in the list unless it is a platform admin, because setting the variable replaces the default.
2. Redeploy the web app.
3. Check that the new founder's user status is active, or they will not get the 09:00 push.
4. The new founder reloads the web page or brings the mobile app back to the foreground (it checks again then). If Start still does not appear, they sign out and in again.
5. To confirm, the new founder runs `await gql('{ me { employeeId isFounder } }')` in the browser console (see [Calling the API](#calling-the-api)). `isFounder` must be `true`.

All founders share the same threads and the same pause.

Three things to know:

- **Removing a founder.** Someone whose platform-admin flag was removed can still see **Work** → **Start** on the web until they sign in again, because the menu uses the flag stored at sign-in. The page itself asks the server and sends them to the dashboard.
- **A founder who is not a platform admin** (listed only in `FOUNDER_EMPLOYEE_IDS`) sees every company's rows in **Waiting on you**, like any founder. But opening a task or bug follows the company rules, so a row from a company they are not working in does not open (see [What you see in each company](#what-you-see-in-each-company)). On 2026-10-05 the only configured founder, AM-0001, was a platform admin.
- **A newly made platform admin** gets Start at once, because the founder check reads the database. To cross the company boundary for tasks and bugs they must sign in again, or switch company if they belong to more than one: that rule uses the flag stored in the session, which is set at sign-in and, while it is still off, read again from the database on a company switch.

### Database

- Migration: [`apps/web/database/migrations/064_founder_start.postgresql.sql`](../apps/web/database/migrations/064_founder_start.postgresql.sql). It is already applied to the live project as the Supabase migration `founder_start` (version 20260915061742). Do not edit it. Add a new migration for changes. It is safe to re-run.
- Rollback: [`apps/web/database/migrations/064_founder_start_rollback.postgresql.sql`](../apps/web/database/migrations/064_founder_start_rollback.postgresql.sql). **DESTRUCTIVE:** it drops `founder_resume_points` and `founder_checkins` with all their rows. First export both with `COPY founder_resume_points TO STDOUT WITH CSV HEADER;` and `COPY founder_checkins TO STDOUT WITH CSV HEADER;`, and take a Supabase backup. The file also says to roll back a "Migration 065 (founder plan)" first. That migration is not in this repo. The repo's `065_credential_access_log_detail.postgresql.sql` is a different migration (the project-secrets access log) that never touches the founder tables: do not roll it back for Start. Check the live project's migration list before running the rollback.
- Tables: `founder_resume_points` (threads) and `founder_checkins` (history; a trigger blocks every UPDATE and DELETE). RLS is on with no policies. Because `founder_checkins.resume_point_id` is `ON DELETE SET NULL`, and that SET NULL is itself a blocked UPDATE, a thread with any check-in cannot be deleted.
- Push settings: one platform-level row in `settings` with key `founder_start` (`company_id` NULL), shared by all founders. It holds `enabled`, `hour` (9), `minute` (0), `tz`, `pausedUntil` and `lastSentDate`.

### The daily push job

- Cron: `/api/cron/founder-start` with schedule `30 3 * * *` (03:30 UTC = 09:00 IST) in `vercel.json`. Vercel can run it at any point from 03:00 to 03:59 UTC (08:30–09:29 IST); the server accepts a call from 08:00 IST. The time is set by that cron and must match `CRON_PUSH_HOUR_IST` / `CRON_PUSH_MINUTE_IST` in `push-schedule.ts`. Change both together, or a cron earlier than 08:00 IST is skipped as `too-early` (and the API keeps refusing any time other than the one in `push-schedule.ts`).
- Skip reasons, in the order they are checked: `disabled`, `paused`, `already-sent`, `too-early` (before 08:00 IST). Then `no-founders`, `nothing-to-send` (no founder has an active thread), `already-sent` again (the atomic claim of the day lost to a concurrent or retried call) and `send-failed`. On `send-failed` the day is released so a later call the same day can retry. The day is released only when no founder's push went out; if at least one succeeded, founders whose push failed are not retried. The only automatic call is the once-a-day cron, so a retry needs a manual call (below).
- Response: `{ success: true, status: 'sent'|'skipped', reason?, date, sent, failed }`, or HTTP 500 `{ success: false, error: 'Founder Start push failed' }`. The 500 case logs `Founder Start push failed:` with the error, without the `[founder-start]` prefix.
- A founder with no active push token, or a failed request to Expo, logs `[founder-start] push not delivered to <id> (no active push token or Expo rejected it)`. A rejection for a single device logs `[sendPushNotification] Error for token ExponentPushToken[abcdef…] (DeviceNotRegistered): …` and still counts as sent. The in-app notification row and the `start` check-in are written whenever Expo accepted the request.
- Logs never show a full device push token: at most the first 6 characters inside the brackets, as in `ExponentPushToken[abcdef…]`. The code in round brackets is Expo's error code for that device.
- Only `DeviceNotRegistered` switches a device's token off. Any other rejection, such as a credentials error, leaves the token active, so the server keeps sending to it. The server never reads Expo's push receipts, so a failure that Expo reports only later is not logged at all.
- When a push reaches some phones and not others, follow `docs/PUSH_NOTIFICATIONS_SETUP.md` and the "Push Notifications (Expo / FCM)" section of `DEPLOYMENT_GUIDE.md`. They explain how to check the Android (FCM V1) credentials for `com.karmayog` in the Expo project and how to match a failing token by its 6-character prefix. The guide records a test on 2026-09-17: Expo rejected 2 of AM-0001's 5 active Android tokens with `Unable to retrieve the FCM server key for the recipient's app`, a credentials problem that code cannot fix. The repo does not say whether that has been fixed since.
- To turn the push off completely (not just pause it), call `updateFounderStartSettings(enabled: false)`. The app has no button for this and shows no sign of it. `pausedUntil` must be `YYYY-MM-DD`. The server checks only that format, not that the date is today or later (a past date is accepted and has no effect).

**Running the job by hand.** This sends a real push and claims the day. With `CRON_SECRET` set in your shell to the server's value:

```bash
curl -s -H "Authorization: Bearer $CRON_SECRET" https://task.amtariksha.com/api/cron/founder-start
```

It is a GET request. Before 08:00 IST it returns reason `too-early`, and after a send the same day it returns `already-sent`. A wrong or missing secret returns HTTP 401 `{"success":false,"error":"Invalid cron credentials"}`. Logs: Vercel → project → Logs, search for `[founder-start]`, `sendPushNotification` or `Founder Start push failed`.

### GraphQL API (`/api/graphql`, founders only)

Queries: `founderStart`, `founderResumePoints(includeParked)`, `founderCheckins(resumePointId, limit)`, `founderStartSettings`.  
Mutations: `createFounderResumePoint(label, projectId)`, `updateFounderResumePoint(id, label, projectId, nextAction, waitingOn, isActive)`, `createFounderCloseout(entries)`, `updateFounderRanks(orderedIds)`, `updateFounderStartSettings(enabled, hour, minute, pausedUntil)`, `ingestFounderActivity(token, entries)` (checks the token instead of a login).

Setting `nextAction` through `updateFounderResumePoint` also marks the thread as touched (`manual`). Changing only the label, project, waiting-on or active flag does not. Setting `projectId` to empty unlinks the project.

A close-out entry names its thread by `resumePointId` or by `label`, and can carry `nextAction`, `waitingOn` and `note`. The mobile close-out, the web close-out and Brain dump all save through `createFounderCloseout`. The general query `me { employeeId isFounder }` tells any signed-in user whether the server counts them as a founder; `isFounder` is only ever true for the person asking.

### Calling the API

Thread IDs are not shown anywhere in the app, and production turns off schema introspection. The web session cookie works for a same-origin request, so while signed in at https://task.amtariksha.com, open the browser console and define a helper:

```js
const gql = (query, variables) => fetch('/api/graphql', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ query, variables }) }).then((r) => r.json())
```

- List threads and their IDs: `await gql('{ founderResumePoints(includeParked: true) { id label isActive rank projectId projectName } }')`
- Link a project (its ID is in the project page URL, `/projects/PRJ-…`): `await gql('mutation($id:ID!,$p:String){ updateFounderResumePoint(id:$id, projectId:$p){ id projectName } }', { id: '12', p: 'PRJ-001' })`. Use `p: ''` to unlink.
- Rename: `await gql('mutation($id:ID!,$l:String){ updateFounderResumePoint(id:$id, label:$l){ id label } }', { id: '12', l: 'New name' })`. Then update `founder-map.json`.
- Clear a next action (this also marks the thread touched): `await gql('mutation($id:ID!,$n:String){ updateFounderResumePoint(id:$id, nextAction:$n){ id nextAction } }', { id: '12', n: '' })`
- Full history of a thread (the limit is capped at 100): `await gql('{ founderCheckins(resumePointId: 12, limit: 100) { kind note nextAction source createdAt } }')`
- Push settings: `await gql('{ founderStartSettings { enabled pausedUntil lastSentDate } }')`
- Am I a founder: `await gql('{ me { employeeId isFounder } }')`

### Server changes merged on 2026-10-05

These are on the server and apply to every app version. None of them changes Start.

- **Lists and single items follow the company.** The GraphQL task, bug, project and user lists are limited to the company in the same way as the REST routes. Single task, bug and user lookups now need a session, and a task or bug follows the REST rule. See [What you see in each company](#what-you-see-in-each-company).
- **Changing or deleting a task through GraphQL.** `updateTask` and `deleteTask` now apply the same rule as the REST routes: inside the company boundary, the task's owner or an assignee, a manager or team leader on the task's project, someone above an assignee in the reporting chain, or an admin of the task's company. Anyone else gets **FORBIDDEN: You do not have permission to modify this task.** No web or mobile screen uses these two mutations (both apps change and delete tasks through REST, which already had the rule), so nothing changes on screen.
- **`JWT_SECRET` is server-only.** It is no longer in the `env` block of `next.config.js`, the token helpers are gone from the client-side `lib/auth.ts`, and `lib/auth-server.ts` is marked server-only, so importing it from client code fails the build. The server refuses to sign or check sessions unless `JWT_SECRET` is set and at least 16 characters long.
- **No database credentials in the repo.** Maintenance scripts no longer carry a connection string. They need `DATABASE_URL` (the MySQL migration helpers also `MYSQL_PASSWORD`) from the environment, and the docs show placeholders. A test in `npm test` (in `apps/web`) and the GitHub workflow "Credential guard" fail when a database credential is committed. The founder machine scripts are not affected: they never touch the database. The production database password was rotated on 2026-10-05, after it was found committed in the public repo (confirmed by the founder; the repo cannot show it).
- **Push.** Device push tokens are masked in the logs, `EXPO_ACCESS_TOKEN` is supported and `docs/PUSH_NOTIFICATIONS_SETUP.md` was added. See [The daily push job](#the-daily-push-job).

### Where the code lives

| Area | Path |
|------|------|
| API | `apps/web/src/graphql/founder-schema.ts`, `founder-resolvers.ts` |
| Rules, push, access | `apps/web/src/lib/founder/`: `compute-start.ts` (Top 3, stale), `start-format.ts`, `client-format.ts` (web display helpers), `push-schedule.ts`, `start-push.ts`, `start-service.ts`, `founder-auth.ts` |
| Push sending | `apps/web/src/lib/push-notification-service.ts`, `apps/web/src/lib/expo-push.ts` (request headers with `EXPO_ACCESS_TOKEN`, token masking). Setup guide: `docs/PUSH_NOTIFICATIONS_SETUP.md`. |
| Data | `apps/web/src/lib/db/founder*.ts` |
| Cron | `apps/web/src/app/api/cron/founder-start/route.ts`, `vercel.json`, `apps/web/src/proxy.ts` (checks `CRON_SECRET` for every `/api/cron/*` call; it was `middleware.ts` before Next 16.3) |
| Web UI | `apps/web/src/app/start/`, `apps/web/src/components/founder/`, `apps/web/src/hooks/useFounderStart.ts`, `apps/web/src/lib/founder-queries.ts` (GraphQL operations), `apps/web/src/components/layout/Navbar.tsx` |
| Mobile UI | `apps/mobile/src/App.tsx` (routes, founder check, lock, new-day rule), `apps/mobile/src/screens/founder/` (`FounderStartScreen.tsx`, `FounderRankScreen.tsx`, `FounderBrainDumpScreen.tsx`), `apps/mobile/src/components/founder/` (cards, close-out sheet, dialogs, `FounderBrainDump*.tsx`, `useBrainDumpDraft.ts`), `apps/mobile/src/hooks/useFounderStart.ts`, `apps/mobile/src/config/founder-queries.ts` (GraphQL operations), `apps/mobile/src/components/CustomDrawerContent.tsx` |
| Mobile rules | Under `apps/mobile/src/utils/`: `brainDump.ts` (Brain dump parsing, flags, save rules), `founderFormat.ts` (copy of the date/age/label formatting), `notificationRouting.ts` (push and Notifications-row routing to Start), `founderFlagRefresh.ts` (founder check), `authErrors.ts` and `sessionExpiry.ts` (expired-session sign-out), `pinStorageKey.ts` (security PIN key). Outside that folder: `apps/mobile/src/services/founderFlagService.ts` (founder check) and `apps/mobile/src/config/apollo.ts` (expired-session sign-out). |
| Company rules | `apps/web/src/lib/tenancy/list-scope.ts` (lists), `apps/web/src/lib/tenancy/item-access.ts` (single items, requirements), `apps/web/src/lib/tasks/task-access.ts` (changing tasks), `apps/web/src/lib/authz.ts` |
| Machine scripts | `scripts/founder/` (setup guide: `scripts/founder/README.md`) |
| Tests | Web: `apps/web/src/lib/founder/__tests__/` and `apps/web/src/lib/__tests__/` (run `npm test` in `apps/web`; it runs every `src/lib/**/__tests__` test: founder rules, push helpers, company rules and the committed-credential scan). Mobile: `apps/mobile/src/utils/__tests__/` (run `npm test` in `apps/mobile`: Brain dump, founder check, session expiry, PIN key, notification routing, formatting). |

The Start rules in `compute-start.ts` are also implemented separately in Claude's daily brief. Change them in both places or not at all. The formatting in `start-format.ts` is mirrored in `apps/mobile/src/utils/founderFormat.ts`; change both.

### Companies, Roles, Secrets and Approvals

These are the company, role, secrets and approval screens around Start. None of them changes Start. The company split dates from 2026-09-29, and the company rules for lists and single items were merged on 2026-10-05.

#### What you see in each company

You always work in one company at a time (the web navbar switcher, or drawer → **Account** → **Company** on mobile). What you see outside Start depends on it:

| What | Who sees what |
|------|---------------|
| Web **Work** → **Tasks** and **Work** → **Development** (the bugs list), and the web **Your Work** and **Team Tasks** pages | Only tasks and bugs of the company you are working in, plus old items that have no company. This holds for everyone, platform admins and founders included. Switch company to see another company's. |
| **Projects** (web **Admin** → **Projects**, mobile **Projects**) | A platform admin sees every company's projects without switching. Everyone else sees only the company they are working in: all its projects if they administer it, otherwise only the projects they are assigned to. This is about the lists: a web project page opened from a direct link is not checked against the company (see below). |
| **Project \*** in **Create Task** | Only main projects you are assigned to, for every role. Unless you are a platform admin, also only those of the company you are working in. |
| Opening one task or bug (a link, a list row, a notification) | The item must belong to the company you are working in, or have no company, or you must be a platform admin. Then you also need one of: the global role admin or top_management; being its assignee, assigner or supporter (for a bug: its reporter or assignee); or being a member of its project. Being a platform admin only crosses the company boundary. It grants nothing else. |
| A project's requirements and secrets | Platform admins in any company. Everyone else only while working in the project's company. See [Project roles](#project-roles) and [Project secrets](#project-secrets). |
| People lists | Members of the company you are working in. Platform admins see everyone. |
| Mobile **Development** list | Only the company you are working in |
| Mobile **Tasks**, **Your Work** and Home | Your own tasks from every company. Opening one from another company still follows the rule for one task above. |
| Start | No company at all. Threads, **Waiting on you** and team activity cover every company. |

What this means in practice:

- Someone who is not a platform admin and is working in Amtariksha (COMP-001) cannot open Swarg (COMP-002) or Tattva Silicon (COMP-003) tasks, bugs, requirements or secrets, and does not see their projects, tasks or bugs in the web lists. A project assignment left over from before the split does not help there, because the company is checked before project membership. Being a global admin or top_management user does not help either.
- Three things still get through for that person. A web project page opens from a direct link (for example `/projects/PRJ-037`) for any signed-in user, and shows the project's name, description, sub-projects and members. Someone still set as that project's **Manager** can edit it and its members. And on the phone, **Tasks**, **Your Work** and Home still list the person's own tasks from every company, though opening one is refused.
- As a platform admin you see every company's projects, but the web **Tasks** and **Development** lists and the mobile **Development** list show only the company you are working in. From Amtariksha you see Swarg and Tattva Silicon tasks and bugs in **Waiting on you** on Start (when they are yours), in the mobile **Tasks**, **Your Work** and Home lists (your own tasks only), and by opening one directly.
- A new task or bug takes the company of its project. A platform admin working in Amtariksha can file a task in a Swarg project, but the task list they return to does not show it. Switch to Swarg to see it.

#### Company page (web)

**Admin** → **Company** (`/company`) shows the company your session is working in: its name, its ID and its employee-ID prefix. Every signed-in user can open it. Only a **Company admin** of that company or a platform admin can change anything. Other members see **You’re a member of this company. Only a company admin can change its details or its people.**

| To | Do |
|----|----|
| Add someone | **Select someone to add…** (active users not yet in this company) → **Member** or **Company admin** → **Add**. You see **Member added.** Only a platform admin's list shows people from other companies. For a company admin who is not a platform admin the list is always empty, because it draws only on people already in this company, so a platform admin has to add existing people. |
| Change a role | Use the role dropdown on the person's row |
| Remove someone | Click the bin icon (**Remove from this company**) and confirm. Only the membership goes. The user account stays. |
| Change the name, logo or status | Under **Details**, edit **Name**, **Logo URL** or **Status**, then **Save details**. You see **Company details saved.** |
| Create a new user | **Add a user →**. A new user joins the company you are working in, as a **Member**, with that company's employee-ID prefix. To create a Swarg or Tattva Silicon person, switch to that company first. |

- A company's only **Company admin** cannot be demoted or removed. Add another first. Being a platform admin does not count as one.
- Do not set a company you use to **Inactive**. Inactive companies disappear from everyone's company switcher and Company page, yours included, and no screen lists them to switch back.
- The company switcher appears only when you belong to two or more companies, and it lists only those, even for a platform admin. It is in the web navbar, and on mobile under drawer → **Account** → the **Company** row. The last company you pick is where your next sign-in lands. Mobile has no screen for managing members.

#### After the company split (2026-09-29)

COMP-001 Amtariksha kept everything except two project trees. COMP-002 Swarg (code SW) has PRJ-037 Swarg Food and its sub-projects PRJ-045, PRJ-046 and PRJ-047. COMP-003 Tattva Silicon (code TS) has PRJ-051 and the projects under it: PRJ-048, PRJ-049 (with its own sub-project PRJ-050) and PRJ-052. PRJ-002 "Swarg" (Amtariksha's software work for Swarg) and its sub-projects stayed in COMP-001. Their tasks, bugs and requirements moved with the projects.

The split moved nobody. On 2026-09-29 all 21 people were members of COMP-001 only, and the split did not touch memberships or project assignments. This manual cannot see who has been added since; step 1 below shows today's state.

Until a Swarg or Tattva Silicon person has been added to that company and has switched to it, they do not see that company's tasks, bugs or projects in the web lists, and cannot open its tasks, bugs, requirements or secrets. A project page still opens from a direct link (see [What you see in each company](#what-you-see-in-each-company)). You must switch to Swarg or Tattva Silicon yourself to see their tasks and bugs in the web **Tasks** and **Development** lists, and the switcher lists only companies you are a member of. Start is not affected.

To set it up:

1. **Check your own memberships.** Signed in on the web, open the browser console and run `await fetch('/api/companies').then((r) => r.json())`. It lists the companies you belong to. If both COMP-002 and COMP-003 are listed, skip to step 3.
2. **Join each missing company.** No screen can do this, because the Company page and the switcher only show companies you already belong to. As a platform admin, run this in the console for each missing company (here COMP-002):
   ```js
   await fetch('/api/companies/COMP-002/members', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ employeeId: 'AM-0001', companyRole: 'member' }) }).then((r) => r.json())
   ```
   `success: true` means it worked. Run it only for a company you are not in yet. For an existing membership it resets your role there to the one you send and stops that company being your default.
3. Reload the page. The company switcher appears in the navbar. Pick the Swarg company (COMP-002).
4. **Admin** → **Company** now shows Swarg. Add each Swarg person as **Member**, or as **Company admin** for the person who will run it there. Add every Swarg person yourself: a company admin who is not a platform admin cannot add existing people from this page.
5. Switch to Tattva Silicon (COMP-003) and repeat.
6. Switch back to Amtariksha, so your next sign-in lands there.
7. Tell each person you added to switch company: the web navbar switcher, or on mobile drawer → **Account** → tap the **Company** row → tap the company in the **Switch company** sheet. Until they switch, they see none of that company's tasks or bugs on the web. After they switch, that company is where their next sign-in lands, and they stop seeing Amtariksha's lists until they switch back.

#### Project roles

Each project member is a **Manager**, **Team leader** or **Member** of that project.

| Role | Can |
|------|-----|
| Manager | Edit the project, its members and their project roles |
| Team leader | Edit other people's tasks and bugs on the project, and change its secrets |
| Member | View |

A **Company admin** of the project's company, and every platform admin, can do what a manager can. Anyone in that company whose global role is admin or top_management counts as a company admin here.

Requirements follow their own rule, whatever the project role:

- **To see** a project's requirements you must be a platform admin, or be working in the project's company and be either a member of the project or a **Company admin** of that company (a member of it whose global role is admin or top_management counts). Anyone else gets **FORBIDDEN: You are not a member of this project.** That includes a global admin or top_management user of another company.
- **To edit** them you must first pass that rule. Then you need either the global role admin, top_management or management, or **Req. edit** ticked on your row of the project page. Otherwise you get **FORBIDDEN: You don't have edit access to this project's requirements.**
- So a **Company admin** with an ordinary global role can read a project's requirements without being a member, but cannot edit them: **Req. edit** exists only on a member's row.

Where to set project roles:

- **Web:** on the project page, under **Assigned Users**, each member row shows the project role, with the person's global role in grey beside it. The dropdown (**Member**, **Team leader**, **Manager**) appears for anyone with the Projects tab permission, global role admin or top_management, and platform admins. It saves at once with no confirmation. The server accepts the change only from the project's manager, a company admin or a platform admin; anyone else gets an alert saying **You do not manage this project.** A project manager without the Projects tab sees no dropdown on the web and has to use mobile.
- **Mobile:** on **Project Details**, under **Assigned Team Members**, the role badge ends in " ›" when you can change it. Each tap moves it one step (member → team leader → manager → member) and saves at once, with no confirmation. One tap too many makes someone a manager, so check the badge when you are done.

#### Project secrets

- **Mobile:** **Project Details** → **Secrets** → **Open vault** opens **Project Secrets**, a read-only list of credential names and environment keys (**Dev**, **Staging**, **Prod**). Every **Reveal** asks for your fingerprint or face (the phone's own PIN or pattern also works) and is recorded in the project's access log. One value shows at a time. It hides after 30 seconds, when the app goes to the background, or when you leave the screen. **Copy** clears the clipboard after 45 seconds, but only while you stay on the screen: leave sooner and the value stays on the clipboard. Screenshots are blocked on that screen. Without a fingerprint or face set up on the phone, nothing can be revealed.
- **Web:** project page → **Credentials**. Adding, editing, uploading, **Export .env** and deleting stay on the web.
- **Who:** platform admins, in any company. Everyone else only while working in the project's company: project members can view and reveal; a **Manager** or **Team leader** on the project and a **Company admin** of that company can also change, export and read the access log. Anyone in the company whose global role is admin or top_management counts as a company admin here. Otherwise the server refuses with **No access to this project**, even for a project member who has not switched to the project's company.
- **Limit:** once you have 40 reveals or exports in the last 10 minutes (counted across all projects, web and mobile, credential reveals and **Export .env** included), the mobile vault refuses further environment-variable reveals with **Too many secrets revealed in the last 10 minutes. Try again shortly.** Credential reveals and web reveals are never blocked.
- **Access log:** API only, `GET /api/projects/<project ID>/credentials/audit` (100 rows by default, up to 500 with `?limit=`).
- **Database:** the access log and the reveal limit need migration [`apps/web/database/migrations/065_credential_access_log_detail.postgresql.sql`](../apps/web/database/migrations/065_credential_access_log_detail.postgresql.sql). Without it, every access-log write fails silently, nothing is recorded and the limit never triggers. Check the live project's migration list.

#### Approvals

Nobody can approve or reject their own leave, WFH or attendance request, founders and platform admins included. The mobile **Approvals** screen shows **Your own request — waiting for your manager.** instead of the buttons. The mobile leave and WFH detail screens simply show no Approve or Reject. The web **Approvals** page still shows **Approve** on your own request. For your own leave or WFH request, **Approve** → **Approved** ends in **Server error: API request failed: 403 …**. For your own attendance request, **Approve** → OK shows **Failed to approve request: FORBIDDEN: You do not have permission to approve this request.** Someone else must approve yours: another platform admin, or someone working in a company you belong to who is either a **Company admin** of it or above you in the reporting chain. Anyone in that company whose global role is admin or top_management counts as a company admin here.

#### Minimum app version

On **App Version Management** (`/settings/app-management`), **Minimum Android Version** makes any older phone show only **Update Required**. Its **Update App** button opens the Play Store. Do not raise the minimum above the version on the Play Store. Check the Play listing first: it had 1.1.9 on 2026-10-05, and this manual cannot know what it has now.

A test APK signed with the Android debug key cannot go to the Play Store. A Play release needs a build signed with the app's own key (see `apps/mobile/RELEASE_GUIDE.md`). A local release build stops with "Release build would be signed with the debug keystore. …" unless the signing settings `RELEASE_STORE_FILE`, `RELEASE_STORE_PASSWORD`, `RELEASE_KEY_ALIAS` and `RELEASE_KEY_PASSWORD` are provided. For a build that will never be distributed, pass `-PallowDebugSignedRelease=true`.

---

*End of Founder Start User Manual*
