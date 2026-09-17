import { founderTypeDefs } from './founder-schema'

export const typeDefs = `#graphql
  type User {
    employeeId: ID!
    name: String!
    email: String!
    phone: String
    department: String
    role: String!
    status: String!
    managerEmail: String
    isTodayTask: Boolean
    warningCount: Int
    createdAt: String!
    updatedAt: String!
    leavesTakenYTD: Float
    totalWFHApproved: Int
    tasks: [Task!]!
    bugs: [Bug!]!
    tabPermissions: [String!]
    isFounder: Boolean!
  }

  type Task {
    id: ID!
    taskId: String!
    selectType: String!
    recursiveType: String
    name: String
    description: String!
    assignedTo: [String!]!
    assignedBy: String!
    support: [String!]!
    startDate: String!
    endDate: String!
    priority: String!
    estimatedHours: Float!
    actualHours: Float
    dailyHours: String
    status: String!
    remarks: String
    difficulties: String
    relatedTasks: String
    projectId: String
    subprojectId: String
    parentTaskId: String
    department: String
    timerState: String
    timerStartTime: String
    timerPausedTime: Int
    timerTotalTime: Int
    timerSessions: String
    deletedAt: String
    deletedBy: String
    meetingLink: String
    meetingReminder: Boolean
    startTime: String
    dueTime: String
    createdAt: String!
    updatedAt: String!
    assignedToUser: User
    assignedToUsers: [User!]!
    assignedByUser: User
    supportUsers: [User!]!
    subtasks: [SubTask!]!
    project: Project
  }

  type SubTask {
    id: ID!
    subTaskId: String!
    parentTaskId: String!
    description: String!
    assignedTo: String!
    assignedBy: String
    startDate: String
    endDate: String
    priority: String
    estimatedHours: Float
    actualHours: Float
    status: String
    remarks: String
    deletedAt: String
    deletedBy: String
    createdAt: String
    updatedAt: String
    assignedToUser: User
    assignedByUser: User
    parentTask: Task
  }

  type AdminDashboardData {
    usersOnline: Int!
    usersPresent: Int!
    usersAbsent: Int!
    usersOnLeave: Int!
    usersWFH: Int!
    pendingLeaveRequests: Int!
    pendingWFHRequests: Int!
    liveAttendance: [AttendanceRecord!]!
  }

  type AttendanceRecord {
    userId: ID!
    userName: String!
    userAvatar: String
    department: String
    role: String
    status: String! # Present, WFH, Absent, Leave
    signInTime: String
    signOutTime: String
    location: String
  }

  type Bug {
    id: ID!
    bugId: String!
    title: String
    description: String!
    category: String!
    severity: String!
    priority: String
    status: String!
    assignedTo: String
    assignedBy: String
    reportedBy: String
    reportedDate: String
    resolvedDate: String
    startDate: String
    endDate: String
    estimatedHours: Float
    actualHours: Float
    remarks: String
    attachments: [String!]
    projectId: String
    subprojectId: String
    relatedBugs: String
    platform: String
    device: String
    type: String
    feature: String
    environment: String
    expectedBehavior: String
    actualBehavior: String
    serverLogs: String
    frontendLogs: String
    browserInfo: String
    deviceInfo: String
    developmentPrompt: String
    bugType: String
    criticality: String
    parentDevId: String
    timerState: String
    timerStartTime: String
    timerPausedTime: Int
    timerTotalTime: Int
    timerSessions: String
    deletedAt: String
    deletedBy: String
    createdAt: String!
    updatedAt: String!
    assignedToUser: User
    assignedByUser: User
    reportedByUser: User
    subtasks: [BugSubTask!]!
    project: Project
  }

  type BugSubTask {
    id: ID!
    subTaskId: String!
    parentBugId: String!
    description: String!
    assignedTo: String
    assignedBy: String
    startDate: String
    endDate: String
    priority: String
    estimatedHours: Float
    actualHours: Float
    status: String!
    remarks: String
    isCompleted: Boolean
    displayOrder: Int
    deletedAt: String
    deletedBy: String
    createdAt: String!
    updatedAt: String!
    createdBy: String
    assignedToUser: User
    assignedByUser: User
    parentBug: Bug
  }

  type Project {
    id: ID!
    projectId: String!
    projectName: String!
    description: String
    parentProjectId: String
    deletedAt: String
    deletedBy: String
    createdAt: String!
    updatedAt: String!
    tasks: [Task!]!
    assignedUsers: [ProjectUser!]!
  }

  type ProjectUser {
    projectId: String!
    employeeId: String!
    assignedBy: String!
    assignedAt: String!
    user: User
  }

  type Setting {
    id: ID!
    key: String!
    value: String
    type: String
    isActive: Boolean!
    createdAt: String!
    updatedAt: String!
  }

  # Attendance Types
  type Attendance {
    id: ID!
    employeeId: String!
    signInTime: String!
    signOutTime: String
    signInLocation: String
    signOutLocation: String
    workHours: Float
    date: String!
    status: String
    isManualEntry: Boolean
    approvalStatus: String
    signOutUndoneAt: String
    signOutUndoneBy: String
    createdAt: String!
    updatedAt: String!
    user: User
  }

  type AttendanceRequest {
    id: ID!
    userId: String!
    attendanceDate: String!
    requestType: String!
    originalTime: String
    newTime: String!
    reason: String
    status: String!
    reviewedBy: String
    reviewedAt: String
    createdAt: String!
    updatedAt: String!
    user: User
    reviewer: User
  }

  type HomeDashboardData {
    userWorkHours: String
    membersOnLeave: [UserLeaveStatus!]!
    membersOnWFH: [UserWFHStatus!]!
    attendance: Attendance
  }

  type UserLeaveStatus {
    user: User!
    leaveType: String!
    startDate: String!
    endDate: String!
    isHalfDay: Boolean
  }

  type UserWFHStatus {
    user: User!
    date: String!
    contactNumber: String
  }

  type AttendanceCalendarRecord {
    employeeId: String!
    date: String!
    status: String
    signInTime: String
    signOutTime: String
    workHours: Float
    location: String
    leaveType: String
    wfhType: String
    hasCorrection: Boolean!
  }

  type AttendanceCalendarEmployee {
    employeeId: String!
    name: String!
    department: String!
    role: String!
  }

  type AttendanceCalendarPagination {
    total: Int!
    page: Int!
    limit: Int!
    hasMore: Boolean!
  }

  type AttendanceCalendarData {
    employees: [AttendanceCalendarEmployee!]!
    records: [AttendanceCalendarRecord!]!
    pagination: AttendanceCalendarPagination!
  }

  # Feed System Types
  type FeedPost {
    postId: ID!
    contentType: String!
    content: String
    linkUrl: String
    linkTitle: String
    linkDescription: String
    linkImage: String
    mediaUrls: [String!]
    createdBy: String!
    createdAt: String
    updatedAt: String
    status: String!
    author: User!
    topics: [FeedTopic!]!
    reactions: [FeedReaction!]!
    comments: [FeedComment!]!
    viewCount: Int!
    commentCount: Int!
    isSaved: Boolean!
    hasUserReacted: Boolean!
  }

  type FeedTopic {
    id: ID!
    topicName: String!
    description: String
    icon: String
    displayOrder: Int!
    isPersonal: Boolean!
    isSaved: Boolean!
    ownerUserId: String
    createdBy: String!
    createdAt: String!
    postCount: Int!
  }

  type FeedComment {
    commentId: ID!
    postId: String!
    parentCommentId: String
    content: String
    createdBy: String!
    createdAt: String
    updatedAt: String
    author: User!
    replies: [FeedComment!]!
  }

  type FeedReaction {
    emoji: String!
    users: [User!]!
    count: Int!
    hasUserReacted: Boolean!
  }

  type FeedMention {
    mentionId: ID!
    postId: String
    commentId: String
    mentionedUserId: String!
    mentionedByUserId: String!
    mentionText: String!
    contextText: String
    isRead: Boolean!
    createdAt: String!
    mentionedUser: User!
    mentionedByUser: User!
    post: FeedPost
    comment: FeedComment
  }

  type FeedNotification {
    notificationId: ID!
    userId: String!
    actorId: String!
    notificationType: String!
    postId: String
    commentId: String
    mentionId: String
    taskId: String
    bugId: String
    title: String!
    message: String
    linkUrl: String
    metadata: String
    isRead: Boolean!
    readAt: String
    createdAt: String!
    user: User
    actor: User
    post: FeedPost
    comment: FeedComment
    mention: FeedMention
  }

  type FeedPostsResponse {
    posts: [FeedPost!]!
    total: Int!
    hasMore: Boolean!
  }

  type FeedReactionResponse {
    action: String!
    message: String!
  }

  type FeedSaveResponse {
    action: String!
    message: String!
  }

  type InitPersonalTopicsResponse {
    personalNotes: FeedTopic
    savedPosts: FeedTopic
  }

  type Query {
    # Current User
    me: User
    
    # Users
    users: [User!]!
    user(employeeId: ID!): User
    
    # Tasks
    tasks(
      assignedTo: [String!]
      assignedBy: [String!]
      status: [String!]
      priority: [String!]
      projectId: String
      projectIds: [String!]
      subprojectId: String
      limit: Int
      offset: Int
    ): [Task!]!
    task(taskId: ID!): Task

    # Subtasks
    subtasks(parentTaskId: ID!): [SubTask!]!

    # Bugs
    bugs(
      assignedTo: [String!]
      reportedBy: [String!]
      status: [String!]
      severity: [String!]
      category: [String!]
      type: [String!]
      projectId: String
      projectIds: [String!]
      subprojectId: String
      limit: Int
      offset: Int
    ): [Bug!]!
    bug(bugId: ID!): Bug
    
    # Bug Subtasks
    bugSubtasks(parentBugId: ID!): [BugSubTask!]!
    
    # Projects
    projects: [Project!]!
    project(projectId: ID!): Project
    projectUsers(projectId: ID!): [ProjectUser!]!
    
    # Dashboard
    dashboard(employeeId: String!, role: String!): DashboardData!
    adminDashboardData: AdminDashboardData!
    pendingAttendanceRequests: [AttendanceRequest!]!
    attendanceCalendar(
      startDate: String!
      endDate: String!
      department: String
      teamMembers: [String!]
      search: String
      page: Int
      limit: Int
    ): AttendanceCalendarData!
    
    # Settings
    settings(activeOnly: Boolean): [Setting!]!
    setting(key: String!): Setting

    # Feed
    feedPosts(topicId: String, status: String, search: String, limit: Int, offset: Int): FeedPostsResponse!
    feedPost(postId: ID!): FeedPost
    feedTopics(includePersonal: Boolean): [FeedTopic!]!
    feedTopic(id: ID!): FeedTopic
    feedComments(postId: ID!): [FeedComment!]!
    feedReactions(postId: ID!): [FeedReaction!]!

    # Mentions
    feedMentions(userId: String, isRead: Boolean, limit: Int, offset: Int): [FeedMention!]!
    feedMention(mentionId: ID!): FeedMention

    # Notifications
    feedNotifications(userId: String, isRead: Boolean, notificationType: String, limit: Int, offset: Int): [FeedNotification!]!
    feedNotification(notificationId: ID!): FeedNotification
    unreadNotificationCount(userId: String!): Int!

    # Attendance
    attendance(date: String!): Attendance
    monthlyAttendance(month: Int!, year: Int!, userId: String): [Attendance!]!
    homeDashboardData(date: String!): HomeDashboardData!
  }

  type DashboardData {
    tasks: [Task!]!
    bugs: [Bug!]!
    users: [User!]!
    settings: [Setting!]!
  }

  type LoginResponse {
    token: String!
    user: User!
  }

  type Mutation {
    # Authentication
    login(employeeId: String!, password: String!): LoginResponse!

    # Tasks
    createTask(input: CreateTaskInput!): Task!
    updateTask(taskId: ID!, input: UpdateTaskInput!): Task!
    deleteTask(taskId: ID!): Boolean!

    # Bugs
    createBug(input: CreateBugInput!): Bug!
    updateBug(bugId: ID!, input: UpdateBugInput!): Bug!
    deleteBug(bugId: ID!): Boolean!

    # Users
    createUser(input: CreateUserInput!): User!
    updateUser(employeeId: ID!, input: UpdateUserInput!): User!

    # Project Users
    assignUserToProject(projectId: ID!, employeeId: String!, assignedBy: String!): Boolean!
    removeUserFromProject(projectId: ID!, employeeId: String!): Boolean!

    # Feed
    createFeedPost(input: CreateFeedPostInput!): FeedPost!
    updateFeedPost(postId: ID!, input: UpdateFeedPostInput!): FeedPost!
    deleteFeedPost(postId: ID!): Boolean!
    createFeedComment(postId: ID!, content: String!, parentCommentId: String): FeedComment!
    deleteFeedComment(commentId: ID!): Boolean!
    toggleFeedReaction(postId: ID!, emoji: String!): FeedReactionResponse!
    trackFeedView(postId: ID!): Boolean!
    toggleFeedSave(postId: ID!): FeedSaveResponse!
    createFeedTopic(input: CreateFeedTopicInput!): FeedTopic!
    initPersonalTopics: InitPersonalTopicsResponse!

    # Mentions
    markMentionAsRead(mentionId: ID!): FeedMention!
    markAllMentionsAsRead(userId: String!): Boolean!

    # Notifications
    markNotificationAsRead(notificationId: ID!): FeedNotification!
    markAllNotificationsAsRead(userId: String!): Boolean!
    deleteNotification(notificationId: ID!): Boolean!

    # Push Notifications
    registerPushToken(userId: String!, pushToken: String!, deviceType: String!, deviceId: String): Boolean!
    unregisterPushToken(userId: String!, pushToken: String!): Boolean!

    # Attendance
    requestAttendanceEdit(input: AttendanceRequestInput!): AttendanceRequest
    approveAttendanceRequest(requestId: ID!): AttendanceRequest
    rejectAttendanceRequest(requestId: ID!): AttendanceRequest
    signIn: Attendance!
    signOut: Attendance!
    undoSignOut(date: String!): Attendance!
    requestManualAttendance(input: ManualAttendanceInput!): Attendance!
  }

  input AttendanceRequestInput {
    attendanceDate: String!
    requestType: String! # SIGN_IN_EDIT, SIGN_OUT_EDIT, MISSING_ENTRY
    originalTime: String
    newTime: String!
    reason: String
  }

  input CreateTaskInput {
    description: String!
    assignedTo: String!
    assignedBy: String!
    support: [String!]
    startDate: String!
    endDate: String!
    priority: String!
    estimatedHours: Float!
    selectType: String!
    recursiveType: String
    projectId: String
    meetingLink: String
    meetingReminder: Boolean
    startTime: String
    dueTime: String
  }

  input UpdateTaskInput {
    description: String
    assignedTo: String
    support: [String!]
    startDate: String
    endDate: String
    priority: String
    estimatedHours: Float
    actualHours: Float
    status: String
    remarks: String
    difficulties: String
    meetingLink: String
    meetingReminder: Boolean
    startTime: String
    dueTime: String
  }

  input CreateBugInput {
    description: String!
    category: String!
    severity: String!
    assignedTo: String!
    assignedBy: String!
    reportedBy: String!
    reportedDate: String!
    estimatedHours: Float
  }

  input UpdateBugInput {
    description: String
    category: String
    severity: String
    priority: String
    status: String
    assignedTo: String
    estimatedHours: Float
    actualHours: Float
    remarks: String
    resolvedDate: String
    startDate: String
    endDate: String
  }

  input CreateUserInput {
    employeeId: String!
    name: String!
    email: String!
    phone: String
    department: String
    role: String!
    password: String!
    tabPermissions: [String!]
  }

  input UpdateUserInput {
    name: String
    email: String
    phone: String
    department: String
    role: String
    status: String
    isTodayTask: Boolean
    tabPermissions: [String!]
  }

  # Feed Input Types
  input CreateFeedPostInput {
    contentType: String!
    content: String!
    linkUrl: String
    linkTitle: String
    linkDescription: String
    linkImage: String
    mediaUrls: [String!]
    topicIds: [String!]!
  }

  input UpdateFeedPostInput {
    content: String
    linkUrl: String
    linkTitle: String
    linkDescription: String
    linkImage: String
    mediaUrls: [String!]
    topicIds: [String!]
    status: String
  }

  input CreateFeedTopicInput {
    topicName: String!
    description: String
    icon: String
    displayOrder: Int
  }

  input ManualAttendanceInput {
    date: String!
    signInTime: String!
    signOutTime: String!
    reason: String
  }

  # ── Requirements module (Phase 1) ──────────────────────────────────────────
  type Requirement {
    id: ID!
    requirementId: String!
    projectId: String!
    subprojectId: String
    title: String!
    status: String!
    createdBy: String!
    reviewerId: String
    currentApprovalId: Int
    createdAt: String!
    updatedAt: String!
    sections: [RequirementSection!]!
    approvals: [RequirementApproval!]!
    devLinks: [RequirementDevLink!]!
    createdByUser: User
    reviewerUser: User
  }

  type RequirementDevLink {
    id: ID!
    requirementId: String!
    devId: String!
    relationshipType: String!
    devStatus: String
    devTitle: String
    createdAt: String!
  }

  input CreateDevItemFromRequirementInput {
    assignedTo: String
  }

  type RequirementApproval {
    id: ID!
    requirementId: String!
    approverId: String!
    approverName: String!
    decision: String!
    note: String
    approvedContentHash: String!
    isCurrent: Boolean!
    createdAt: String!
  }

  type RequirementSection {
    id: ID!
    requirementId: String!
    heading: String!
    label: String!
    contentHtml: String!
    displayOrder: Int!
    lockVersion: Int!
    updatedAt: String!
    revisionCount: Int!
  }

  type RequirementSectionRevision {
    id: ID!
    sectionId: Int!
    editorId: String!
    editorName: String!
    heading: String!
    label: String!
    contentHtml: String!
    contentHash: String!
    createdAt: String!
  }

  type RequirementBaseline {
    id: ID!
    projectId: String!
    versionLabel: String!
    releaseNote: String
    docContentHash: String!
    frozenBy: String!
    frozenByName: String!
    createdAt: String!
    snapshotJson: String!
  }

  input CreateRequirementInput {
    projectId: String!
    subprojectId: String
    title: String!
    reviewerId: String
  }

  input UpdateRequirementInput {
    title: String
    reviewerId: String
  }

  input CreateRequirementSectionInput {
    requirementId: String!
    heading: String!
    label: String!
    contentHtml: String!
  }

  input UpdateRequirementSectionInput {
    heading: String!
    label: String!
    contentHtml: String!
    lockVersion: Int!
  }

  extend type Query {
    requirements(projectId: String!, includeSubprojects: Boolean, status: String, search: String): [Requirement!]!
    requirement(requirementId: ID!): Requirement
    requirementSectionRevisions(sectionId: ID!): [RequirementSectionRevision!]!
    requirementBaselines(projectId: String!): [RequirementBaseline!]!
    requirementBaseline(id: ID!): RequirementBaseline
    requirementEditAccess(projectId: String!): Boolean!
  }

  extend type Mutation {
    createRequirement(input: CreateRequirementInput!): Requirement!
    updateRequirement(requirementId: ID!, input: UpdateRequirementInput!): Requirement!
    deleteRequirement(requirementId: ID!): Boolean!
    createRequirementSection(input: CreateRequirementSectionInput!): RequirementSection!
    updateRequirementSection(sectionId: ID!, input: UpdateRequirementSectionInput!): RequirementSection!
    deleteRequirementSection(sectionId: ID!): Boolean!
    reorderRequirementSections(requirementId: ID!, sectionIds: [ID!]!): Boolean!
    restoreRequirementSectionRevision(sectionId: ID!, revisionId: ID!): RequirementSection!
    splitRequirementIntoSections(requirementId: ID!): Requirement!
    submitRequirementForReview(requirementId: ID!): Requirement!
    approveRequirement(requirementId: ID!, note: String): Requirement!
    rejectRequirement(requirementId: ID!, note: String!): Requirement!
    updateRequirementStatus(requirementId: ID!, status: String!): Requirement!
    createRequirementBaseline(projectId: String!, versionLabel: String, releaseNote: String): RequirementBaseline!
    rollbackRequirementToVersion(requirementId: ID!, baselineId: ID!): Requirement!
    createDevItemFromRequirement(requirementId: ID!, input: CreateDevItemFromRequirementInput): Bug!
  }

${founderTypeDefs}
`

