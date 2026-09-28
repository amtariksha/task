/**
 * GraphQL Queries and Mutations for Mobile App
 * 
 * Centralized location for all GraphQL operations.
 * Organized by feature: Auth, Tasks, Bugs, Feed, Notifications, etc.
 */

import { gql } from '@apollo/client'

// ============================================================================
// AUTHENTICATION
// ============================================================================

export const LOGIN_MUTATION = gql`
  mutation Login($employeeId: String!, $password: String!) {
    login(employeeId: $employeeId, password: $password) {
      token
      user {
        employeeId
        name
        email
        phone
        department
        role
        status
        isTodayTask
        warningCount
        tabPermissions
      }
    }
  }
`

// ============================================================================
// TASKS
// ============================================================================

export const GET_TASKS = gql`
  query GetTasks($assignedTo: [String], $status: [String], $priority: [String], $projectId: String, $subprojectId: String, $limit: Int, $offset: Int) {
    tasks(assignedTo: $assignedTo, status: $status, priority: $priority, projectId: $projectId, subprojectId: $subprojectId, limit: $limit, offset: $offset) {
      id
      taskId
      name
      description
      selectType
      recursiveType
      assignedTo
      assignedBy
      support
      startDate
      endDate
      priority
      estimatedHours
      actualHours
      dailyHours
      status
      remarks
      difficulties
      relatedTasks
      projectId
      subprojectId
      parentTaskId
      department
      timerState
      meetingLink
      meetingReminder
      startTime
      dueTime
      createdAt
      updatedAt
      assignedToUsers {
        employeeId
        name
        email
      }
      assignedByUser {
        employeeId
        name
        email
      }

    }
  }
`

export const GET_TASK = gql`
  query GetTask($taskId: ID!) {
    task(taskId: $taskId) {
      id
      taskId
      name
      description
      selectType
      recursiveType
      assignedTo
      assignedBy
      support
      startDate
      endDate
      priority
      estimatedHours
      actualHours
      dailyHours
      status
      remarks
      difficulties
      relatedTasks
      projectId
      subprojectId
      parentTaskId
      department
      timerState
      meetingLink
      meetingReminder
      startTime
      dueTime
      createdAt
      updatedAt
      subtasks {
        id
        subTaskId
        description
        assignedTo
        assignedBy
        startDate
        endDate
        priority
        estimatedHours
        actualHours
        status
        remarks
        isCompleted
        displayOrder
        createdAt
        updatedAt
      }
    }
  }
`

export const CREATE_TASK = gql`
  mutation CreateTask($input: CreateTaskInput!) {
    createTask(input: $input) {
      taskId
      name
      description
      assignedTo
      assignedBy
      startDate
      endDate
      priority
      estimatedHours
      status
    }
  }
`

export const UPDATE_TASK = gql`
  mutation UpdateTask($taskId: ID!, $input: UpdateTaskInput!) {
    updateTask(taskId: $taskId, input: $input) {
      taskId
      name
      description
      status
      remarks
      actualHours
    }
  }
`

// ============================================================================
// BUGS
// ============================================================================

export const GET_BUGS = gql`
  query GetBugs($assignedTo: [String], $status: [String], $severity: [String], $category: [String], $type: [String], $projectId: String, $subprojectId: String, $limit: Int, $offset: Int) {
    bugs(assignedTo: $assignedTo, status: $status, severity: $severity, category: $category, type: $type, projectId: $projectId, subprojectId: $subprojectId, limit: $limit, offset: $offset) {
      id
      bugId
      title
      description
      category
      severity
      priority
      status
      platform
      type
      feature
      assignedTo
      assignedBy
      reportedBy
      reportedDate
      resolvedDate
      estimatedHours
      actualHours
      remarks
      attachments
      createdAt
      updatedAt
      assignedToUser {
        employeeId
        name
        email
        role
      }
      assignedByUser {
        employeeId
        name
        email
        role
      }
      reportedByUser {
        employeeId
        name
        email
        role
      }
      subtasks {
        id
        subTaskId
        description
        assignedTo
        startDate
        endDate
        priority
        estimatedHours
        actualHours
        status
        remarks
      }
      projectId
    }
  }
`

export const GET_BUG = gql`
  query GetBug($bugId: ID!) {
    bug(bugId: $bugId) {
      id
      bugId
      title
      description
      category
      severity
      priority
      status
      assignedTo
      assignedBy
      reportedBy
      reportedDate
      resolvedDate
      startDate
      endDate
      estimatedHours
      actualHours
      remarks
      attachments
      projectId
      subprojectId
      relatedBugs
      platform
      type
      feature
      environment
      expectedBehavior
      actualBehavior
      serverLogs
      frontendLogs
      browserInfo
      deviceInfo
      developmentPrompt
      bugType
      criticality
      createdAt
      updatedAt
      assignedToUser {
        employeeId
        name
        email
        role
      }
      assignedByUser {
        employeeId
        name
        email
        role
      }
      reportedByUser {
        employeeId
        name
        email
        role
      }
      subtasks {
        id
        subTaskId
        description
        assignedTo
        assignedBy
        startDate
        endDate
        priority
        estimatedHours
        actualHours
        status
        remarks
        isCompleted
        displayOrder
        createdAt
        updatedAt
      }
    }
  }
`

export const CREATE_BUG = gql`
  mutation CreateBug($input: CreateBugInput!) {
    createBug(input: $input) {
      bugId
      title
      description
      severity
      priority
      status
      category
      platform
      type
    }
  }
`

export const UPDATE_BUG = gql`
  mutation UpdateBug($bugId: ID!, $input: UpdateBugInput!) {
    updateBug(bugId: $bugId, input: $input) {
      bugId
      title
      description
      status
      remarks
      actualHours
    }
  }
`

// ============================================================================
// PROJECTS
// ============================================================================

export const GET_PROJECTS = gql`
  query GetProjects {
    projects {
      id
      projectId
      projectName
      description
      parentProjectId
      createdAt
      updatedAt
    }
  }
`

export const GET_PROJECT = gql`
  query GetProject($projectId: ID!) {
    project(projectId: $projectId) {
      id
      projectId
      projectName
      description
      parentProjectId
      createdAt
      updatedAt
    }
  }
`

// ============================================================================
// USERS & SETTINGS
// ============================================================================

export const GET_USERS = gql`
  query GetUsers {
    users {
      employeeId
      name
      email
      role
      department
    }
  }
`

export const GET_SETTINGS = gql`
  query GetSettings($activeOnly: Boolean) {
    settings(activeOnly: $activeOnly) {
      id
      key
      value
      type
      isActive
    }
  }
`

// ============================================================================
// FEED
// ============================================================================

export const GET_FEED_POSTS = gql`
  query GetFeedPosts($topicId: String, $status: String, $search: String, $limit: Int, $offset: Int) {
    feedPosts(topicId: $topicId, status: $status, search: $search, limit: $limit, offset: $offset) {
      posts {
        postId
        contentType
        content
        linkUrl
        linkTitle
        linkDescription
        linkImage
        mediaUrls
        createdAt
        status
        author {
          employeeId
          name
        }
        topics {
          id
          topicName
          icon
        }
        reactions {
          emoji
          count
          hasUserReacted
        }
        viewCount
        commentCount
        isSaved
        hasUserReacted
      }
      total
      hasMore
    }
  }
`

export const GET_FEED_POST = gql`
  query GetFeedPost($postId: ID!) {
    feedPost(postId: $postId) {
      postId
      contentType
      content
      linkUrl
      linkTitle
      linkDescription
      linkImage
      mediaUrls
      createdAt
      updatedAt
      status
      author {
        employeeId
        name
        email
      }
      topics {
        id
        topicName
        icon
        description
      }
      reactions {
        emoji
        count
        hasUserReacted
        users {
          employeeId
          name
        }
      }
      comments {
        commentId
        content
        createdAt
        author {
          employeeId
          name
        }
        replies {
          commentId
          content
          createdAt
          author {
            employeeId
            name
          }
        }
      }
      viewCount
      commentCount
      isSaved
      hasUserReacted
    }
  }
`

export const GET_FEED_TOPICS = gql`
  query GetFeedTopics($includePersonal: Boolean) {
    feedTopics(includePersonal: $includePersonal) {
      id
      topicName
      description
      icon
      displayOrder
      isPersonal
      isSaved
      ownerUserId
      createdBy
      createdAt
      postCount
    }
  }
`

export const CREATE_FEED_POST = gql`
  mutation CreateFeedPost($input: CreateFeedPostInput!) {
    createFeedPost(input: $input) {
      postId
      contentType
      content
      status
      createdAt
    }
  }
`

export const CREATE_FEED_COMMENT = gql`
  mutation CreateFeedComment($postId: ID!, $content: String!, $parentCommentId: String) {
    createFeedComment(postId: $postId, content: $content, parentCommentId: $parentCommentId) {
      commentId
      content
      createdAt
      author {
        employeeId
        name
      }
    }
  }
`

export const TOGGLE_FEED_REACTION = gql`
  mutation ToggleFeedReaction($postId: ID!, $emoji: String!) {
    toggleFeedReaction(postId: $postId, emoji: $emoji) {
      action
      message
    }
  }
`

export const TOGGLE_FEED_SAVE = gql`
  mutation ToggleFeedSave($postId: ID!) {
    toggleFeedSave(postId: $postId) {
      action
      message
    }
  }
`

// ============================================================================
// NOTIFICATIONS
// ============================================================================

export const GET_NOTIFICATIONS = gql`
  query GetNotifications($userId: String!, $isRead: Boolean, $limit: Int, $offset: Int) {
    feedNotifications(userId: $userId, isRead: $isRead, limit: $limit, offset: $offset) {
      notificationId
      notificationType
      postId
      commentId
      mentionId
      taskId
      bugId
      title
      message
      linkUrl
      isRead
      createdAt
      actor {
        employeeId
        name
      }
    }
  }
`

export const GET_UNREAD_COUNT = gql`
  query GetUnreadCount($userId: String!) {
    unreadNotificationCount(userId: $userId)
  }
`

export const MARK_NOTIFICATION_READ = gql`
  mutation MarkNotificationRead($notificationId: ID!) {
    markNotificationAsRead(notificationId: $notificationId) {
      notificationId
      isRead
      readAt
    }
  }
`

export const MARK_ALL_NOTIFICATIONS_READ = gql`
  mutation MarkAllNotificationsRead($userId: String!) {
    markAllNotificationsAsRead(userId: $userId)
  }
`

// ============================================================================
// PUSH NOTIFICATIONS
// ============================================================================

export const REGISTER_PUSH_TOKEN = gql`
  mutation RegisterPushToken($userId: String!, $pushToken: String!, $deviceType: String!, $deviceId: String) {
    registerPushToken(userId: $userId, pushToken: $pushToken, deviceType: $deviceType, deviceId: $deviceId)
  }
`

export const UNREGISTER_PUSH_TOKEN = gql`
  mutation UnregisterPushToken($userId: String!, $pushToken: String!) {
    unregisterPushToken(userId: $userId, pushToken: $pushToken)
  }
`

// ============================================================================
// DASHBOARD
// ============================================================================

export const GET_DASHBOARD = gql`
  query GetDashboard($employeeId: String!, $role: String!) {
    dashboard(employeeId: $employeeId, role: $role) {
      tasks {
        total
        inProgress
        delayed
        completed
      }
      bugs {
        total
        new
        inProgress
        resolved
      }
      leaves {
        pending
        approved
        rejected
      }
      wfh {
        pending
        approved
        rejected
      }
    }
  }
`

// ============================================================================
// Leave Applications
// ============================================================================

export const GET_LEAVE_APPLICATIONS = gql`
  query GetLeaveApplications($employeeId: String, $status: String) {
    leaveApplications(employeeId: $employeeId, status: $status) {
      id
      applicationId
      employeeId
      employeeName
      leaveType
      reason
      fromDate
      toDate
      isHalfDay
      emergencyContact
      status
      managerId
      approvedBy
      approvalDate
      approvalRemarks
      createdAt
      updatedAt
    }
  }
`

export const GET_LEAVE_APPLICATION = gql`
  query GetLeaveApplication($id: ID!) {
    leaveApplication(id: $id) {
      id
      applicationId
      employeeId
      employeeName
      leaveType
      reason
      fromDate
      toDate
      isHalfDay
      emergencyContact
      status
      managerId
      approvedBy
      approvalDate
      approvalRemarks
      createdAt
      updatedAt
    }
  }
`

export const CREATE_LEAVE_APPLICATION = gql`
  mutation CreateLeaveApplication($input: CreateLeaveApplicationInput!) {
    createLeaveApplication(input: $input) {
      id
      applicationId
      status
      message
    }
  }
`

// Leave decisions go through the REST routes (/api/leaves/[id]/approve|reject).
// The APPROVE_LEAVE / REJECT_LEAVE / DELETE_LEAVE mutations that used to live here
// were never in the server schema and nothing imported them; they also took an
// $approverId, which the server now refuses to trust from the client.

// ============================================================================
// WFH Applications
// ============================================================================

export const GET_WFH_APPLICATIONS = gql`
  query GetWFHApplications($employeeId: String, $status: String) {
    wfhApplications(employeeId: $employeeId, status: $status) {
      id
      applicationId
      employeeId
      employeeName
      wfhType
      reason
      fromDate
      toDate
      workLocation
      availableFrom
      availableTo
      contactNumber
      status
      managerId
      approvedBy
      approvalDate
      approvalRemarks
      createdAt
      updatedAt
    }
  }
`

export const GET_WFH_APPLICATION = gql`
  query GetWFHApplication($id: ID!) {
    wfhApplication(id: $id) {
      id
      applicationId
      employeeId
      employeeName
      wfhType
      reason
      fromDate
      toDate
      workLocation
      availableFrom
      availableTo
      contactNumber
      status
      managerId
      approvedBy
      approvalDate
      approvalRemarks
      createdAt
      updatedAt
    }
  }
`

export const CREATE_WFH_APPLICATION = gql`
  mutation CreateWFHApplication($input: CreateWFHApplicationInput!) {
    createWFHApplication(input: $input) {
      id
      applicationId
      status
      message
    }
  }
`

// WFH decisions go through the REST routes, as above — the approveWFH /
// rejectWFH / deleteWFH mutations here were not in the server schema either.

// ============================================================================
// ATTENDANCE
// ============================================================================

export const GET_ATTENDANCE = gql`
  query GetAttendance($date: String!) {
    attendance(date: $date) {
      id
      employeeId
      signInTime
      signOutTime
      workHours
      date
      status
      isManualEntry
      approvalStatus
      createdAt
      updatedAt
      user {
        employeeId
        name
        email
        role
      }
    }
  }
`

export const GET_MONTHLY_ATTENDANCE = gql`
  query GetMonthlyAttendance($year: Int!, $month: Int!, $userId: String) {
    monthlyAttendance(year: $year, month: $month, userId: $userId) {
      id
      employeeId
      signInTime
      signOutTime
      workHours
      date
      status
      isManualEntry
      approvalStatus
    }
  }
`

export const SIGN_IN = gql`
  mutation SignIn {
    signIn {
      id
      signInTime
      status
      date
    }
  }
`

export const SIGN_OUT = gql`
  mutation SignOut {
    signOut {
      id
      signInTime
      signOutTime
      workHours
      status
    }
  }
`

export const REQUEST_MANUAL_ATTENDANCE = gql`
  mutation RequestManualAttendance($input: ManualAttendanceInput!) {
    requestManualAttendance(input: $input) {
      id
      date
      signInTime
      signOutTime
      isManualEntry
      approvalStatus
    }
  }
`

export const ADMIN_DASHBOARD_QUERY = gql`
  query AdminDashboardData {
    adminDashboardData {
      usersOnline
      usersPresent
      usersAbsent
      usersOnLeave
      usersWFH
      pendingLeaveRequests
      pendingWFHRequests
      liveAttendance {
        userId
        userName
        department
        role
        status
        signInTime
        signOutTime
        location
      }
    }
  }
`

export const PENDING_ATTENDANCE_REQUESTS = gql`
  query PendingAttendanceRequests {
    pendingAttendanceRequests {
      id
      userId
      attendanceDate
      requestType
      originalTime
      newTime
      reason
      status
      createdAt
      user {
        employeeId
        name
        department
        role
      }
    }
  }
`

export const APPROVE_ATTENDANCE_REQUEST = gql`
  mutation ApproveAttendanceRequest($requestId: ID!) {
    approveAttendanceRequest(requestId: $requestId) {
      id
      status
    }
  }
`

export const REJECT_ATTENDANCE_REQUEST = gql`
  mutation RejectAttendanceRequest($requestId: ID!) {
    rejectAttendanceRequest(requestId: $requestId) {
      id
      status
    }
  }
`

export const CREATE_FEED_TOPIC = gql`
  mutation CreateFeedTopic($input: CreateFeedTopicInput!) {
    createFeedTopic(input: $input) {
      id
      topicName
      description
      icon
      displayOrder
    }
  }
`

export const INIT_PERSONAL_TOPICS = gql`
  mutation InitPersonalTopics {
    initPersonalTopics {
      personalNotes {
        id
        topicName
      }
      savedPosts {
        id
        topicName
      }
    }
  }
`

