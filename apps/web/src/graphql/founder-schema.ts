// Founder Start layer — type definitions, interpolated into schema.ts.
// Every field is founder-only (see lib/founder/founder-auth).
export const founderTypeDefs = `
  type FounderResumePoint {
    id: ID!
    label: String!
    projectId: String
    projectName: String
    nextAction: String
    nextActionSetAt: String
    rank: Int
    waitingOn: String
    lastTouchedAt: String
    lastTouchedSource: String
    daysSinceTouched: Int
    isStale: Boolean!
    isActive: Boolean!
    recentCheckins(limit: Int = 3): [FounderCheckin!]!
  }

  type FounderCheckin {
    id: ID!
    checkinDate: String!
    resumePointId: ID
    kind: String!
    note: String
    nextAction: String
    source: String!
    createdAt: String!
  }

  type FounderWaitingItem {
    kind: String!
    id: String!
    title: String!
    dueDate: String
    projectName: String
    status: String
  }

  type FounderTeamActivity {
    resumePointId: ID!
    count: Int!
    titles: [String!]!
  }

  type FounderStartSettings {
    enabled: Boolean!
    hour: Int!
    minute: Int!
    tz: String!
    pausedUntil: String
    lastSentDate: String
  }

  type FounderStart {
    date: String!
    top3: [FounderResumePoint!]!
    accordion: [FounderResumePoint!]!
    waitingOnMe: [FounderWaitingItem!]!
    teamActivity: [FounderTeamActivity!]!
    lastCloseoutDate: String
    closeoutOverdue: Boolean!
    pausedUntil: String
    settings: FounderStartSettings!
    claudeNotes: FounderCheckin
    generatedAt: String!
  }

  input FounderCloseoutEntryInput {
    resumePointId: ID
    label: String
    note: String
    nextAction: String
    waitingOn: String
  }

  input FounderActivityEntryInput {
    label: String
    projectId: String
    summary: String!
    occurredAt: String
  }

  extend type Query {
    founderStart: FounderStart!
    founderResumePoints(includeParked: Boolean = false): [FounderResumePoint!]!
    founderCheckins(resumePointId: ID, limit: Int = 20): [FounderCheckin!]!
    founderStartSettings: FounderStartSettings!
  }

  extend type Mutation {
    createFounderResumePoint(label: String!, projectId: String): FounderResumePoint!
    updateFounderResumePoint(
      id: ID!
      label: String
      projectId: String
      nextAction: String
      waitingOn: String
      isActive: Boolean
    ): FounderResumePoint!
    createFounderCloseout(entries: [FounderCloseoutEntryInput!]!): [FounderResumePoint!]!
    updateFounderRanks(orderedIds: [ID!]!): [FounderResumePoint!]!
    updateFounderStartSettings(enabled: Boolean, hour: Int, minute: Int, pausedUntil: String): FounderStartSettings!
    ingestFounderActivity(token: String!, entries: [FounderActivityEntryInput!]!): Int!
  }
`
