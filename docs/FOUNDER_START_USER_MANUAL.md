# Karmayog — Founder Start: User Manual

**Version:** 1.1  
**Last Updated:** 2026-09-17  
**For:** Founder (AM-0001) and platform admins  
**App version:** mobile 1.2.0

---

## Changelog
- **2026-09-17 (1.1)**: Review corrections: weekday names in the examples, parked-thread labels, thread deletion, deleted projects, push timing and failure checks, nested repos in the machine scripts, token setup, first-morning checklist, adding a founder and calling the API.
- **2026-09-17**: First version of the Founder Start manual. Covers the mobile app (1.2.0, build 20), the web page at `/start`, the 09:00 IST push, the scripts on the founder's machine and admin setup.

---

## Table of Contents
1. [What Start Is](#what-start-is)
2. [Key Ideas](#key-ideas)
3. [How the Top 3 Is Chosen](#how-the-top-3-is-chosen)
4. [Opening Start](#opening-start)
5. [The Start Screen](#the-start-screen)
6. [Daily Close-out](#daily-close-out)
7. [Ranking Threads for the Week](#ranking-threads-for-the-week)
8. [Managing Threads](#managing-threads)
9. [The 09:00 Push](#the-0900-push)
10. [Automatic Activity from Your Machine](#automatic-activity-from-your-machine)
11. [Working with Claude](#working-with-claude)
12. [FAQ](#faq)
13. [Troubleshooting](#troubleshooting)
14. [For Admins](#for-admins)

---

## What Start Is

Start is a screen in Karmayog that only founders can see. It helps you keep about a dozen work "threads" moving. For each thread it keeps one next step, and each day it picks the three threads to look at first (your **Top 3**). It also shows the rest of your threads, the tasks and bugs waiting on you, and any notes Claude left for you. You can open Start in the mobile app or at https://task.amtariksha.com/start.

### The daily rhythm

| When | What happens |
|------|--------------|
| Around 09:00 IST (between about 08:30 and 09:30) | A push titled **Start · Wed 16 Sep** (today's date) lists your Top 3. Tap it to open Start. |
| During the day | You work. Your Claude Code sessions, your git commits and your team's work in linked projects mark threads as touched on their own. |
| End of day | A 60-second close-out: tap the threads you worked on and type each one's next step. |
| Once a week | Rank your threads. Only ranked threads can enter the Top 3. Ranks stay until you save a new ranking or park the thread. Nothing clears them each week, and there is no reminder. |

All Start dates use Indian time (IST). For example, 18:31 UTC on 16 Sep is already 17 Sep on Start.

### Before your first morning

The 09:00 push only goes out when you have at least one active thread. With none, the daily job sends nothing (it skips with `nothing-to-send`). At the time of writing (17 Sep 2026) the live database has no active threads, only four parked test threads named "[gate-test] …". Do this before your first morning:

1. Open https://task.amtariksha.com/start (or **Start** in the mobile app 1.2.0).
2. Click **Close-out** → **+ new**. Type the label exactly as it appears as a value in `~/.config/karmayog/founder-map.json` (for example "Karmayog" or "Swarg"), then click **Add** and type the next action. Repeat for each thread, then click **Save (N)**. A new label in a close-out creates the thread, sets its next action and marks it touched in one step. The labels in this manual's examples, such as "Swarg menu", are only examples. If a label differs from the map, activity from your machine creates a second thread.
3. Open **Rank threads**, rank the threads that matter and click **Save ranks** (**Save** on mobile). A thread needs both a rank and a next action to enter the Top 3.
4. Check that the **Top 3** shows cards and that there is no grey **Paused until …** line.
5. Leave the four "[gate-test]" parked threads parked. They are test data. Do not unpark them.

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
| You | Saving a close-out entry for the thread (even without a new next action) | `closeout` |
| Anyone using the API | Changing the next action with `updateFounderResumePoint` (see [For Admins](#for-admins)) | `manual` |
| Your machine | A Claude Code session or your git commits in a mapped repo (see [Automatic Activity](#automatic-activity-from-your-machine)) | `hook` |
| Your team | Task or bug activity (including sub-projects) in the linked project in the last 24 hours, if newer than the current touch. It is saved when Start is loaded or the 09:00 job runs. | `karmayog` |

"Last touched" only ever moves forward.

Until Start is loaded (or the 09:00 job runs), the stored thread does not have the team-activity touch yet. A direct database read, for example by Claude, can then show an older last-touched time than Start does.

### Who writes check-ins

Each check-in has a **kind** (`closeout`, `activity`, `rank`, `start`) and a **source** (`app`, `hook`, `claude`, `manual`).

| Check-in | Written by |
|----------|------------|
| `closeout` · `app` | You, one per thread in each close-out |
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

**Not today** on a Top 3 card moves that card to the bottom of the Top 3 on your screen. The thread you marked last goes last. Nothing is saved to the server, and the order only changes on that device or browser page. The marks are dropped when the date changes, when you reload the web page, and on mobile when the app restarts or you unlock it with your PIN.

---

## Opening Start

### Who can open it

- Every **platform admin** is a founder.
- Employee IDs in the server setting `FOUNDER_EMPLOYEE_IDS` are founders too. When that setting is empty, the list is just AM-0001.
- Start is not a normal tab permission. You cannot grant it from the Permissions settings.
- The server decides who is a founder, from the `FOUNDER_EMPLOYEE_IDS` server setting and the platform-admin flag in the database, never from your login token. Anyone else is turned away and never sees founder data. The 09:00 push goes only to founders whose user status is active.

### On mobile (1.2.0)

- **Check the version first:** open the drawer and tap **Account** (or **Settings**). The bottom of the screen shows **Version 1.2.0**. If it shows a lower version, install the 1.2.0 (build 20) release of Karmayog (`com.karmayog`) before relying on the push. Older builds have no Start screen, so neither the drawer item nor the push can open it.
- **After login or unlock:** founders land straight on Start. After the PIN lock screen (shown when the app was in the background for 5 minutes or more), you land on Start again.
- **From the drawer:** open the menu (hamburger) and tap **Start**. It is the first item, above **Home**.
- **From the push:** tap the 09:00 notification.
- **Back to the normal app:** tap **⋮** then **Home**, or open the drawer and tap **Home**. Start stays open underneath: the Android back button on Home takes you back to Start.
- **Next morning:** if you bring the app back on a new IST day, it shows today's Start and closes any screens you had opened on top. If Start or **Rank threads** is already open, or you opened the app from a notification, it reloads today's Start in place instead, so an open close-out or unsaved rank changes are kept.
- The app remembers you are a founder, so it still opens on Start when you are offline. It checks again whenever you come back to the app. If you stop being a founder, Start and its drawer item disappear.

### On the web

1. Go to https://task.amtariksha.com and sign in.
2. Open the **Work** menu (hover on desktop; tap **Work** in the phone menu).
3. Click **Start**. It is the first item, above **Dashboard**.

You can also go straight to https://task.amtariksha.com/start.

While the page checks your access, you see a spinner. If you are not signed in, you are sent to the login page; if you are not a founder (or your web session has expired), to the dashboard. If the check itself fails (for example, no network), the error shows in red with a **Retry** button.

---

## The Start Screen

### Layout at a glance

| Part | Mobile | Web |
|------|--------|-----|
| Heading | **START · Wed 16 Sep** (the IST date) | Same |
| Actions | **Close-out** button at bottom right; **⋮** menu (**More Start options**) in the header | Toolbar: **Close-out**, **Rank threads**, **Add thread**, **Show parked**, **Refresh** |
| Refresh | Pull down on the screen | **Refresh** button (**Refreshing…** while it runs) |
| Messages | Short pop-up toast for 3 seconds | Green (success) or red (error) box under the toolbar |
| Pause | **⋮** → **Pause Start until…** | **Pause Start push** section on the page |
| Out-of-date warning | Banner under the heading | Amber banner |

The mobile **⋮** menu holds, in order: **Rank threads**, **Show parked** (or **Hide parked**), **Pause Start until…**, **Add thread**, **Home**. The header also has the usual project filter, light/dark toggle and notification bell. The project filter does not change what Start shows.

Top to bottom, the web page shows: heading, toolbar, status message, **Add thread** box (when open), out-of-date banner, close-out warning, paused line, **Pause Start push**, **Top 3**, **Other threads**, **Waiting on you**, **Claude's notes** and **Parked threads** (when shown). Mobile uses the same order for the thread sections, with section titles in capitals (**TOP 3**, **OTHER THREADS** …).

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

Up to 5 items that need you. The section is hidden when there are none.

- **Open tasks** where you are an assignee or on the support list, due today, tomorrow or the day after. Overdue tasks are included. Tasks with no due date are not.
- **Open bugs** assigned to you, whatever their due date.
- Finished work is left out: tasks marked Done, Completed, Cancelled, Cancel, Stop or Closed, bugs marked Resolved or Closed, and anything deleted.

Items are sorted by due date, earliest first. Bugs with no due date come last, then items are ordered by ID. Only the first 5 are shown, so undated bugs drop off first. Each row shows a task or bug icon, "\<ID> · \<title>", the project (the sub-project when there is one) and a due label: **overdue · Wed 16 Sep** (red), **due today**, **due tomorrow**, **due Fri 18 Sep** or **no due date**. Tap a row to open that task or bug.

### Claude's notes

A folded panel with a robot icon and the time it was written. It only appears on days when Claude has written your daily brief (see [Working with Claude](#working-with-claude)). Open it to read the note in a fixed-width font, with "Check-in at \<time>" underneath. The time uses your device's time zone and format, for example 08:45 or 8:45 AM. On mobile you can select and copy the text.

### Parked threads

Tap **Show parked** (mobile: in the **⋮** menu) to add a **Parked threads** list at the bottom. Each row shows the label, the next action and an **Unpark** button. If there are none: **No parked threads** on mobile, **No parked threads.** on the web. On mobile the parked list stays open until you hide it or the app restarts or locks. Coming back from Home keeps it open.

---

## Daily Close-out

A close-out tells Start what you worked on today and what comes next. For each thread you pick, Start:

- sets **last touched** to now,
- replaces the next action if you typed one (otherwise keeps the old one),
- saves your **What happened** note, if any,
- changes **Waiting on** only if you edited it (empty it to remove it),
- adds a `closeout` check-in.

The whole close-out saves together or not at all. You can include 1 to 50 threads at a time.

### On mobile

1. Tap the **Close-out** button at the bottom right of Start. The **Close out** sheet opens: "Tap what you touched, then set each next step."
2. Tap the chip for each thread you worked on. Ranked threads come first, then the rest alphabetically. Each chip you tap adds a block below and puts the cursor in its **Next action** box.
3. Type the next physical step. The grey hint shows the current next action, or **One physical step** if there is none. Leave it blank to keep the current one.
4. Optional: tap **+ details** to fill **What happened** and **Waiting on**. **Waiting on** starts with the current value. Empty it to remove it.
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
| Close after typing | Blocked. Only **Cancel** throws the text away. Opening **+ details**, adding a new thread, or text in a chip you have since unselected also counts as typing. | Blocked, with the message **You have typed a close-out. Use Cancel to discard it.** Selecting chips alone does not count as typing, but text in an unselected chip does. |
| Always closes and discards | **Cancel** | **Cancel** or the **X** |
| Offline | **Offline — close-out needs a connection**, and **Save** is disabled. Nothing is saved for later. | — |
| Save fails | Error toast (for example **Could not save close-out**). The sheet stays open with your text. | Red message (for example **Could not save the close-out.**). The dialog stays open with your text. |

---

## Ranking Threads for the Week

A ranking gives your chosen threads ranks 1, 2, 3 … in order. **Every other active thread becomes unranked.** Saving an empty ranked list unranks everything. Parked threads cannot be ranked. Ranks stay until you save a new ranking or park the thread; nothing resets them each week. Tip: put the thread that must move every day at rank 1. It takes Top 3 slot 1 whenever it has a next action.

### On mobile

1. On Start, tap **⋮** → **Rank threads**. The **Rank threads** screen loads your active threads.
2. Ranked threads appear at the top with position numbers. Use the up and down arrows to move a thread one place at a time. Use the unrank button to move it to the **Unranked** list.
3. Under **Unranked** (sorted alphabetically), tap the rank button to add a thread to the bottom of the ranked list.
4. Tap **Save** at the bottom. You see **Ranks saved** and return to Start, which reloads.

Moving threads around changes nothing until you tap **Save**. To leave without saving, use the back arrow. Offline, the bar shows **You are offline. Connect to save ranks.**

### On the web

1. Click **Rank threads** in the toolbar. The dialog shows **Loading threads…** and then your active threads.
2. Use the up and down arrows to reorder, the double-down arrow to unrank, and the double-up arrow on an **Unranked** row to rank it at the bottom.
3. Click **Save ranks**. The dialog closes, the page shows **Ranks saved.** and Start reloads.

The second button reads **Close** until you change something, then **Cancel**. Both close without saving. Escape or a click on the background only closes the dialog when nothing has changed.

Other messages: **Nothing ranked yet. Rank a thread from the list below.** (no thread is ranked), **Every active thread is ranked.** (the Unranked list is empty) and **No active threads to rank.** (nothing to rank; **Save** is disabled).

---

## Managing Threads

### Adding a thread

| Where | How |
|-------|-----|
| Mobile | **⋮** → **Add thread** → type the **Label** (the counter shows **\<n>/120**) → **Add**. You see **Thread added**. |
| Web | **Add thread** in the toolbar → type the **Thread label** → Enter or **Add**. You see **Thread added: \<label>**. The box stays open for the next one. Click **Add thread** again to hide it. |
| Close-out | **+ new** (see [Daily Close-out](#daily-close-out)) |

A thread added with **Add thread** has no next action, no rank and has never been touched, so it shows **never ⚠** and stays in **Other threads**. Give it a next action in a close-out and rank it to get it into the Top 3. Adding it from a close-out marks it as touched straight away.

Labels must be unique across all threads, parked ones included, ignoring capitals. A second "karmayog" gives **A thread with this label already exists.** You get the same message when the label belongs to a parked thread, even though no such thread is visible on Start. Unpark that thread instead. Offline on mobile, the dialog shows **You are offline — connect to add a thread.**

### Changing the next action or "waiting on"

Use the close-out. It is the app's editing screen for threads (see [Daily Close-out](#daily-close-out)).

The app has no buttons to rename a thread or change its project link. Claude works on the same data, so you can ask Claude to do these. An admin can also use the API (see [Calling the API](#calling-the-api)).

After renaming a thread, update its label in `~/.config/karmayog/founder-map.json` too. Otherwise your next Claude Code session or commit creates a new thread with the old name.

### Parking and unparking

- **Park:** open a card or row and tap **Park**. You see **Parked \<label>** and Start reloads without it. The thread keeps its next action and "waiting on", but **its rank is removed**. Parked threads get no team-activity touches.
- **Parking keeps the label taken.** Close-outs that use that label, and machine activity mapped to it, still go to the parked thread. It is marked touched and gets the check-in, but stays parked and hidden from Start. To work on it again, unpark it.
- **Unpark:** open **Show parked** and tap **Unpark** next to the thread. It comes back **unranked**, so rank it again if it belongs in the Top 3. Mobile shows **Thread unparked**; the web shows **Unparked \<label>**.

Parking is how you retire a thread. A thread that has any check-in cannot be deleted: the database refuses with **Rows in founder_checkins are immutable (append-only audit table)**, because check-in history can never be changed. Only a thread with no check-ins (for example one added with **Add thread** and never touched) can be deleted.

### Linking to a project

Linking a thread to a Karmayog project lets your team's work count as touches and shows **team updates in 24h** on the card.

- **Automatic link:** a thread created from a new label (close-out **+ new**, or activity from your machine) is linked when exactly one live project has that exact name (capitals ignored) and no other thread uses that project. Otherwise it starts unlinked.
- **Team activity** includes the project and all its sub-projects: tasks and bugs updated in the last 24 hours, plus their activity-log entries in that window. Deleted tasks and bugs are skipped.
- **One project, one thread.** Linking a project that another thread already uses gives **That project is already linked to another thread.** A missing or deleted project gives **Project not found.**
- **If the project is deleted in Karmayog** (a soft delete), the thread stays linked to it and keeps showing its name. It can still pick up team activity from that project's remaining tasks and bugs, and the project stays taken under the one-project rule. To unlink it, ask Claude or set `projectId` to empty through the API (see [Calling the API](#calling-the-api)). The link is cleared automatically only if the project row is removed from the database.

---

## The 09:00 Push

### What it says

- **Title:** **Start · Wed 16 Sep**
- **Body:** your Top 3, one line each: "1. Karmayog · Ship Start manual". The body is at most 180 characters, so long next actions are shortened with "…".
- With no Top 3: **No Top 3 yet — rank your threads and set next actions.**
- If you have no active threads at all, no push is sent.

Tap the push to open Start. If you are no longer a founder, it opens Notifications instead.

After the push goes out, you also get an in-app notification with the same title, **Your Start for Wed 16 Sep is ready.**, linking to `/start`. It never contains thread names or next actions. No email is sent. In the mobile Notifications list, tapping that row only marks it as read.

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

Errors on the web: **Pick a date to pause until.** and **Pick today or a later date.** On both: **Could not update the Start pause.** (or the server's message). On mobile the date picker only lets you pick today or later, and you need a connection to change the pause (**You are offline — connect to change the pause.**).

The "push is on" text only looks at the pause. It still says the push is on when an admin has turned the push off (see [For Admins](#for-admins)).

### If the push did not arrive

Work through these in order:

1. **Too early?** The push can come as late as about 09:30 IST. Wait until then.
2. **Turned off?** An admin may have called `updateFounderStartSettings(enabled: false)`. Start shows nothing for this. Check it on the Start web page with the browser console (see [Calling the API](#calling-the-api)): `await gql('{ founderStartSettings { enabled pausedUntil lastSentDate } }')`. `enabled` must be `true`. `lastSentDate` equal to today means today's send was already claimed.
3. **Paused?** Look for the grey **Paused until …** line on Start.
4. **Any active threads?** With no active (not parked) thread, nothing is sent.
5. **Already sent today?** Only one push goes out per day. Check the in-app Notifications for **Your Start for \<today> is ready.** If it is there, Expo (the push service) accepted the push for your account. Your phone can still have missed it, for example because its device registration expired.
6. **Phone set up for pushes?** The push counts as failed only when your account has no active push token or the request to Expo fails. A device that Expo rejects is only logged, and if Expo says the device is no longer registered, its token is marked invalid. To fix it: open the app on that phone while signed in (it registers the phone again at start), allow notifications for Karmayog in Android settings, or sign out and in again. The push goes to every phone and emulator where you are signed in.
7. **Still nothing?** Ask an admin to check the server log and the cron result (see [The daily push job](#the-daily-push-job)).

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

- **Claude's daily brief** follows the same Start rules and date format as the app, so from the same data both pick the same Top 3, provided Claude also applies the 24-hour team-activity touch (Start only saves that touch when it is loaded or the 09:00 job runs).
- **Claude's notes:** when Claude writes today's brief as a Start check-in, it appears on Start in the **Claude's notes** panel. It can include calendar and inbox lines that the app does not have. A note shows there only if it is a check-in with kind `start`, source `claude` and `checkin_date` equal to today in IST (the column defaults to that). The newest such note is shown. Leave `resume_point_id` empty: the panel does not need a thread, and a note tied to a thread also shows in that thread's check-ins.
- **Close-out through Claude** (ask Claude to do your close-out) and the app close-out work on the same threads, so you can use either one.
- **Edits the app cannot make** (rename a thread, link or unlink a project, clear a next action) can be done by asking Claude. After a rename, update `founder-map.json` too (see [Changing the next action](#changing-the-next-action-or-waiting-on)).

### Switching off Claude's scheduled brief

The app has no switch for Claude's brief, because it runs separately from Karmayog. Once the 09:00 app push has been reaching your phone reliably each morning (the **Your Start for \<date> is ready.** row in Notifications only shows that Expo accepted the push, not that your phone got it):

1. Turn off the schedule that runs Claude's morning brief, so you do not get two Starts each morning. It is not in this repo, and the Claude Code scheduled-tasks list on the founder's machine is empty. Ask Claude, where you set up the brief: "show my scheduled tasks and turn off the morning Start brief".
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
A close-out **+ new** or your machine's activity used a label that matched no thread, active or parked. Check the spelling in `founder-map.json`, and update the map after renaming a thread.

**Can another person use Start?**  
Only founders: platform admins and the employee IDs in `FOUNDER_EMPLOYEE_IDS`. All founders share the same threads and the same push settings.

---

## Troubleshooting

| Symptom | Cause | Fix |
|---------|-------|-----|
| **Rank threads and set next actions to fill your Top 3.** | No active thread has both a rank and a next action | Rank threads and give them next actions in a close-out |
| A thread shows **never ⚠** | It was added with **Add thread** and never touched | Include it in a close-out |
| **No close-out since … — next actions may be stale.** | No close-out yesterday or today | Do a close-out |
| **Showing the Start for … — today’s hasn’t loaded yet.** | Today's Start has not loaded yet | Pull down (mobile) or click **Refresh** (web) |
| **Couldn’t refresh — showing the last loaded Start.** | Network or server error | Check your connection and refresh |
| **Offline — close-out needs a connection** | Phone offline | Reconnect, then **Save**. Your text stays while the sheet is open. |
| Close-out sheet will not close | You typed something (also in a chip you have since unselected) | Tap **Cancel** to discard, or **Save** |
| **A thread with this label already exists.** | Same label, maybe with different capitals | Use the existing thread or pick another label |
| **A thread with this label already exists.** but no such thread on Start | The thread is parked | **Show parked** → **Unpark** |
| Close-out saved (or Claude Code or commit activity recorded) but the thread never appears | The label belongs to a parked thread | **Show parked** → **Unpark**, or change the label in `founder-map.json` |
| Deleting a thread fails with **Rows in founder_checkins are immutable (append-only audit table)** | The thread has check-ins | Park it instead |
| **That project is already linked to another thread.** | One project can have only one thread | Unlink the other thread first (ask Claude) |
| **Project not found.** | The project does not exist or was deleted | Check the project ID |
| **Ranking includes an unknown or parked thread.** | A thread in your list was parked or removed | Close and reopen **Rank threads**, then save again |
| **Provide between 1 and 50 entries.** | Close-out with no threads or more than 50 | Select 1 to 50 threads |
| **\<field> must be at most \<N> characters.** | Text too long (label 120; next action, note and waiting on 2000; activity summary 500; project ID 64) | Shorten it |
| No **Start** in the drawer or Work menu, `/start` sends you to the dashboard, or **FORBIDDEN: You do not have permission to perform this action.** | You are not a founder, or your web session expired | Sign out and sign in again first. If it still happens, ask an admin to add your employee ID to `FOUNDER_EMPLOYEE_IDS` and redeploy (see [Adding a founder](#adding-a-founder)), then reload the web page or reopen the mobile app so it checks again. |
| **UNAUTHENTICATED: You must be signed in.** | Signed out (or, for scripts, wrong token) | Sign in again. For scripts, check the token in `founder.env`. |
| No 09:00 push | Push turned off (`enabled: false`), paused, no active threads, already sent, or no push registration | See [If the push did not arrive](#if-the-push-did-not-arrive) |
| Claude Code work does not touch the thread | Repo not in the map, 20-minute wait, or setup problem (for example no `founder.env`) | Run the hook test with `FOUNDER_INGEST_DEBUG=1`. Look for "no founder-map entry for …", "debounced: …", "map not found: …", "config not found: …" or "jq is not installed". |
| Hook test prints `debounced: …` right after setup | An earlier post, even a failed one, set the 20-minute marker | `rm -f ~/.cache/karmayog/Karmayog-*.last` (with your label), then test again |
| Test post shows "applied: 0" | Same text posted for that thread in the last 20 minutes | Use different text or wait 20 minutes |
| `config not found`, or `… is not set in …` | `founder.env` missing or incomplete | Redo setup step 1 |
| `… is readable by other users …` | File permissions too open | `chmod 600 ~/.config/karmayog/founder.env` |
| `HTTP <status> from <url>` or `GraphQL error: …` | Wrong URL or token, or a server problem | Check `founder.env`. Ask an admin to check `FOUNDER_INGEST_TOKEN`. |
| Scan log: `no author to match; set git user.email or FOUNDER_GIT_AUTHORS` | The repo has no author email set | Set `git config user.email` or `FOUNDER_GIT_AUTHORS` |
| Hook broke after switching branches | Scripts were symlinked into the repo | Reinstall as copies (setup step 3) |

---

## For Admins

### Server environment variables

Set these on the web server (Vercel). Never commit their values. Vercel applies a changed variable only to new deployments, so redeploy after every change.

| Variable | Purpose |
|----------|---------|
| `FOUNDER_EMPLOYEE_IDS` | Comma-separated employee IDs that count as founders, on top of all platform admins. When empty, it defaults to `AM-0001`. Setting it **replaces** that default (AM-0001 still qualifies if it is a platform admin). |
| `FOUNDER_INGEST_TOKEN` | Shared secret for `ingestFounderActivity` (the Stop hook and the nightly scan). Generate it with `openssl rand -hex 32` and put the same value in `founder.env` on the founder's machine. When unset, every ingest call is rejected. |
| `CRON_SECRET` | Required for `/api/cron/*`. Vercel sends it as `Authorization: Bearer <CRON_SECRET>`, and cron calls without it are rejected with 401. |

### Adding a founder

1. In Vercel → task project → Settings → Environment Variables (Production), set `FOUNDER_EMPLOYEE_IDS=AM-0001,AM-00xx`. Keep AM-0001 in the list unless it is a platform admin, because setting the variable replaces the default.
2. Redeploy the web app.
3. Check that the new founder's user status is active, or they will not get the 09:00 push.
4. The new founder reloads the web page or brings the mobile app back to the foreground (it checks again then). If Start still does not appear, they sign out and in again.

All founders share the same threads and the same pause.

### Database

- Migration: [`apps/web/database/migrations/064_founder_start.postgresql.sql`](../apps/web/database/migrations/064_founder_start.postgresql.sql). It is already applied to the live project as the Supabase migration `founder_start` (version 20260915061742). Do not edit it. Add a new migration for changes. It is safe to re-run.
- Rollback: [`apps/web/database/migrations/064_founder_start_rollback.postgresql.sql`](../apps/web/database/migrations/064_founder_start_rollback.postgresql.sql). **DESTRUCTIVE:** it drops `founder_resume_points` and `founder_checkins` with all their rows. First export both with `COPY founder_resume_points TO STDOUT WITH CSV HEADER;` and `COPY founder_checkins TO STDOUT WITH CSV HEADER;`, and take a Supabase backup. The file also says to roll back a "Migration 065 (founder plan)" first; no such migration is in this repo, so check the live project's migration list before running it.
- Tables: `founder_resume_points` (threads) and `founder_checkins` (history; a trigger blocks every UPDATE and DELETE). RLS is on with no policies. Because `founder_checkins.resume_point_id` is `ON DELETE SET NULL`, and that SET NULL is itself a blocked UPDATE, a thread with any check-in cannot be deleted.
- Push settings: one platform-level row in `settings` with key `founder_start` (`company_id` NULL), shared by all founders. It holds `enabled`, `hour` (9), `minute` (0), `tz`, `pausedUntil` and `lastSentDate`.

### The daily push job

- Cron: `/api/cron/founder-start` with schedule `30 3 * * *` (03:30 UTC = 09:00 IST) in `vercel.json`. Vercel can run it at any point from 03:00 to 03:59 UTC (08:30–09:29 IST); the server accepts a call from 08:00 IST. The time is set by that cron and must match `CRON_PUSH_HOUR_IST` / `CRON_PUSH_MINUTE_IST` in `push-schedule.ts`. Change both together, or a cron earlier than 08:00 IST is skipped as `too-early` (and the API keeps refusing any time other than the one in `push-schedule.ts`).
- Skip reasons, in the order they are checked: `disabled`, `paused`, `already-sent`, `too-early` (before 08:00 IST). Then `no-founders`, `nothing-to-send` (no founder has an active thread), `already-sent` again (the atomic claim of the day lost to a concurrent or retried call) and `send-failed`. On `send-failed` the day is released so a later call the same day can retry. The day is released only when no founder's push went out; if at least one succeeded, founders whose push failed are not retried. The only automatic call is the once-a-day cron, so a retry needs a manual call (below).
- Response: `{ success: true, status: 'sent'|'skipped', reason?, date, sent, failed }`, or HTTP 500 `{ success: false, error: 'Founder Start push failed' }`.
- A founder with no active push token, or a failed request to Expo, logs `push not delivered to <id> (no active push token or Expo rejected it)`. A rejection for a single device logs `[sendPushNotification] Error for token …` and still counts as sent. The in-app notification row and the `start` check-in are written whenever Expo accepted the request.
- To turn the push off completely (not just pause it), call `updateFounderStartSettings(enabled: false)`. The app has no button for this and shows no sign of it. `pausedUntil` must be `YYYY-MM-DD`. The server checks only that format, not that the date is today or later (a past date is accepted and has no effect).

**Running the job by hand.** This sends a real push and claims the day. With `CRON_SECRET` set in your shell to the server's value:

```bash
curl -s -H "Authorization: Bearer $CRON_SECRET" https://task.amtariksha.com/api/cron/founder-start
```

It is a GET request. Before 08:00 IST it returns reason `too-early`, and after a send the same day it returns `already-sent`. Logs: Vercel → project → Logs, search for `[founder-start]` or `sendPushNotification`.

### GraphQL API (`/api/graphql`, founders only)

Queries: `founderStart`, `founderResumePoints(includeParked)`, `founderCheckins(resumePointId, limit)`, `founderStartSettings`.  
Mutations: `createFounderResumePoint(label, projectId)`, `updateFounderResumePoint(id, label, projectId, nextAction, waitingOn, isActive)`, `createFounderCloseout(entries)`, `updateFounderRanks(orderedIds)`, `updateFounderStartSettings(enabled, hour, minute, pausedUntil)`, `ingestFounderActivity(token, entries)` (checks the token instead of a login).

Setting `nextAction` through `updateFounderResumePoint` also marks the thread as touched (`manual`). Changing only the label, project, waiting-on or active flag does not. Setting `projectId` to empty unlinks the project.

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

### Where the code lives

| Area | Path |
|------|------|
| API | `apps/web/src/graphql/founder-schema.ts`, `founder-resolvers.ts` |
| Rules, push, access | `apps/web/src/lib/founder/`: `compute-start.ts` (Top 3, stale), `start-format.ts`, `push-schedule.ts`, `start-push.ts`, `start-service.ts`, `founder-auth.ts` |
| Data | `apps/web/src/lib/db/founder*.ts` |
| Cron | `apps/web/src/app/api/cron/founder-start/route.ts`, `vercel.json` |
| Web UI | `apps/web/src/app/start/`, `apps/web/src/components/founder/`, `apps/web/src/hooks/useFounderStart.ts`, `Navbar.tsx` |
| Mobile UI | `apps/mobile/src/screens/founder/`, `apps/mobile/src/components/founder/`, `apps/mobile/src/hooks/useFounderStart.ts`, `utils/founderFormat.ts` (copy of the date/age/label formatting), `App.tsx`, `CustomDrawerContent.tsx`, `services/founderFlagService.ts` |
| Machine scripts | `scripts/founder/` (setup guide: `scripts/founder/README.md`) |
| Tests | `apps/web/src/lib/founder/__tests__/` (run `npm test` in `apps/web`) |

The Start rules in `compute-start.ts` are also implemented separately in Claude's daily brief. Change them in both places or not at all. The formatting in `start-format.ts` is mirrored in `apps/mobile/src/utils/founderFormat.ts`; change both.

---

*End of Founder Start User Manual*
