# Graph Report - apps/mobile/src  (2026-07-26)

## Corpus Check
- 93 files · ~94,325 words
- Verdict: corpus is large enough that graph structure adds value.

## Summary
- 603 nodes · 1812 edges · 32 communities (29 shown, 3 thin omitted)
- Extraction: 100% EXTRACTED · 0% INFERRED · 0% AMBIGUOUS · INFERRED: 2 edges (avg confidence: 0.8)
- Token cost: 0 input · 0 output

## Graph Freshness
- Built from commit: `2bf1245e`
- Run `git rev-parse HEAD` and compare to check if the graph is stale.
- Run `graphify update .` after code changes (no API cost).

## Community Hubs (Navigation)
- [[_COMMUNITY_Community 0|Community 0]]
- [[_COMMUNITY_Community 1|Community 1]]
- [[_COMMUNITY_Community 2|Community 2]]
- [[_COMMUNITY_Community 3|Community 3]]
- [[_COMMUNITY_Community 4|Community 4]]
- [[_COMMUNITY_Community 5|Community 5]]
- [[_COMMUNITY_Community 6|Community 6]]
- [[_COMMUNITY_Community 7|Community 7]]
- [[_COMMUNITY_Community 8|Community 8]]
- [[_COMMUNITY_Community 9|Community 9]]
- [[_COMMUNITY_Community 10|Community 10]]
- [[_COMMUNITY_Community 11|Community 11]]
- [[_COMMUNITY_Community 12|Community 12]]
- [[_COMMUNITY_Community 13|Community 13]]
- [[_COMMUNITY_Community 14|Community 14]]
- [[_COMMUNITY_Community 15|Community 15]]
- [[_COMMUNITY_Community 16|Community 16]]
- [[_COMMUNITY_Community 17|Community 17]]
- [[_COMMUNITY_Community 18|Community 18]]
- [[_COMMUNITY_Community 19|Community 19]]
- [[_COMMUNITY_Community 20|Community 20]]
- [[_COMMUNITY_Community 21|Community 21]]
- [[_COMMUNITY_Community 22|Community 22]]
- [[_COMMUNITY_Community 23|Community 23]]
- [[_COMMUNITY_Community 24|Community 24]]
- [[_COMMUNITY_Community 25|Community 25]]
- [[_COMMUNITY_Community 26|Community 26]]
- [[_COMMUNITY_Community 27|Community 27]]
- [[_COMMUNITY_Community 28|Community 28]]
- [[_COMMUNITY_Community 29|Community 29]]
- [[_COMMUNITY_Community 30|Community 30]]
- [[_COMMUNITY_Community 31|Community 31]]

## God Nodes (most connected - your core abstractions)
1. `useTheme()` - 105 edges
2. `useResponsive()` - 57 edges
3. `materialTypography` - 49 edges
4. `materialSpacing` - 48 edges
5. `getUserData()` - 39 edges
6. `materialColors` - 38 edges
7. `useNetworkStatus()` - 26 edges
8. `get()` - 18 edges
9. `useProjectFilter()` - 17 edges
10. `formatDateIST()` - 17 edges

## Surprising Connections (you probably didn't know these)
- `MaintenanceScreen()` --calls--> `useTheme()`  [EXTRACTED]
  App.tsx → contexts/ThemeContext.tsx
- `UpdateRequiredScreen()` --calls--> `useTheme()`  [EXTRACTED]
  App.tsx → contexts/ThemeContext.tsx
- `AnimatedTabBar()` --calls--> `useTheme()`  [EXTRACTED]
  components/AnimatedTabBar.tsx → contexts/ThemeContext.tsx
- `QuickActionsModal()` --calls--> `useTheme()`  [EXTRACTED]
  components/QuickActionsModal.tsx → contexts/ThemeContext.tsx
- `ReleaseChecklistEditorProps` --references--> `ReleaseChecklistTemplate`  [EXTRACTED]
  components/ReleaseChecklistEditor.tsx → types/index.ts

## Import Cycles
- None detected.

## Communities (32 total, 3 thin omitted)

### Community 0 - "Community 0"
Cohesion: 0.06
Nodes (70): BugSubtasks(), BugSubtasksProps, getStyles(), DebugMenu(), QuickActionsModal(), QuickActionsModalProps, styles, ReleaseChecklistViewProps (+62 more)

### Community 1 - "Community 1"
Cohesion: 0.06
Nodes (47): LIFECYCLE_STATUS_OPTIONS, RouteParams, RouteParams, SubprojectOption, approveRequirement(), BaselineSnapshotItem, CreatedDevItem, createDevItemFromRequirement() (+39 more)

### Community 2 - "Community 2"
Cohesion: 0.06
Nodes (29): CustomDrawerContent(), CustomDrawerContentProps, getStyles(), NavigationItem, getStyles(), NavigationMenu(), NavigationMenuProps, Platform (+21 more)

### Community 3 - "Community 3"
Cohesion: 0.08
Nodes (20): DebugMenuProps, styles, apolloClient, authLink, cache, errorLink, httpLink, initializeApollo() (+12 more)

### Community 4 - "Community 4"
Cohesion: 0.10
Nodes (25): FilterHeader(), FilterSearch(), FilterSection(), FilterToggle(), styles, GET_BUGS, GET_PROJECTS, GET_SETTINGS (+17 more)

### Community 5 - "Community 5"
Cohesion: 0.14
Nodes (25): PinLockScreen(), PinLockScreenProps, styles, PinSetupScreen(), PinSetupScreenProps, styles, EditFormData, SettingsScreen() (+17 more)

### Community 6 - "Community 6"
Cohesion: 0.06
Nodes (30): ADMIN_DASHBOARD_QUERY, APPROVE_ATTENDANCE_REQUEST, APPROVE_LEAVE, APPROVE_WFH, CREATE_BUG, CREATE_FEED_TOPIC, CREATE_LEAVE_APPLICATION, CREATE_TASK (+22 more)

### Community 7 - "Community 7"
Cohesion: 0.10
Nodes (18): BugChecklistManagerProps, ChecklistItem, styles, BugFlowProps, styles, styles, RelatedItem, RelatedItemsManagerProps (+10 more)

### Community 8 - "Community 8"
Cohesion: 0.15
Nodes (7): LEAVE_TYPES, WFH_TYPES, Topic, LeaveApplication, LeaveApplication, WFHApplication, getUserData()

### Community 9 - "Community 9"
Cohesion: 0.13
Nodes (12): MultiSelectPicker(), MultiSelectPickerItem, MultiSelectPickerProps, styles, SearchablePicker(), SearchablePickerItem, SearchablePickerProps, styles (+4 more)

### Community 10 - "Community 10"
Cohesion: 0.17
Nodes (22): useTheme(), useResponsive(), AttendanceApprovalsScreen(), AttendanceCalendarScreen(), CreateBugScreen(), CreateFeedPostScreen(), CreateLeaveScreen(), CreateTaskScreen() (+14 more)

### Community 11 - "Community 11"
Cohesion: 0.18
Nodes (9): BugDetailsScreen(), formatTime(), TaskDetailsScreen(), getPriorityColor(), getPriorityTextColor(), getSeverityColor(), getSeverityTextColor(), getStatusColor() (+1 more)

### Community 12 - "Community 12"
Cohesion: 0.12
Nodes (14): AppContent(), ErrorBoundaryProps, ErrorBoundaryState, isVersionLessThan(), MaintenanceScreen(), navDarkTheme, navLightTheme, Stack (+6 more)

### Community 13 - "Community 13"
Cohesion: 0.19
Nodes (9): AttendanceRecord, DAYS_OF_WEEK, AttendanceDashboardScreen(), WFHApplication, WFHDetailsScreen(), Task, formatDateIST(), formatTimeIST() (+1 more)

### Community 14 - "Community 14"
Cohesion: 0.17
Nodes (13): DashboardSkeleton(), materialElevation, TabBarContext, TabBarContextType, TabBarProvider(), useTabBar(), useTabBarControl(), useNetworkStatus() (+5 more)

### Community 15 - "Community 15"
Cohesion: 0.17
Nodes (11): AppHeader(), AppHeaderProps, styles, Project, ProjectFilterContext, ProjectFilterContextType, ProjectFilterProvider(), useProjectFilter() (+3 more)

### Community 16 - "Community 16"
Cohesion: 0.26
Nodes (10): darkColors, DrawerContext, DrawerContextType, DrawerProvider(), lightColors, ThemeContext, ThemeContextType, ThemeProvider() (+2 more)

### Community 17 - "Community 17"
Cohesion: 0.25
Nodes (4): Platform, PLATFORM_LABEL, styles, VERSION_LABEL

### Community 18 - "Community 18"
Cohesion: 0.29
Nodes (6): CREATE_FEED_COMMENT, GET_FEED_POST, TOGGLE_FEED_REACTION, TOGGLE_FEED_SAVE, FeedPostDetailsScreen(), formatDateTimeIST()

### Community 19 - "Community 19"
Cohesion: 0.29
Nodes (4): CREATE_FEED_POST, GET_FEED_POSTS, GET_FEED_TOPICS, INIT_PERSONAL_TOPICS

### Community 20 - "Community 20"
Cohesion: 0.25
Nodes (5): cancelAllNotifications(), PushNotificationData, registerForPushNotifications(), setBadgeCount(), setupNotificationListeners()

### Community 21 - "Community 21"
Cohesion: 0.33
Nodes (6): globalShownNotifications, NotificationBell(), styles, GET_NOTIFICATIONS, GET_UNREAD_COUNT, useToast()

### Community 22 - "Community 22"
Cohesion: 0.33
Nodes (4): MARK_ALL_NOTIFICATIONS_READ, MARK_NOTIFICATION_READ, RootStackParamList, Notification

### Community 23 - "Community 23"
Cohesion: 0.33
Nodes (5): ListItemSkeleton(), ListSkeleton(), SkeletonBlock(), skeletonStyles, StatsCardSkeleton()

### Community 24 - "Community 24"
Cohesion: 0.33
Nodes (5): GET_ATTENDANCE, SIGN_IN, SIGN_OUT, DailyAttendanceCard(), styles

### Community 25 - "Community 25"
Cohesion: 0.33
Nodes (4): styles, ToastContext, ToastContextType, ToastProvider()

### Community 27 - "Community 27"
Cohesion: 0.40
Nodes (3): ActivityLog, styles, UnifiedTimelineProps

### Community 28 - "Community 28"
Cohesion: 0.40
Nodes (3): AttendanceRequest, LeaveRequest, WfhRequest

### Community 29 - "Community 29"
Cohesion: 0.50
Nodes (3): AnimatedTabBar(), styles, TAB_LABELS

## Knowledge Gaps
- **152 isolated node(s):** `Tab`, `Stack`, `ErrorBoundaryProps`, `ErrorBoundaryState`, `navLightTheme` (+147 more)
  These have ≤1 connection - possible missing edges or undocumented components.
- **3 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `useTheme()` connect `Community 10` to `Community 0`, `Community 1`, `Community 2`, `Community 4`, `Community 5`, `Community 7`, `Community 8`, `Community 9`, `Community 11`, `Community 12`, `Community 13`, `Community 14`, `Community 15`, `Community 16`, `Community 18`, `Community 19`, `Community 22`, `Community 23`, `Community 24`, `Community 28`, `Community 29`, `Community 30`?**
  _High betweenness centrality (0.137) - this node is a cross-community bridge._
- **Why does `materialTypography` connect `Community 9` to `Community 0`, `Community 1`, `Community 2`, `Community 4`, `Community 5`, `Community 7`, `Community 8`, `Community 11`, `Community 13`, `Community 14`, `Community 15`, `Community 17`, `Community 19`, `Community 24`, `Community 27`, `Community 28`, `Community 30`?**
  _High betweenness centrality (0.038) - this node is a cross-community bridge._
- **Why does `materialSpacing` connect `Community 7` to `Community 0`, `Community 1`, `Community 2`, `Community 4`, `Community 5`, `Community 8`, `Community 9`, `Community 11`, `Community 13`, `Community 14`, `Community 15`, `Community 17`, `Community 19`, `Community 24`, `Community 27`, `Community 28`, `Community 30`?**
  _High betweenness centrality (0.036) - this node is a cross-community bridge._
- **What connects `Tab`, `Stack`, `ErrorBoundaryProps` to the rest of the system?**
  _152 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `Community 0` be split into smaller, more focused modules?**
  _Cohesion score 0.05553923009109609 - nodes in this community are weakly interconnected._
- **Should `Community 1` be split into smaller, more focused modules?**
  _Cohesion score 0.06262626262626263 - nodes in this community are weakly interconnected._
- **Should `Community 2` be split into smaller, more focused modules?**
  _Cohesion score 0.06219512195121951 - nodes in this community are weakly interconnected._