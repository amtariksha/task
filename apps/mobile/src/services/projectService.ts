/**
 * Project Service
 * API calls for project and subproject management
 * Updated: GraphQL with REST fallback
 */

import { get, post, put, ApiResponse } from './apiClient'
import { API_ENDPOINTS } from '../config/api'
import { executeGraphQLWithFallback } from './graphqlClient'
import { QUERIES } from './graphqlQueries'
import { ReleaseChecklistTemplate } from '../types'
import { unwrapApiBody, unwrapApiList, type ApiResult } from '../utils/apiEnvelope'
import { mainProjectsOf, subprojectsOf } from '../utils/projectOptions'

export interface Project {
  projectId: string
  projectName: string
  parentProjectId?: string | null
  status?: string
  description?: string
  createdBy: string
  createdAt: string
  updatedAt: string
  releaseEnabled?: boolean
  releaseChecklist?: ReleaseChecklistTemplate | null
}

export interface Subproject {
  subprojectId: string
  subprojectName: string
  projectId: string
  description?: string
  createdBy: string
  createdAt: string
  updatedAt: string
  releaseEnabled?: boolean
  releaseChecklist?: ReleaseChecklistTemplate | null
}

export interface ProjectHierarchy {
  projectId: string
  projectName: string
  subprojects: Subproject[]
}

/**
 * Get all projects (GraphQL with REST fallback)
 */
export const getAllProjects = async (): Promise<ApiResponse<Project[]>> => {
  return executeGraphQLWithFallback<Project[]>(
    QUERIES.GET_PROJECTS,
    {},
    () => get<Project[]>(API_ENDPOINTS.PROJECTS),
    'ProjectService.getAllProjects'
  ).then(response => {
    if (response.success && response.data) {
      // GraphQL returns projects directly, REST returns { data: projects }
      const projects = Array.isArray(response.data) ? response.data : (response.data as any).projects || []
      return { success: true, data: projects }
    }
    return response
  })
}

/**
 * Main projects the signed-in user is a member of, for a project picker.
 * GET /api/projects answers with a bare array, not { success, data }.
 */
export const getMainProjects = async (): Promise<ApiResult<Project[]>> => {
  const result = unwrapApiList<Project>(
    await get(`${API_ENDPOINTS.PROJECTS}?type=main`),
    'Could not load projects'
  )
  return result.success ? { success: true, data: mainProjectsOf(result.data) } : result
}

/**
 * Sub-projects of one project. The route ignores `parentId` and returns every
 * project the user can see, so the children are filtered out here.
 */
export const getSubprojects = async (parentId: string): Promise<ApiResult<Project[]>> => {
  const result = unwrapApiList<Project>(
    await get(`${API_ENDPOINTS.PROJECTS}?parentId=${encodeURIComponent(parentId)}`),
    'Could not load sub-projects'
  )
  return result.success ? { success: true, data: subprojectsOf(result.data, parentId) } : result
}

export interface CreateProjectInput {
  projectName: string
  parentProjectId?: string | null
  description?: string | null
  status?: 'Active' | 'Inactive'
  createdBy?: string
}

/**
 * Create a project, or a sub-project when parentProjectId is set. A 201 carries
 * the bare created project, which read as `success` undefined and made the
 * screens report a failure for a project that had been created.
 */
export const createProject = async (input: CreateProjectInput): Promise<ApiResult<Project>> => {
  const result = unwrapApiBody<Project>(await post(API_ENDPOINTS.PROJECTS, input), 'Failed to create project')
  // Every real 201 carries the new id. Anything else (say, a gateway's JSON
  // error page) must not be reported as a project that now exists.
  if (result.success && typeof result.data?.projectId !== 'string') {
    return { success: false, error: 'Failed to create project' }
  }
  return result
}

/**
 * Get project hierarchy (projects with their subprojects)
 */
export const getProjectHierarchy = async (): Promise<
  ApiResponse<ProjectHierarchy[]>
> => {
  return get<ProjectHierarchy[]>(API_ENDPOINTS.PROJECT_HIERARCHY)
}

/**
 * Get a single project/sub-project by ID over REST.
 *
 * Returns the full record including `releaseEnabled` / `releaseChecklist`,
 * which the hierarchy/list endpoints may not carry. Used by the create-bug
 * screen to read a sub-project's release config + checklist template, and by
 * the project detail screen.
 */
export const getProjectById = async (
  projectId: string
): Promise<ApiResponse<any>> => {
  const body = await get<any>(API_ENDPOINTS.PROJECT_BY_ID(projectId))
  // GET /api/projects/{id} returns the project object DIRECTLY (spread, no
  // {success,data} wrapper) — e.g. { projectId, releaseEnabled, ... }. Error
  // paths (401/network) still use {success:false,...}. Handle both shapes.
  const b: any = body
  if (b && b.projectId) {
    return { success: true, data: b }
  }
  if (b && b.success && b.data) {
    return { success: true, data: b.data.project ?? b.data }
  }
  return { success: false, error: b?.error || 'Project not found' }
}

/**
 * Update a project/sub-project (REST PUT). Used to persist release config
 * (releaseEnabled / releaseChecklist) and standard fields.
 */
export const updateProject = async (
  projectId: string,
  updates: Record<string, any>
): Promise<ApiResponse<any>> => {
  return put<any>(API_ENDPOINTS.PROJECT_BY_ID(projectId), updates)
}

