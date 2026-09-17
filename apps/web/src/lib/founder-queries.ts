/**
 * GraphQL operations for the founder /start page (client-side, via ApolloWrapper).
 * Mirrors apps/mobile/src/config/founder-queries.ts.
 */

import { gql } from '@apollo/client'

export const FOUNDER_CHECKIN_FIELDS = gql`
  fragment FounderCheckinFields on FounderCheckin {
    id
    checkinDate
    resumePointId
    kind
    note
    nextAction
    source
    createdAt
  }
`

export const FOUNDER_THREAD_FIELDS = gql`
  fragment FounderThreadFields on FounderResumePoint {
    id
    label
    projectId
    projectName
    nextAction
    nextActionSetAt
    rank
    waitingOn
    lastTouchedAt
    lastTouchedSource
    daysSinceTouched
    isStale
    isActive
    recentCheckins(limit: 3) {
      ...FounderCheckinFields
    }
  }
  ${FOUNDER_CHECKIN_FIELDS}
`

export const ME_IS_FOUNDER = gql`
  query MeIsFounder {
    me {
      employeeId
      isFounder
    }
  }
`

export const FOUNDER_START = gql`
  query FounderStart {
    founderStart {
      date
      top3 {
        ...FounderThreadFields
      }
      accordion {
        ...FounderThreadFields
      }
      waitingOnMe {
        kind
        id
        title
        dueDate
        projectName
        status
      }
      teamActivity {
        resumePointId
        count
        titles
      }
      lastCloseoutDate
      closeoutOverdue
      pausedUntil
      settings {
        enabled
        hour
        minute
        tz
        pausedUntil
        lastSentDate
      }
      claudeNotes {
        ...FounderCheckinFields
      }
      generatedAt
    }
  }
  ${FOUNDER_THREAD_FIELDS}
`

export const FOUNDER_RESUME_POINTS = gql`
  query FounderResumePoints($includeParked: Boolean) {
    founderResumePoints(includeParked: $includeParked) {
      ...FounderThreadFields
    }
  }
  ${FOUNDER_THREAD_FIELDS}
`

export const CREATE_FOUNDER_RESUME_POINT = gql`
  mutation CreateFounderResumePoint($label: String!, $projectId: String) {
    createFounderResumePoint(label: $label, projectId: $projectId) {
      ...FounderThreadFields
    }
  }
  ${FOUNDER_THREAD_FIELDS}
`

/** Only pass the variables you intend to change; an explicit null clears waitingOn. */
export const UPDATE_FOUNDER_RESUME_POINT = gql`
  mutation UpdateFounderResumePoint(
    $id: ID!
    $label: String
    $projectId: String
    $nextAction: String
    $waitingOn: String
    $isActive: Boolean
  ) {
    updateFounderResumePoint(
      id: $id
      label: $label
      projectId: $projectId
      nextAction: $nextAction
      waitingOn: $waitingOn
      isActive: $isActive
    ) {
      ...FounderThreadFields
    }
  }
  ${FOUNDER_THREAD_FIELDS}
`

export const CREATE_FOUNDER_CLOSEOUT = gql`
  mutation CreateFounderCloseout($entries: [FounderCloseoutEntryInput!]!) {
    createFounderCloseout(entries: $entries) {
      ...FounderThreadFields
    }
  }
  ${FOUNDER_THREAD_FIELDS}
`

export const UPDATE_FOUNDER_RANKS = gql`
  mutation UpdateFounderRanks($orderedIds: [ID!]!) {
    updateFounderRanks(orderedIds: $orderedIds) {
      id
      rank
    }
  }
`

export const UPDATE_FOUNDER_START_SETTINGS = gql`
  mutation UpdateFounderStartSettings($enabled: Boolean, $hour: Int, $minute: Int, $pausedUntil: String) {
    updateFounderStartSettings(enabled: $enabled, hour: $hour, minute: $minute, pausedUntil: $pausedUntil) {
      enabled
      hour
      minute
      tz
      pausedUntil
      lastSentDate
    }
  }
`
