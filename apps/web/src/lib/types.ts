/**
 * TypeScript Type Definitions for JSR Task Management System
 *
 * This file contains all the TypeScript interfaces and types used throughout the application.
 * These types ensure type safety and provide excellent IDE autocomplete support.
 *
 * Key Benefits of TypeScript Types:
 * - Catch errors at compile time instead of runtime
 * - Better IDE autocomplete and IntelliSense
 * - Self-documenting code (types serve as documentation)
 * - Safer refactoring (TypeScript will warn about breaking changes)
 * - Better team collaboration (clear contracts between modules)
 */

// ============================================================================
// USER AND AUTHENTICATION TYPES
// ============================================================================

/**
 * User Interface
 *
 * Represents a user/employee in the system.
 * Users can be employees, managers, top management, or admins.
 *
 * Role Hierarchy:
 * - employee: Regular employee (can manage own tasks)
 * - management: Manager (can manage team tasks)
 * - top_management: Senior management (can view all reports)
 * - admin: System administrator (full access)
 */
export interface User {
  employeeId: string        // Unique employee ID (e.g., "AM-0001")
  name: string              // Full name of the employee
  email: string             // Email address (used for login and notifications)
  phone: string             // Phone number
  telegramToken?: string    // Optional: Telegram bot token for notifications
  department: string        // Department name (e.g., "Engineering", "Sales")
  managerEmail?: string     // Optional: Manager's email address
  managerId?: string        // Optional: Manager's employee ID
  isTodayTask: boolean      // Whether user has tasks for today
  warningCount: number      // Number of warnings received (for performance tracking)
  // Role vocabulary was inconsistent in three places: the database CHECK
  // constraint allows ('employee','management','top_management','admin'), but
  // this type and DEFAULT_ROLE_PERMISSIONS were keyed on 'amtarikshian', which
  // the database never stores. 'employee' is the real value; 'amtarikshian' is
  // kept in the union only so existing rows and older code still type-check.
  role: 'employee' | 'amtarikshian' | 'management' | 'top_management' | 'admin'
  password: string          // Hashed password (never store plain text!)
  status: 'active' | 'inactive'  // Account status
  isSystemAdmin?: number    // Optional: 1 if user is system admin (cannot be deleted/deactivated), 0 or undefined otherwise
  isPlatformAdmin?: boolean // Migration 062: may manage companies; replaces the hardcoded 'AM-0001' checks
  companyId?: string        // Company this session is acting in
  hoursLog?: string         // Optional: Hours worked log (format: 'DD/MM/YYYY - X Hours worked today')
  idCardPhoto?: string      // Optional: AWS S3 URL for employee ID card photo
  createdAt: string         // Timestamp when user was created
  updatedAt: string         // Timestamp when user was last updated
  tabPermissions?: string[] // Optional: Custom tab permissions overriding role defaults
}

// ============================================================================
// TASK TYPES
// ============================================================================

/**
 * Task Interface
 *
 * Represents a task in the system.
 * Tasks can be normal (one-time) or recursive (repeating).
 *
 * Task Priority System (Eisenhower Matrix):
 * - U&I: Urgent & Important (do first)
 * - NU&I: Not Urgent & Important (schedule)
 * - U&NI: Urgent & Not Important (delegate)
 * - NU&NI: Not Urgent & Not Important (eliminate)
 *
 * Task Status Flow:
 * Yet to Start → In Progress → Done
 *             ↓
 *          Delayed → In Progress → Done
 *             ↓
 *          Hold → In Progress → Done
 *             ↓
 *          Cancel (terminal state)
 */
export interface Task {
  id: string                // Internal database ID (auto-increment)
  taskId: string            // Unique task ID (e.g., "JSR-0016")
  selectType: 'Normal' | 'Recursive'  // Normal = one-time, Recursive = repeating
  recursiveType?: 'Daily' | 'Weekly' | 'Monthly' | 'Annually'  // Only for recursive tasks
  name: string              // Task name/title (short, for list display) - VARCHAR(150)
  description: string       // Task description/details (full details)
  assignedTo: string[]      // Array of employee IDs who are assigned to this task (multiple assignees supported)
  assignedBy: string        // Employee ID of task creator (who assigned the task)
  support: string[]         // Array of employee IDs who can help with this task
  startDate: string         // Task start date (ISO format: YYYY-MM-DD)
  endDate: string           // Task end date (ISO format: YYYY-MM-DD)
  priority: 'U&I' | 'NU&I' | 'U&NI' | 'NU&NI'  // Priority based on Eisenhower Matrix
  estimatedHours: number    // Estimated time to complete (in hours)
  actualHours?: number      // Optional: Actual time spent (in hours)
  dailyHours?: string       // Optional: JSON string of daily hours (e.g., '{"2025-06-27": 3.5}')
  status: 'Yet to Start' | 'In Progress' | 'Delayed' | 'Done' | 'Cancel' | 'Hold' | 'ReOpened' | 'Stop'
  remarks?: string          // Optional: Additional notes/comments
  difficulties?: string     // Optional: Challenges faced during task execution
  relatedTasks?: string | null // Optional: Comma-separated task IDs for multi-user assignments
  companyId?: string        // Owning company (migration 063); used for tenant checks
  projectId?: string | null // Optional: Project ID this task belongs to (e.g., "PRJ-001")
  subprojectId?: string | null // Optional: Subproject ID this task belongs to (e.g., "PRJ-001-SUB-001")
  parentTaskId?: string | null // Optional: Parent task ID for subtasks (e.g., "JSR-0001")
  department?: string | null // Optional: Department this task belongs to (e.g., "Marketing", "Development")
  timerState?: string | null // Optional: Timer state (stopped, running, paused)
  timerStartTime?: string | null // Optional: Timer start timestamp
  timerPausedTime?: number | null // Optional: Total paused time in milliseconds
  timerTotalTime?: number | null // Optional: Total time tracked in milliseconds
  timerSessions?: string | null // Optional: JSON string of timer sessions
  deletedAt?: string | null // Optional: Soft delete timestamp
  deletedBy?: string | null // Optional: Employee ID who deleted the task
  startTime?: string | null  // Optional: Task start time (format: HH:mm:ss)
  dueTime?: string | null    // Optional: Task due time (format: HH:mm:ss)
  meetingLink?: string | null
  meetingReminder?: boolean
  createdAt: string         // Timestamp when task was created
  updatedAt: string         // Timestamp when task was last updated
  assignedByUser?: {        // Optional: User object for the assigner (from GraphQL)
    employeeId: string
    name: string
    email: string
    role: string
  }
  assignedToUser?: {        // Optional: User object for the assignee (from GraphQL)
    employeeId: string
    name: string
    email: string
    role: string
  }
}

/**
 * SubTask Interface
 *
 * Represents a subtask within a parent task.
 * Subtasks are smaller, actionable items that make up a larger task.
 * Each subtask can be assigned to different users and tracked independently.
 *
 * Features:
 * - Checkbox-based completion tracking
 * - Individual assignment (can differ from parent task)
 * - Drag-and-drop reordering via display_order
 * - Soft delete support
 * - Independent status tracking
 */
export interface SubTask {
  id: number                // Database ID (auto-increment)
  parentTaskId: string      // Parent task ID (e.g., "JSR-001")
  description: string       // Subtask description
  assignedTo: string        // Employee ID of subtask owner
  status: 'Not Started' | 'In Progress' | 'Completed'  // Subtask status
  isCompleted: boolean      // Checkbox state (true = checked)
  displayOrder: number      // Order for display (0, 1, 2, ...) - allows drag-and-drop
  createdAt: string         // Timestamp when subtask was created
  updatedAt: string         // Timestamp when subtask was last updated
  createdBy: string         // Employee ID who created the subtask
  deletedAt?: string | null // Optional: Soft delete timestamp
  deletedBy?: string | null // Optional: Employee ID who deleted the subtask
}

// Alias for backward compatibility with renamed components
export type Checklist = SubTask



// Leave Application Types
export interface LeaveApplication {
  id: string
  employeeId: string
  employeeName: string
  leaveType: 'Sick Leave' | 'Casual Leave' | 'Annual Leave' | 'Emergency Leave' | 'Maternity Leave' | 'Paternity Leave'
  reason: string
  fromDate: string
  toDate: string
  isHalfDay: boolean
  emergencyContact?: string
  status: 'Pending' | 'Approved' | 'Rejected'
  managerId?: string // Manager who needs to approve this
  approvedBy?: string
  approvalDate?: string
  approvalRemarks?: string
  createdAt: string
  updatedAt: string
}

// Work From Home Application Types
export interface WFHApplication {
  id: string
  employeeId: string
  employeeName: string
  wfhType: 'Full Day' | 'Half Day' | 'Flexible Hours'
  reason: string
  fromDate: string
  toDate: string
  workLocation: string
  availableFrom?: string
  availableTo?: string
  contactNumber: string
  status: 'Pending' | 'Approved' | 'Rejected'
  managerId?: string // Manager who needs to approve this
  approvedBy?: string
  approvalDate?: string
  approvalRemarks?: string
  createdAt: string
  updatedAt: string
}

// Report Types
export interface DailyReport {
  date: string
  employeeId: string
  employeeName: string
  totalTasks: number
  tasksInProgress: number
  tasksDelayed: number
  tasksCompleted: number
  hoursWorked: number
  tasksCompletedMTD: number
  hoursMTD: number
}

export interface MonthlyReport {
  month: string
  year: number
  employeeId: string
  employeeName: string
  totalLeaves: number
  totalWFH: number
  totalHoursWorked: number
  warningCount: number
}

export interface TeamTaskReport {
  date: string
  managerId: string
  teamTasks: {
    employeeId: string
    employeeName: string
    tasks: Task[]
  }[]
}

// ============================================================================
// BUG TRACKING TYPES
// ============================================================================

/**
 * Bug Interface
 *
 * Represents a bug/issue in the bug tracking system.
 *
 * Severity Levels:
 * - Critical: System crash, data loss, security breach (fix immediately)
 * - Major: Major functionality broken, workaround exists (fix soon)
 * - Minor: Minor issue, cosmetic problem (fix when possible)
 *
 * Priority Levels:
 * - High: Fix in current sprint
 * - Medium: Fix in next sprint
 * - Low: Fix when time permits
 *
 * Status Flow:
 * New → In Progress → Resolved → Closed
 *    ↓
 * Reopened → In Progress → Resolved → Closed
 */
// ============================================================================
// RELEASE WORK-ITEM TYPES
// ============================================================================

/**
 * A single checklist item (a test case or release step).
 * `label` is an optional short tag (e.g. "TC-01", "Step 1"); `text` is the body.
 */
export interface ReleaseChecklistItem {
  id: string
  label?: string
  text: string
}

/**
 * A checklist section scoped to a platform.
 * platform 'common' shows on every platform's checklist; 'android'/'ios' are
 * platform-specific. The sub-project's template is a list of these sections.
 */
export interface ReleaseChecklistSection {
  id: string
  title: string
  platform: 'common' | 'android' | 'ios'
  items: ReleaseChecklistItem[]
}

/** The default release checklist template stored on a (sub)project. */
export interface ReleaseChecklistTemplate {
  sections: ReleaseChecklistSection[]
}

/**
 * Per-platform snapshot stored on a release bug. The template sections are
 * snapshotted at creation; `manual` items are added on the task itself;
 * `completed` maps item id -> done.
 */
export interface ReleasePlatformChecklist {
  template: ReleaseChecklistSection[]
  manual: ReleaseChecklistItem[]
  completed: Record<string, boolean>
}

/**
 * Full release state persisted in bugs.release_state (JSONB).
 */
export interface ReleaseState {
  platforms: ('android' | 'ios')[]
  checklists: {
    android?: ReleasePlatformChecklist
    ios?: ReleasePlatformChecklist
  }
  versions: {
    android?: string | null
    ios?: string | null
  }
}

export interface Bug {
  bugId: string             // Unique bug ID (e.g., "BUG-1735123456789001234")
  title: string             // Bug title/summary
  description: string       // Detailed bug description
  severity: 'Critical' | 'Major' | 'Minor'  // How serious is the bug?
  priority: 'High' | 'Medium' | 'Low'       // How urgent is the fix?
  status: 'New' | 'In Progress' | 'Resolved' | 'Closed' | 'Reopened'  // Current bug status
  category: 'UI' | 'API' | 'Backend' | 'Performance' | 'Security' | 'Database' | 'Integration' | 'Other'
  platform: 'iOS' | 'Android' | 'Web' | 'All'  // Which platform is affected?
  assignedTo?: string       // Optional: Employee ID of person fixing the bug
  assignedBy?: string       // Optional: Employee ID of person who assigned the bug
  reportedBy: string        // Required: Employee ID of person who reported the bug
  environment: 'Development' | 'Staging' | 'Production'  // Where was the bug found?
  browserInfo?: string      // Optional: Browser details (e.g., "Chrome 120.0.0")
  deviceInfo?: string       // Optional: Device details (e.g., "iPhone 15 Pro, iOS 17.2")
  expectedBehavior?: string // Optional: What should happen
  actualBehavior?: string   // Optional: What actually happens
  serverLogs?: string       // Optional: Server-side logs and errors
  frontendLogs?: string     // Optional: Frontend console logs and errors
  attachments?: string      // Optional: URL or file path to screenshots/videos
  estimatedHours?: number   // Optional: Estimated time to fix (in hours)
  actualHours?: number      // Optional: Actual time spent fixing (in hours)
  startDate?: string        // Optional: When work on bug should start
  endDate?: string          // Optional: When work on bug should end
  resolvedDate?: string     // Optional: When bug was resolved
  closedDate?: string       // Optional: When bug was closed
  reopenedCount: number     // Number of times bug was reopened (default: 0)
  tags?: string             // Optional: Comma-separated tags (e.g., "login,authentication")
  relatedBugs?: string      // Optional: Comma-separated related bug IDs
  companyId?: string        // Owning company (migration 063); used for tenant checks
  projectId?: string | null // Optional: Project ID this bug belongs to (e.g., "PRJ-001")
  subprojectId?: string | null // Optional: Subproject ID this bug belongs to
  parentDevId?: string | null // Optional: Parent bug ID for subtasks (e.g., "BUG-0001")
  feature?: string | null   // Optional: Feature name this bug is related to
  type?: 'feature' | 'bug' | 'other' | 'release' | null  // Optional: Bug type categorization
  releaseState?: ReleaseState | null // Optional: Release checklist state (type='release' only)
  developmentPrompt?: string | null // Optional: Development prompt or instructions for fixing the bug
  timerState?: string | null // Optional: Timer state (stopped, running, paused)
  timerStartTime?: string | null // Optional: Timer start timestamp
  timerPausedTime?: number | null // Optional: Total paused time in milliseconds
  timerTotalTime?: number | null // Optional: Total time tracked in milliseconds
  timerSessions?: string | null // Optional: JSON string of timer sessions
  deletedAt?: string | null // Optional: Soft delete timestamp
  deletedBy?: string | null // Optional: Employee ID who deleted the bug
  createdAt: string         // Timestamp when bug was created
  updatedAt: string         // Timestamp when bug was last updated
  assignedByUser?: {        // Optional: User object for the assigner (from GraphQL)
    employeeId: string
    name: string
    email: string
    role: string
  }
  assignedToUser?: {        // Optional: User object for the assignee (from GraphQL)
    employeeId: string
    name: string
    email: string
    role: string
  }
  reportedByUser?: {        // Optional: User object for the reporter (from GraphQL)
    employeeId: string
    name: string
    email: string
    role: string
  }
}

export interface BugComment {
  bugId: string
  commentedBy: string // Employee ID
  commentText: string
  timestamp: string
}

// Bug form data interface
export interface BugFormData {
  title: string
  description: string
  severity: Bug['severity']
  priority: Bug['priority']
  category: Bug['category']
  platform: Bug['platform']
  assignedTo?: string
  environment: Bug['environment']
  browserInfo?: string
  deviceInfo?: string
  expectedBehavior?: string
  actualBehavior?: string
  serverLogs?: string
  frontendLogs?: string
  attachments?: string
  estimatedHours?: number
  tags?: string
  relatedBugs?: string
  projectId?: string | null
  subprojectId?: string | null
  feature?: string | null
  type?: 'feature' | 'bug' | 'other' | 'release' | null
  parentDevId?: string | null
  developmentPrompt?: string | null
  startDate?: string        // Optional: Start date (required for release type)
  releaseState?: ReleaseState | null // Optional: Release checklist state (type='release' only)
}

// ============================================================================
// PROJECT MANAGEMENT TYPES
// ============================================================================

/**
 * Project Interface
 *
 * Represents a project or sub-project in the system.
 * Projects can have a 2-level hierarchy: Main Project → Sub-Project
 *
 * Project Status:
 * - Active: Currently active project
 * - Inactive: Temporarily inactive project
 * - Deleted: Soft-deleted project (visible only to admin)
 *
 * Hierarchy Rules:
 * - Main projects have parent_project_id = NULL
 * - Sub-projects have parent_project_id = parent's project_id
 * - Sub-projects CANNOT have sub-projects (2-level max)
 */
export interface Project {
  projectId: string         // Unique project ID (e.g., "PRJ-001", "PRJ-002")
  projectName: string       // Project name (displayed in UI, e.g., "JSR Task Management System")
  companyId?: string        // Owning company (migration 062); sub-projects inherit it
  parentProjectId?: string | null  // Parent project ID for sub-projects (NULL for main projects)
  description?: string | null      // Project description
  status: 'Active' | 'Inactive' | 'Deleted'  // Project status
  createdBy: string         // Employee ID of creator
  createdAt: string         // Timestamp when project was created
  updatedAt: string         // Timestamp when project was last updated
  deletedAt?: string | null // Timestamp when project was soft-deleted
  deletedBy?: string | null // Employee ID of who deleted the project
  releaseEnabled?: boolean  // Sub-project only: enables the 'release' work-item type
  releaseChecklist?: ReleaseChecklistTemplate | null // Sub-project only: default release checklist template
}

/**
 * ProjectUser Interface
 *
 * Represents a user-project assignment in the project_users junction table.
 * Used for project access control — only assigned users (plus admin/top_management)
 * can see a project.
 */
/** Authority INSIDE one project. Distinct from users.role, which is global. */
export type ProjectRole = 'manager' | 'team_leader' | 'member'

export interface ProjectUser {
  projectId: string
  employeeId: string
  assignedBy: string
  assignedAt: string
  canEditRequirements: boolean
  /**
   * Role within this project (migration 062). This is the tier that decides who
   * may edit the project, change its members and read or write its secrets — the
   * global users.role cannot express "manages one project, member of another".
   */
  role: ProjectRole
}

export interface ProjectUserWithUser extends ProjectUser {
  userName: string
  userEmail: string
  userRole: string
  userDepartment: string
  userStatus: string
}

// ============================================================================
// UNIFIED WORK ITEMS (for Dashboard)
// ============================================================================

/**
 * WorkItem Interface
 *
 * Unified interface for displaying both tasks and bugs in the dashboard.
 * This allows the dashboard to show a mixed list of work items with
 * consistent structure and easy filtering.
 */
export interface WorkItem {
  id: string                // bugId or taskId
  type: 'task' | 'bug'      // Type of work item
  title: string             // description for tasks, title for bugs
  status: string            // Task status or Bug status
  priority: string          // Task priority or Bug priority
  assignedTo: string | string[]  // Employee ID(s) of assignee(s) - supports multiple assignees
  dueDate: string           // endDate for tasks, createdAt for bugs
  projectId?: string | null // Project ID if assigned
  projectName?: string | null  // Project name for display
  severity?: string         // Only for bugs
  createdAt: string         // Creation timestamp
}
