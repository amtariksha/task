/**
 * Picking projects for the pickers out of what GET /api/projects returns.
 * The route has no parentId filter: `?parentId=` is ignored and every project
 * the user can see comes back, so the children are picked out here — the web
 * task form does the same.
 */

export interface ProjectOption {
  projectId: string
  projectName: string
  parentProjectId?: string | null
}

const byProjectId = (a: ProjectOption, b: ProjectOption): number =>
  (a.projectId || '').localeCompare(b.projectId || '')

/** Top-level projects, ordered by id. */
export function mainProjectsOf<T extends ProjectOption>(projects: readonly T[]): T[] {
  return projects.filter((project) => !project.parentProjectId).sort(byProjectId)
}

/** The sub-projects of `parentId`, ordered by id. */
export function subprojectsOf<T extends ProjectOption>(projects: readonly T[], parentId: string): T[] {
  return projects.filter((project) => project.parentProjectId === parentId).sort(byProjectId)
}
