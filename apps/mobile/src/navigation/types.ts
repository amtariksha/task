/**
 * Navigation Types
 */

export type RootStackParamList = {
    Login: undefined;
    Main: undefined;
    TaskList: undefined;
    TaskDetails: { taskId: string };
    BugList: undefined;
    BugDetails: { bugId: string };
    CreateBug: undefined;
    CreateTask: undefined;
    FeedPostDetails: { postId: string };
    CreateFeedPost: undefined;
    Notifications: undefined;
    LeaveList: undefined;
    LeaveDetails: { leaveId: string };
    CreateLeave: undefined;
    WFHList: undefined;
    WFHDetails: { wfhId: string };
    CreateWFH: undefined;
    AttendanceDashboard: undefined;
    AttendanceApprovals: undefined;
    AttendanceCalendar: undefined;
    Settings: undefined;
    Feed: undefined;
    YourWork: undefined;
    TeamTasks: undefined;
    Projects: undefined;
    ProjectDetails: { projectId: string };
    Users: undefined;
    FeedTopics: undefined;
    DeletedItems: undefined;
    Reports: undefined;
    FounderStart: undefined;
    FounderRank: undefined;
};
