/**
 * Requirement Service
 *
 * GraphQL-backed data layer for the Requirements module (authoring, sections,
 * approvals, lifecycle, DEV handoff and document versioning/freeze). The web
 * app owns the schema; this mirrors its GraphQL surface for the mobile
 * companion. All calls go through `executeGraphQLQuery`, which attaches the
 * bearer token and throws on GraphQL/network errors — callers wrap in
 * try/catch and surface a friendly Alert.
 */

import { executeGraphQLQuery } from './graphqlClient'

// ── Types ──────────────────────────────────────────────────────────────────

export type RequirementStatus =
  | 'Draft'
  | 'In Review'
  | 'Approved'
  | 'Rejected'
  | 'Implemented'
  | 'Verified'
  | 'Deprecated'

export type SectionLabel =
  | 'Functional'
  | 'Non-Functional'
  | 'Constraint'
  | 'Acceptance Criteria'
  | 'Note'

export interface RequirementUser {
  employeeId: string
  name: string
  email?: string | null
  role?: string | null
}

export interface RequirementSection {
  id: string
  requirementId: string
  heading: string
  label: string
  contentHtml: string
  displayOrder: number
  lockVersion: number
  updatedAt: string
  revisionCount: number
}

export interface RequirementApproval {
  id: string
  requirementId: string
  approverId: string
  approverName: string
  decision: string
  note?: string | null
  approvedContentHash: string
  isCurrent: boolean
  createdAt: string
}

export interface RequirementDevLink {
  id: string
  requirementId: string
  devId: string
  relationshipType: string
  devStatus?: string | null
  devTitle?: string | null
  createdAt: string
}

export interface RequirementSectionRevision {
  id: string
  sectionId: number
  editorId: string
  editorName: string
  heading: string
  label: string
  contentHtml: string
  contentHash: string
  createdAt: string
}

export interface Requirement {
  id: string
  requirementId: string
  projectId: string
  subprojectId?: string | null
  title: string
  status: string
  createdBy: string
  reviewerId?: string | null
  currentApprovalId?: number | null
  createdAt: string
  updatedAt: string
  sections: RequirementSection[]
  approvals: RequirementApproval[]
  devLinks: RequirementDevLink[]
  createdByUser?: RequirementUser | null
  reviewerUser?: RequirementUser | null
}

export interface RequirementBaseline {
  id: string
  projectId: string
  versionLabel: string
  releaseNote?: string | null
  docContentHash: string
  frozenBy: string
  frozenByName: string
  createdAt: string
  snapshotJson: string
}

/** One entry inside `RequirementBaseline.snapshotJson` (after JSON.parse). */
export interface BaselineSnapshotItem {
  requirementId: string
  title: string
  status: string
  subprojectId?: string | null
  approval?: { approverName: string; note?: string | null; hash: string } | null
  contentHash: string
  sections: Array<{
    heading: string
    label: string
    contentHtml: string
    position: number
  }>
}

export interface CreateRequirementInput {
  projectId: string
  subprojectId?: string | null
  title: string
  reviewerId?: string | null
}

export interface UpdateRequirementInput {
  title?: string
  reviewerId?: string | null
}

export interface CreateRequirementSectionInput {
  requirementId: string
  heading: string
  label: string
  contentHtml: string
}

export interface UpdateRequirementSectionInput {
  heading: string
  label: string
  contentHtml: string
  lockVersion: number
}

// ── GraphQL field selections ─────────────────────────────────────────────────

const USER_FIELDS = `employeeId name email role`

const SECTION_FIELDS = `
  id requirementId heading label contentHtml displayOrder lockVersion updatedAt revisionCount
`

const APPROVAL_FIELDS = `
  id requirementId approverId approverName decision note approvedContentHash isCurrent createdAt
`

const DEV_LINK_FIELDS = `
  id requirementId devId relationshipType devStatus devTitle createdAt
`

// Full requirement — used by the detail screen.
const REQUIREMENT_FULL = `
  id requirementId projectId subprojectId title status createdBy reviewerId
  currentApprovalId createdAt updatedAt
  sections { ${SECTION_FIELDS} }
  approvals { ${APPROVAL_FIELDS} }
  devLinks { ${DEV_LINK_FIELDS} }
  createdByUser { ${USER_FIELDS} }
  reviewerUser { ${USER_FIELDS} }
`

// Lightweight requirement — used by the list screen (sections only for a count).
const REQUIREMENT_LIST = `
  id requirementId projectId subprojectId title status createdBy reviewerId
  currentApprovalId createdAt updatedAt
  sections { id }
  reviewerUser { employeeId name }
`

const BASELINE_FIELDS = `
  id projectId versionLabel releaseNote docContentHash frozenBy frozenByName createdAt snapshotJson
`

// ── Queries ──────────────────────────────────────────────────────────────────

export interface RequirementFilters {
  includeSubprojects?: boolean
  status?: string
  search?: string
}

export async function getRequirements(
  projectId: string,
  filters: RequirementFilters = {}
): Promise<Requirement[]> {
  const query = `
    query Requirements($projectId: String!, $includeSubprojects: Boolean, $status: String, $search: String) {
      requirements(projectId: $projectId, includeSubprojects: $includeSubprojects, status: $status, search: $search) {
        ${REQUIREMENT_LIST}
      }
    }
  `
  const data = await executeGraphQLQuery<{ requirements: Requirement[] }>(query, {
    projectId,
    includeSubprojects: filters.includeSubprojects ?? false,
    status: filters.status || null,
    search: filters.search || null,
  })
  return data.requirements || []
}

export async function getRequirement(requirementId: string): Promise<Requirement | null> {
  const query = `
    query Requirement($requirementId: ID!) {
      requirement(requirementId: $requirementId) {
        ${REQUIREMENT_FULL}
      }
    }
  `
  const data = await executeGraphQLQuery<{ requirement: Requirement | null }>(query, { requirementId })
  return data.requirement || null
}

export async function getSectionRevisions(sectionId: string): Promise<RequirementSectionRevision[]> {
  const query = `
    query SectionRevisions($sectionId: ID!) {
      requirementSectionRevisions(sectionId: $sectionId) {
        id sectionId editorId editorName heading label contentHtml contentHash createdAt
      }
    }
  `
  const data = await executeGraphQLQuery<{ requirementSectionRevisions: RequirementSectionRevision[] }>(
    query,
    { sectionId }
  )
  return data.requirementSectionRevisions || []
}

/**
 * May the signed-in user edit this project's requirements?
 *
 * The screens showed every edit control to every project member, so a viewer got a
 * FORBIDDEN on each attempt. The server has answered this question since the
 * module shipped (`requirementEditAccess`); nothing asked it.
 *
 * Denies on error: hiding a control the user does have is a smaller harm than
 * offering one they do not.
 */
export async function getRequirementEditAccess(projectId: string): Promise<boolean> {
  const query = `
    query RequirementEditAccess($projectId: String!) {
      requirementEditAccess(projectId: $projectId)
    }
  `
  try {
    const data = await executeGraphQLQuery<{ requirementEditAccess: boolean }>(query, { projectId })
    return Boolean(data.requirementEditAccess)
  } catch (error) {
    console.warn('Could not resolve requirement edit access:', error)
    return false
  }
}

export async function getRequirementBaselines(projectId: string): Promise<RequirementBaseline[]> {
  const query = `
    query RequirementBaselines($projectId: String!) {
      requirementBaselines(projectId: $projectId) {
        ${BASELINE_FIELDS}
      }
    }
  `
  const data = await executeGraphQLQuery<{ requirementBaselines: RequirementBaseline[] }>(query, { projectId })
  return data.requirementBaselines || []
}

// ── Mutations: requirements ──────────────────────────────────────────────────

export async function createRequirement(input: CreateRequirementInput): Promise<Requirement> {
  const mutation = `
    mutation CreateRequirement($input: CreateRequirementInput!) {
      createRequirement(input: $input) { ${REQUIREMENT_FULL} }
    }
  `
  const data = await executeGraphQLQuery<{ createRequirement: Requirement }>(mutation, { input })
  return data.createRequirement
}

export async function updateRequirement(
  requirementId: string,
  input: UpdateRequirementInput
): Promise<Requirement> {
  const mutation = `
    mutation UpdateRequirement($requirementId: ID!, $input: UpdateRequirementInput!) {
      updateRequirement(requirementId: $requirementId, input: $input) { ${REQUIREMENT_FULL} }
    }
  `
  const data = await executeGraphQLQuery<{ updateRequirement: Requirement }>(mutation, { requirementId, input })
  return data.updateRequirement
}

export async function deleteRequirement(requirementId: string): Promise<boolean> {
  const mutation = `
    mutation DeleteRequirement($requirementId: ID!) {
      deleteRequirement(requirementId: $requirementId)
    }
  `
  const data = await executeGraphQLQuery<{ deleteRequirement: boolean }>(mutation, { requirementId })
  return data.deleteRequirement
}

// ── Mutations: sections ──────────────────────────────────────────────────────

export async function createRequirementSection(
  input: CreateRequirementSectionInput
): Promise<RequirementSection> {
  const mutation = `
    mutation CreateRequirementSection($input: CreateRequirementSectionInput!) {
      createRequirementSection(input: $input) { ${SECTION_FIELDS} }
    }
  `
  const data = await executeGraphQLQuery<{ createRequirementSection: RequirementSection }>(mutation, { input })
  return data.createRequirementSection
}

/**
 * Optimistic-lock update. If another editor saved first the server throws
 * `CONFLICT: ...`; callers should catch, reload the requirement and retry.
 */
export async function updateRequirementSection(
  sectionId: string,
  input: UpdateRequirementSectionInput
): Promise<RequirementSection> {
  const mutation = `
    mutation UpdateRequirementSection($sectionId: ID!, $input: UpdateRequirementSectionInput!) {
      updateRequirementSection(sectionId: $sectionId, input: $input) { ${SECTION_FIELDS} }
    }
  `
  const data = await executeGraphQLQuery<{ updateRequirementSection: RequirementSection }>(mutation, {
    sectionId,
    input,
  })
  return data.updateRequirementSection
}

export async function deleteRequirementSection(sectionId: string): Promise<boolean> {
  const mutation = `
    mutation DeleteRequirementSection($sectionId: ID!) {
      deleteRequirementSection(sectionId: $sectionId)
    }
  `
  const data = await executeGraphQLQuery<{ deleteRequirementSection: boolean }>(mutation, { sectionId })
  return data.deleteRequirementSection
}

export async function reorderRequirementSections(
  requirementId: string,
  sectionIds: string[]
): Promise<boolean> {
  const mutation = `
    mutation ReorderRequirementSections($requirementId: ID!, $sectionIds: [ID!]!) {
      reorderRequirementSections(requirementId: $requirementId, sectionIds: $sectionIds)
    }
  `
  const data = await executeGraphQLQuery<{ reorderRequirementSections: boolean }>(mutation, {
    requirementId,
    sectionIds,
  })
  return data.reorderRequirementSections
}

export async function restoreRequirementSectionRevision(
  sectionId: string,
  revisionId: string
): Promise<RequirementSection> {
  const mutation = `
    mutation RestoreRequirementSectionRevision($sectionId: ID!, $revisionId: ID!) {
      restoreRequirementSectionRevision(sectionId: $sectionId, revisionId: $revisionId) { ${SECTION_FIELDS} }
    }
  `
  const data = await executeGraphQLQuery<{ restoreRequirementSectionRevision: RequirementSection }>(mutation, {
    sectionId,
    revisionId,
  })
  return data.restoreRequirementSectionRevision
}

// ── Mutations: approval + lifecycle ──────────────────────────────────────────

export async function submitRequirementForReview(requirementId: string): Promise<Requirement> {
  const mutation = `
    mutation SubmitRequirementForReview($requirementId: ID!) {
      submitRequirementForReview(requirementId: $requirementId) { ${REQUIREMENT_FULL} }
    }
  `
  const data = await executeGraphQLQuery<{ submitRequirementForReview: Requirement }>(mutation, { requirementId })
  return data.submitRequirementForReview
}

export async function approveRequirement(requirementId: string, note?: string): Promise<Requirement> {
  const mutation = `
    mutation ApproveRequirement($requirementId: ID!, $note: String) {
      approveRequirement(requirementId: $requirementId, note: $note) { ${REQUIREMENT_FULL} }
    }
  `
  const data = await executeGraphQLQuery<{ approveRequirement: Requirement }>(mutation, {
    requirementId,
    note: note || null,
  })
  return data.approveRequirement
}

export async function rejectRequirement(requirementId: string, note: string): Promise<Requirement> {
  const mutation = `
    mutation RejectRequirement($requirementId: ID!, $note: String!) {
      rejectRequirement(requirementId: $requirementId, note: $note) { ${REQUIREMENT_FULL} }
    }
  `
  const data = await executeGraphQLQuery<{ rejectRequirement: Requirement }>(mutation, { requirementId, note })
  return data.rejectRequirement
}

export async function updateRequirementStatus(requirementId: string, status: string): Promise<Requirement> {
  const mutation = `
    mutation UpdateRequirementStatus($requirementId: ID!, $status: String!) {
      updateRequirementStatus(requirementId: $requirementId, status: $status) { ${REQUIREMENT_FULL} }
    }
  `
  const data = await executeGraphQLQuery<{ updateRequirementStatus: Requirement }>(mutation, {
    requirementId,
    status,
  })
  return data.updateRequirementStatus
}

// ── Mutations: versioning / freeze + DEV handoff ─────────────────────────────

export async function createRequirementBaseline(
  projectId: string,
  versionLabel?: string,
  releaseNote?: string
): Promise<RequirementBaseline> {
  const mutation = `
    mutation CreateRequirementBaseline($projectId: String!, $versionLabel: String, $releaseNote: String) {
      createRequirementBaseline(projectId: $projectId, versionLabel: $versionLabel, releaseNote: $releaseNote) {
        ${BASELINE_FIELDS}
      }
    }
  `
  const data = await executeGraphQLQuery<{ createRequirementBaseline: RequirementBaseline }>(mutation, {
    projectId,
    versionLabel: versionLabel || null,
    releaseNote: releaseNote || null,
  })
  return data.createRequirementBaseline
}

export async function rollbackRequirementToVersion(
  requirementId: string,
  baselineId: string
): Promise<Requirement> {
  const mutation = `
    mutation RollbackRequirementToVersion($requirementId: ID!, $baselineId: ID!) {
      rollbackRequirementToVersion(requirementId: $requirementId, baselineId: $baselineId) { ${REQUIREMENT_FULL} }
    }
  `
  const data = await executeGraphQLQuery<{ rollbackRequirementToVersion: Requirement }>(mutation, {
    requirementId,
    baselineId,
  })
  return data.rollbackRequirementToVersion
}

export interface CreatedDevItem {
  bugId: string
  title: string
  status: string
}

export async function createDevItemFromRequirement(
  requirementId: string,
  assignedTo?: string
): Promise<CreatedDevItem> {
  const mutation = `
    mutation CreateDevItemFromRequirement($requirementId: ID!, $input: CreateDevItemFromRequirementInput) {
      createDevItemFromRequirement(requirementId: $requirementId, input: $input) {
        bugId title status
      }
    }
  `
  const data = await executeGraphQLQuery<{ createDevItemFromRequirement: CreatedDevItem }>(mutation, {
    requirementId,
    input: assignedTo ? { assignedTo } : null,
  })
  return data.createDevItemFromRequirement
}
