/**
 * Authorization — the single place authority is decided.
 *
 * Server-side only. Do not add 'use client'.
 *
 * Authority comes from three independent tiers. Higher tiers do not silently
 * grant lower-tier powers except where stated:
 *
 *   platform   users.is_platform_admin       manage companies; cross-company support.
 *   company    user_companies.company_role   'company_admin' may manage users,
 *                                            projects, feed topics and settings —
 *                                            ONLY within that company.
 *   project    project_users.role            'manager' | 'team_leader' | 'member'.
 *
 * Orthogonal to all three is the reporting chain (users.manager_id), which is
 * transitive: a manager can see and edit the work of everyone beneath them,
 * however many levels down.
 *
 * Before this module, authorization was ad-hoc string comparisons
 * (`role === 'admin' || role === 'top_management' || employeeId === 'AM-0001'`)
 * duplicated across pages and routes, with most API routes enforcing nothing at
 * all. Route handlers should call these helpers rather than re-deriving rules.
 */

import {
  getCompanyRole,
  getCompanyMemberIds,
  isPlatformAdmin as dbIsPlatformAdmin,
  type CompanyRole,
} from './db/companies'
import { getProjectRole, isUserAssignedToProject, type ProjectRole } from './db/project-users'
import { isInManagerChain, getVisibleEmployeeIds } from './db/users'
import { getProjectById } from './db/projects'

export interface Actor {
  employeeId: string
  /** Global users.role — legacy, retained for the admin/top_management shortcuts. */
  role?: string
  /** Company the current session is acting in. */
  companyId?: string | null
  isPlatformAdmin?: boolean
}

/** Legacy global roles that behave as company admins until fully migrated. */
const LEGACY_ADMIN_ROLES = ['admin', 'top_management']

function hasLegacyAdminRole(actor: Actor): boolean {
  return !!actor.role && LEGACY_ADMIN_ROLES.includes(actor.role)
}

export async function isPlatformAdmin(actor: Actor): Promise<boolean> {
  if (actor.isPlatformAdmin !== undefined) return actor.isPlatformAdmin
  return dbIsPlatformAdmin(actor.employeeId)
}

/**
 * TENANT BOUNDARY — the check that must run before any per-item permission.
 *
 * Every other helper here answers "does this person have the right ROLE?", and
 * a global admin passed those checks regardless of which company owned the
 * record. That was the residual leak after 062: an admin of company A could
 * read and edit company B's tasks and bugs, because the role test never
 * consulted the record's company.
 *
 * Fails OPEN in exactly two situations, both deliberate:
 *   - the record has no company (legacy rows migration 063 could not resolve);
 *   - the session has no company (a token issued before 062).
 * In both cases behaviour falls back to the pre-tenancy rules rather than
 * locking people out of their own data mid-rollout.
 *
 * Platform admins cross tenants by definition — that is what the flag is for.
 */
export async function isSameCompany(actor: Actor, recordCompanyId?: string | null): Promise<boolean> {
  if (!recordCompanyId) return true
  if (!actor.companyId) return true
  if (actor.companyId === recordCompanyId) return true
  return isPlatformAdmin(actor)
}

/** Is the actor a member of this company at all? */
export async function isCompanyMember(actor: Actor, companyId: string): Promise<boolean> {
  if (await isPlatformAdmin(actor)) return true
  return (await getCompanyRole(actor.employeeId, companyId)) !== null
}

/**
 * May the actor administer this company — add users, edit projects, feed topics
 * and settings? True for a company_admin of THAT company, and for platform
 * admins. Deliberately false for a company_admin of a different company.
 */
export async function canAdminCompany(actor: Actor, companyId: string): Promise<boolean> {
  if (await isPlatformAdmin(actor)) return true
  const companyRole: CompanyRole | null = await getCompanyRole(actor.employeeId, companyId)
  if (companyRole === 'company_admin') return true
  // Until every deployment has migrated off the global roles, an admin /
  // top_management user still administers a company they belong to.
  return hasLegacyAdminRole(actor) && companyRole !== null
}

/** May the actor create users in this company? */
export async function canManageUsers(actor: Actor, companyId: string): Promise<boolean> {
  return canAdminCompany(actor, companyId)
}

/**
 * May the actor create, edit or archive this project?
 *
 * Looks the project up INCLUDING soft-deleted rows: restoring a deleted project
 * is a management action, and with the default lookup the project came back null
 * so `/api/projects/[projectId]/restore` returned 403 to everyone, platform
 * admins included.
 */
export async function canManageProject(actor: Actor, projectId: string): Promise<boolean> {
  const project = await getProjectById(projectId, true)
  if (!project) return false

  const companyId = (project as { companyId?: string }).companyId
  if (companyId && (await canAdminCompany(actor, companyId))) return true

  // A project manager runs their own project.
  return (await getProjectRole(projectId, actor.employeeId)) === 'manager'
}

/** May the actor see this project at all? */
export async function canViewProject(actor: Actor, projectId: string): Promise<boolean> {
  const project = await getProjectById(projectId)
  if (!project) return false

  const companyId = (project as { companyId?: string }).companyId
  if (companyId && (await canAdminCompany(actor, companyId))) return true

  return isUserAssignedToProject(projectId, actor.employeeId)
}

/**
 * May the actor edit a work item (task, bug, requirement) that belongs to
 * `ownerEmployeeId` on `projectId`?
 *
 * Yes when any of these hold:
 *   - it is their own item;
 *   - they manage or lead that project;
 *   - the owner reports to them, at any depth;
 *   - they administer the company the project belongs to.
 */
export async function canEditWorkItem(
  actor: Actor,
  options: { projectId?: string | null; ownerEmployeeId?: string | null; companyId?: string | null }
): Promise<boolean> {
  const { projectId, ownerEmployeeId, companyId } = options

  // Tenant boundary first — no role, ownership or manager relationship grants
  // access to another company's record.
  if (!(await isSameCompany(actor, companyId))) return false

  if (ownerEmployeeId && ownerEmployeeId === actor.employeeId) return true

  if (projectId) {
    const projectRole: ProjectRole | null = await getProjectRole(projectId, actor.employeeId)
    if (projectRole === 'manager' || projectRole === 'team_leader') return true

    const project = await getProjectById(projectId)
    const companyId = (project as { companyId?: string } | null)?.companyId
    if (companyId && (await canAdminCompany(actor, companyId))) return true
  } else if (hasLegacyAdminRole(actor) || (await isPlatformAdmin(actor))) {
    // No project context to scope by — fall back to global authority.
    return true
  }

  if (ownerEmployeeId && (await isInManagerChain(actor.employeeId, ownerEmployeeId))) return true

  return false
}

/**
 * May the actor see another user's records (tasks, attendance, leave)?
 * Themselves, anyone reporting to them at any depth, or anyone in a company
 * they administer.
 */
export async function canViewUser(actor: Actor, targetEmployeeId: string): Promise<boolean> {
  if (targetEmployeeId === actor.employeeId) return true
  if (await isPlatformAdmin(actor)) return true

  // The target must be in the acting company before any role check applies,
  // otherwise a company admin could read users from another tenant.
  if (actor.companyId) {
    const shared = await getCompanyRole(targetEmployeeId, actor.companyId)
    if (shared === null) return false
    if (await canAdminCompany(actor, actor.companyId)) return true
  }

  return isInManagerChain(actor.employeeId, targetEmployeeId)
}

/**
 * May the actor READ a work item? Looser than canEditWorkItem — project
 * membership is enough to view — but the tenant boundary still applies.
 */
export async function canViewWorkItem(
  actor: Actor,
  options: { projectId?: string | null; ownerEmployeeId?: string | null; companyId?: string | null }
): Promise<boolean> {
  if (!(await isSameCompany(actor, options.companyId))) return false
  if (options.ownerEmployeeId === actor.employeeId) return true
  if (options.projectId && (await isUserAssignedToProject(options.projectId, actor.employeeId))) return true
  return canEditWorkItem(actor, options)
}

/**
 * Which employees may the actor see? The set form of `canViewUser`, for list
 * endpoints that would otherwise need one authorization query per row.
 *
 * `{ all: true }` means no filter applies — a platform admin, or a legacy global
 * admin on a token issued before migration 062 (the same fail-open case
 * `isSameCompany` allows, so behaviour does not change mid-rollout).
 */
export type VisibleEmployeeScope =
  | { all: true }
  | { all: false; employeeIds: string[] }

export async function getVisibleEmployeeScope(actor: Actor): Promise<VisibleEmployeeScope> {
  if (await isPlatformAdmin(actor)) return { all: true }
  if (!actor.companyId && hasLegacyAdminRole(actor)) return { all: true }

  // Themselves plus everyone below them in the reporting chain, at any depth.
  const employeeIds = new Set(await getVisibleEmployeeIds(actor.employeeId))

  // A company admin sees their whole company, not only their reports.
  if (actor.companyId && (await canAdminCompany(actor, actor.companyId))) {
    for (const employeeId of await getCompanyMemberIds(actor.companyId)) {
      employeeIds.add(employeeId)
    }
  }

  return { all: false, employeeIds: Array.from(employeeIds) }
}

/** May the actor approve leave / WFH / attendance for this employee? */
export async function canApproveFor(actor: Actor, targetEmployeeId: string): Promise<boolean> {
  if (targetEmployeeId === actor.employeeId) return false // never self-approve
  return canViewUser(actor, targetEmployeeId)
}

/** Only platform admins create or reconfigure companies. */
export async function canManageCompanies(actor: Actor): Promise<boolean> {
  return isPlatformAdmin(actor)
}
