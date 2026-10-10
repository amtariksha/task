'use client'

/**
 * Project Details Page
 * 
 * Displays project information, sub-projects, and associated tasks/bugs
 * Allows admin/top_management to edit and delete projects
 */

import { useState, useEffect } from 'react'
import { useRouter, useParams } from 'next/navigation'
import { Project, User, ProjectUserWithUser, ReleaseChecklistTemplate } from '@/lib/types'
import { formatDateTimeIST } from '@/lib/datetime-utils'
import ProjectModal from '@/components/projects/ProjectModal'
import ReleaseChecklistEditor from '@/components/projects/ReleaseChecklistEditor'
import { DEFAULT_RELEASE_CHECKLIST } from '@/lib/releaseChecklistDefault'
import { Plus, X, UserPlus, Users, Search, AlertTriangle } from 'lucide-react'
import { hasTabAccess } from '@/lib/permissions'
import { getCurrentUser } from '@/lib/auth'
import { describeProjectLoadFailure } from '@/lib/projects/load-failure'

const EMPTY_CHECKLIST: ReleaseChecklistTemplate = { sections: [] }

interface ProjectWithSubProjects extends Project {
  subProjects?: Project[]
}

export default function ProjectDetailsPage() {
  const router = useRouter()
  const params = useParams()
  const projectId = params.projectId as string

  const [project, setProject] = useState<ProjectWithSubProjects | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  // Why the server refused this project (it belongs to another company).
  const [accessRefused, setAccessRefused] = useState<string | null>(null)
  const [userRole, setUserRole] = useState<string>('')
  const [employeeId, setEmployeeId] = useState<string>('')
  const [deleting, setDeleting] = useState(false)
  const [isEditing, setIsEditing] = useState(false)
  const [editData, setEditData] = useState({
    projectName: '',
    description: '',
    status: 'Active' as 'Active' | 'Inactive' | 'Deleted',
    releaseEnabled: false,
    releaseChecklist: EMPTY_CHECKLIST as ReleaseChecklistTemplate
  })
  const [saving, setSaving] = useState(false)
  const [isHydrated, setIsHydrated] = useState(false)
  const [isSubprojectModalOpen, setIsSubprojectModalOpen] = useState(false)
  const [subprojectToEdit, setSubprojectToEdit] = useState<Project | null>(null)

  // Assigned users state
  const [assignedUsers, setAssignedUsers] = useState<ProjectUserWithUser[]>([])
  const [allUsers, setAllUsers] = useState<User[]>([])
  const [isAddingUser, setIsAddingUser] = useState(false)
  const [userSearchTerm, setUserSearchTerm] = useState('')
  const [newUserCanEditRequirements, setNewUserCanEditRequirements] = useState(false)
  const [loadingAssignedUsers, setLoadingAssignedUsers] = useState(false)
  const [removingUserId, setRemovingUserId] = useState<string | null>(null)
  const [togglingReqEditId, setTogglingReqEditId] = useState<string | null>(null)
  const [settingRoleFor, setSettingRoleFor] = useState<string | null>(null)
  const [removalWarning, setRemovalWarning] = useState<{
    employeeId: string
    userName: string
    taskCount: number
    bugCount: number
  } | null>(null)

  useEffect(() => {
    // Get user info from localStorage
    const userStr = localStorage.getItem('jsr_current_user')
    if (userStr) {
      try {
        const user = JSON.parse(userStr)
        setUserRole(user.role || '')
        setEmployeeId(user.employeeId || '')
      } catch (error) {
        console.error('Failed to parse user data:', error)
      }
    }
    setIsHydrated(true)

    fetchProject()
    fetchAssignedUsers()
    fetchAllUsers()
  }, [projectId])

  const fetchProject = async () => {
    try {
      setLoading(true)
      setError(null)
      setAccessRefused(null)

      const response = await fetch(`/api/projects/${projectId}`)
      if (!response.ok) {
        const failure = describeProjectLoadFailure(
          response.status,
          await response.json().catch(() => null)
        )
        if (failure.kind === 'forbidden') {
          // An answer, not a fault: drop anything already on screen and say why.
          setProject(null)
          setAccessRefused(failure.message)
          return
        }
        throw new Error(failure.message)
      }

      const data = await response.json()
      setProject(data)
      setEditData({
        projectName: data.projectName,
        description: data.description || '',
        status: data.status,
        releaseEnabled: data.releaseEnabled ?? false,
        releaseChecklist: data.releaseChecklist ?? EMPTY_CHECKLIST
      })
    } catch (err) {
      console.error('Error fetching project:', err)
      setError(err instanceof Error ? err.message : 'Failed to load project')
    } finally {
      setLoading(false)
    }
  }

  const fetchAssignedUsers = async () => {
    try {
      setLoadingAssignedUsers(true)
      const response = await fetch(`/api/projects/${projectId}/users`)
      if (response.ok) {
        const result = await response.json()
        setAssignedUsers(result.data || [])
      }
    } catch (err) {
      console.error('Error fetching assigned users:', err)
    } finally {
      setLoadingAssignedUsers(false)
    }
  }

  const fetchAllUsers = async () => {
    try {
      const response = await fetch('/api/users?includeInactive=false')
      if (response.ok) {
        const result = await response.json()
        setAllUsers(result.data || [])
      }
    } catch (err) {
      console.error('Error fetching all users:', err)
    }
  }

  const handleAssignUser = async (targetEmployeeId: string) => {
    try {
      const response = await fetch(`/api/projects/${projectId}/users`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          employeeId: targetEmployeeId,
          assignedBy: employeeId,
          canEditRequirements: newUserCanEditRequirements
        })
      })

      if (response.ok) {
        await fetchAssignedUsers()
        setIsAddingUser(false)
        setUserSearchTerm('')
        setNewUserCanEditRequirements(false)
      } else {
        const result = await response.json()
        alert(result.error || 'Failed to assign user')
      }
    } catch (err) {
      console.error('Error assigning user:', err)
      alert('Failed to assign user')
    }
  }

  const handleToggleRequirementsEdit = async (targetEmployeeId: string, canEdit: boolean) => {
    setTogglingReqEditId(targetEmployeeId)
    try {
      const response = await fetch(`/api/projects/${projectId}/users`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ employeeId: targetEmployeeId, canEditRequirements: canEdit })
      })

      if (response.ok) {
        await fetchAssignedUsers()
      } else {
        const result = await response.json()
        alert(result.error || 'Failed to update requirements-edit permission')
      }
    } catch (err) {
      console.error('Error updating requirements-edit permission:', err)
      alert('Failed to update requirements-edit permission')
    } finally {
      setTogglingReqEditId(null)
    }
  }

  /**
   * Set a member's role WITHIN this project.
   *
   * project_users.role is the tier the global users.role cannot express: the same
   * person manages one project and is simply a member of another. It decides who
   * may edit the project, change its members, and read or write its stored
   * secrets — and until now it could only be changed with SQL.
   */
  const handleSetProjectRole = async (targetEmployeeId: string, role: string) => {
    setSettingRoleFor(targetEmployeeId)
    try {
      const response = await fetch(`/api/projects/${projectId}/users`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ employeeId: targetEmployeeId, role })
      })

      if (response.ok) {
        await fetchAssignedUsers()
      } else {
        const result = await response.json().catch(() => ({}))
        alert(result.error || 'Failed to change this member\u2019s project role')
      }
    } catch (err) {
      console.error('Error setting project role:', err)
      alert('Failed to change this member\u2019s project role')
    } finally {
      setSettingRoleFor(null)
    }
  }

  const handleRemoveUserClick = async (targetEmployeeId: string, userName: string) => {
    setRemovingUserId(targetEmployeeId)
    try {
      // Fetch artifact counts for warning
      const response = await fetch(`/api/projects/${projectId}/users/${targetEmployeeId}/artifacts`)
      if (response.ok) {
        const result = await response.json()
        const { taskCount, bugCount } = result.data
        setRemovalWarning({ employeeId: targetEmployeeId, userName, taskCount, bugCount })
      } else {
        // If artifact count fetch fails, show warning with unknown counts
        setRemovalWarning({ employeeId: targetEmployeeId, userName, taskCount: -1, bugCount: -1 })
      }
    } catch (err) {
      console.error('Error fetching artifact counts:', err)
      setRemovalWarning({ employeeId: targetEmployeeId, userName, taskCount: -1, bugCount: -1 })
    } finally {
      setRemovingUserId(null)
    }
  }

  const confirmRemoveUser = async () => {
    if (!removalWarning) return

    try {
      const response = await fetch(`/api/projects/${projectId}/users`, {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ employeeId: removalWarning.employeeId })
      })

      if (response.ok) {
        await fetchAssignedUsers()
        setRemovalWarning(null)
      } else {
        const result = await response.json()
        alert(result.error || 'Failed to remove user')
      }
    } catch (err) {
      console.error('Error removing user:', err)
      alert('Failed to remove user')
    }
  }

  // Filter available users for the add-user dropdown
  const availableUsers = allUsers.filter(user =>
    user.status === 'active' &&
    !assignedUsers.some(au => au.employeeId === user.employeeId) &&
    (userSearchTerm === '' ||
      user.name.toLowerCase().includes(userSearchTerm.toLowerCase()) ||
      user.employeeId.toLowerCase().includes(userSearchTerm.toLowerCase()))
  )

  const handleEdit = () => {
    setIsEditing(true)
  }

  const handleCancelEdit = () => {
    if (project) {
      setEditData({
        projectName: project.projectName,
        description: project.description || '',
        status: project.status,
        releaseEnabled: project.releaseEnabled ?? false,
        releaseChecklist: project.releaseChecklist ?? EMPTY_CHECKLIST
      })
    }
    setIsEditing(false)
  }

  const handleSaveEdit = async () => {
    if (!editData.projectName.trim()) {
      alert('Project name is required')
      return
    }

    try {
      setSaving(true)

      // Release config is only meaningful for sub-projects; for main projects
      // omit it so the PUT never touches those columns.
      const isSubproject = project?.parentProjectId != null
      const { releaseEnabled, releaseChecklist, ...baseFields } = editData
      const payload = isSubproject
        ? {
            ...baseFields,
            releaseEnabled,
            releaseChecklist: releaseEnabled ? releaseChecklist : EMPTY_CHECKLIST,
            updatedBy: employeeId
          }
        : { ...baseFields, updatedBy: employeeId }

      const response = await fetch(`/api/projects/${projectId}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(payload)
      })

      if (!response.ok) {
        const data = await response.json()
        throw new Error(data.error || 'Failed to update project')
      }

      // Refresh project data
      await fetchProject()
      setIsEditing(false)
      alert('Project updated successfully')
    } catch (err) {
      console.error('Error updating project:', err)
      alert(err instanceof Error ? err.message : 'Failed to update project')
    } finally {
      setSaving(false)
    }
  }

  const handleDelete = async () => {
    if (!confirm('Are you sure you want to delete this project? This action cannot be undone.')) {
      return
    }

    try {
      setDeleting(true)

      const response = await fetch(`/api/projects/${projectId}`, {
        method: 'DELETE',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          deletedBy: employeeId
        })
      })

      if (!response.ok) {
        const data = await response.json()
        throw new Error(data.error || 'Failed to delete project')
      }

      // Redirect to projects list
      router.push('/projects')
    } catch (err) {
      console.error('Error deleting project:', err)
      alert(err instanceof Error ? err.message : 'Failed to delete project')
    } finally {
      setDeleting(false)
    }
  }

  const handleBack = () => {
    router.push('/projects')
  }

  const handleAddSubproject = () => {
    setSubprojectToEdit(null)
    setIsSubprojectModalOpen(true)
  }

  const handleSubprojectModalClose = () => {
    setIsSubprojectModalOpen(false)
    setSubprojectToEdit(null)
  }

  const handleSubprojectModalSuccess = () => {
    setIsSubprojectModalOpen(false)
    setSubprojectToEdit(null)
    fetchProject() // Refresh to show new subproject
  }

  // Only check permissions after hydration to avoid SSR/client mismatch
  const canManageProjects = isHydrated && (hasTabAccess(getCurrentUser(), 'projects') || userRole === 'admin' || userRole === 'top_management' || getCurrentUser()?.isPlatformAdmin)
  const canDelete = isHydrated && userRole === 'admin'

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 p-8">
        <div className="max-w-4xl mx-auto">
          <div className="text-center py-12">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto"></div>
            <p className="mt-4 text-gray-600">Loading project...</p>
          </div>
        </div>
      </div>
    )
  }

  if (accessRefused) {
    return (
      <div className="min-h-screen bg-gray-50 p-8">
        <div className="max-w-4xl mx-auto">
          <div className="bg-amber-50 border border-amber-200 rounded-lg p-6" role="alert">
            <h3 className="text-lg font-medium text-amber-900 mb-2">You can&rsquo;t open this project</h3>
            <p className="text-amber-800">{accessRefused}</p>
            <button
              onClick={handleBack}
              className="mt-4 text-sm text-amber-700 hover:text-amber-900 font-medium"
            >
              ← Back to Projects
            </button>
          </div>
        </div>
      </div>
    )
  }

  if (error || !project) {
    return (
      <div className="min-h-screen bg-gray-50 p-8">
        <div className="max-w-4xl mx-auto">
          <div className="bg-red-50 border border-red-200 rounded-lg p-6">
            <h3 className="text-lg font-medium text-red-900 mb-2">Error</h3>
            <p className="text-red-800">{error || 'Project not found'}</p>
            <button
              onClick={handleBack}
              className="mt-4 text-sm text-red-600 hover:text-red-800 font-medium"
            >
              ← Back to Projects
            </button>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gray-50 p-8">
      <div className="max-w-4xl mx-auto">
        {/* Header */}
        <div className="mb-8">
          <button
            onClick={handleBack}
            className="text-blue-600 hover:text-blue-800 mb-4 flex items-center gap-2"
          >
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
            </svg>
            Back to Projects
          </button>
        </div>

        {/* Project Info Card */}
        <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6 mb-6">
          {isEditing ? (
            /* Edit Mode */
            <div>
              <h2 className="text-xl font-bold text-gray-900 mb-4">Edit Project</h2>

              <div className="space-y-4">
                {/* Project Name */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Project Name *
                  </label>
                  <input
                    type="text"
                    value={editData.projectName}
                    onChange={(e) => setEditData({ ...editData, projectName: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                    placeholder="Enter project name"
                  />
                </div>

                {/* Description */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Description
                  </label>
                  <textarea
                    value={editData.description}
                    onChange={(e) => setEditData({ ...editData, description: e.target.value })}
                    rows={4}
                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                    placeholder="Enter project description"
                  />
                </div>

                {/* Status */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Status
                  </label>
                  <select
                    value={editData.status}
                    onChange={(e) => setEditData({ ...editData, status: e.target.value as 'Active' | 'Inactive' | 'Deleted' })}
                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                  >
                    <option value="Active">Active</option>
                    <option value="Inactive">Inactive</option>
                    <option value="Deleted">Deleted</option>
                  </select>
                </div>

                {/* Release configuration (sub-projects only) */}
                {project?.parentProjectId != null && (
                  <div className="border-t border-gray-200 pt-4 space-y-4">
                    <label className="flex items-center gap-3 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={editData.releaseEnabled}
                        onChange={(e) =>
                          setEditData({ ...editData, releaseEnabled: e.target.checked })
                        }
                        className="h-4 w-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                      />
                      <span className="text-sm font-medium text-gray-900">Release enabled</span>
                    </label>
                    <p className="text-sm text-gray-500">
                      Enable to allow creating release work-items for this sub-project and to define its release checklist.
                    </p>

                    {editData.releaseEnabled && (
                      <ReleaseChecklistEditor
                        value={editData.releaseChecklist}
                        onChange={(releaseChecklist) =>
                          setEditData({ ...editData, releaseChecklist })
                        }
                        onLoadDefault={() =>
                          setEditData({ ...editData, releaseChecklist: DEFAULT_RELEASE_CHECKLIST })
                        }
                      />
                    )}
                  </div>
                )}

                {/* Action Buttons */}
                <div className="flex items-center gap-3 pt-4">
                  <button
                    onClick={handleSaveEdit}
                    disabled={saving}
                    className="px-6 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 transition-colors disabled:bg-gray-400 disabled:cursor-not-allowed"
                  >
                    {saving ? 'Saving...' : 'Save Changes'}
                  </button>
                  <button
                    onClick={handleCancelEdit}
                    disabled={saving}
                    className="px-6 py-2 bg-gray-200 text-gray-700 rounded-md hover:bg-gray-300 transition-colors disabled:bg-gray-100 disabled:cursor-not-allowed"
                  >
                    Cancel
                  </button>
                </div>
              </div>
            </div>
          ) : (
            /* View Mode */
            <>
              <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between mb-4">
                <div className="flex-1">
                  <div className="flex items-center gap-3 mb-2">
                    <h1 className="text-3xl font-bold text-gray-900">{project.projectName}</h1>
                    <span className={`px-3 py-1 text-sm font-medium rounded-full ${project.status === 'Active'
                        ? 'bg-green-100 text-green-800'
                        : project.status === 'Inactive'
                          ? 'bg-yellow-100 text-yellow-800'
                          : 'bg-red-100 text-red-800'
                      }`}>
                      {project.status}
                    </span>
                  </div>

                  <p className="text-gray-600 text-sm">Project ID: {project.projectId}</p>
                </div>

                <div className="flex flex-wrap items-center gap-2 sm:gap-3">
                  <button
                    onClick={() => router.push(`/projects/${project.projectId}/requirements`)}
                    className="px-4 py-2 bg-indigo-600 text-white rounded-md hover:bg-indigo-700 transition-colors"
                  >
                    Requirements
                  </button>
                  <button
                    onClick={() => router.push(`/projects/${project.projectId}/credentials`)}
                    className="px-4 py-2 bg-gray-800 text-white rounded-md hover:bg-gray-900 transition-colors"
                  >
                    Credentials
                  </button>
                  {canManageProjects && (
                    <button
                      onClick={handleEdit}
                      className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 transition-colors"
                    >
                      Edit Project
                    </button>
                  )}
                  {canDelete && (
                    <button
                      onClick={handleDelete}
                      disabled={deleting}
                      className="px-4 py-2 bg-red-600 text-white rounded-md hover:bg-red-700 transition-colors disabled:bg-gray-400 disabled:cursor-not-allowed"
                    >
                      {deleting ? 'Deleting...' : 'Delete Project'}
                    </button>
                  )}
                </div>
              </div>

              {/* Description */}
              {project.description && (
                <div className="mb-4">
                  <h3 className="text-sm font-medium text-gray-700 mb-1">Description</h3>
                  <p className="text-gray-600">{project.description}</p>
                </div>
              )}
            </>
          )}

          {/* Metadata */}
          <div className="grid grid-cols-2 gap-4 pt-4 border-t border-gray-200">
            <div>
              <p className="text-sm text-gray-500">Created By</p>
              <p className="font-medium text-gray-900">{project.createdBy}</p>
            </div>
            <div>
              <p className="text-sm text-gray-500">Created At</p>
              <p className="font-medium text-gray-900">
                {formatDateTimeIST(project.createdAt)}
              </p>
            </div>
            {project.parentProjectId && (
              <div>
                <p className="text-sm text-gray-500">Parent Project</p>
                <p className="font-medium text-gray-900">{project.parentProjectId}</p>
              </div>
            )}
            <div>
              <p className="text-sm text-gray-500">Last Updated</p>
              <p className="font-medium text-gray-900">
                {formatDateTimeIST(project.updatedAt)}
              </p>
            </div>
          </div>
        </div>

        {/* Sub-Projects */}
        {!project.parentProjectId && (
          <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6 mb-6">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-xl font-bold text-gray-900">
                Sub-Projects {project.subProjects && `(${project.subProjects.length})`}
              </h2>
              {canManageProjects && (
                <button
                  onClick={handleAddSubproject}
                  className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 transition-colors"
                >
                  <Plus className="h-4 w-4" />
                  Add Subproject
                </button>
              )}
            </div>

            {project.subProjects && project.subProjects.length > 0 ? (
              <div className="space-y-3">
                {project.subProjects.map(subProject => (
                  <div
                    key={subProject.projectId}
                    className="border border-gray-200 rounded-lg p-4 hover:bg-gray-50 transition-colors cursor-pointer"
                    onClick={() => router.push(`/projects/${subProject.projectId}`)}
                  >
                    <div className="flex items-center justify-between">
                      <div>
                        <h3 className="font-semibold text-gray-900">{subProject.projectName}</h3>
                        <p className="text-sm text-gray-600 mt-1">{subProject.projectId}</p>
                      </div>
                      <span className={`px-2 py-1 text-xs font-medium rounded-full ${subProject.status === 'Active'
                          ? 'bg-green-100 text-green-800'
                          : 'bg-yellow-100 text-yellow-800'
                        }`}>
                        {subProject.status}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-gray-500 text-center py-8">No sub-projects yet. Click "Add Subproject" to create one.</p>
            )}
          </div>
        )}

        {/* Assigned Users */}
        <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6 mb-6">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2">
              <Users className="h-5 w-5 text-gray-700" />
              <h2 className="text-xl font-bold text-gray-900">
                Assigned Users {assignedUsers.length > 0 && `(${assignedUsers.length})`}
              </h2>
            </div>
            {canManageProjects && !isAddingUser && (
              <button
                onClick={() => setIsAddingUser(true)}
                className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 transition-colors text-sm"
              >
                <UserPlus className="h-4 w-4" />
                Add User
              </button>
            )}
          </div>

          {/* Add User Dropdown */}
          {isAddingUser && canManageProjects && (
            <div className="mb-4 border border-blue-200 rounded-lg p-4 bg-blue-50">
              <div className="flex items-center justify-between mb-3">
                <h3 className="text-sm font-medium text-gray-700">Assign a user to this project</h3>
                <button
                  onClick={() => { setIsAddingUser(false); setUserSearchTerm(''); setNewUserCanEditRequirements(false) }}
                  className="text-gray-400 hover:text-gray-600"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>
              <div className="relative mb-3">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
                <input
                  type="text"
                  value={userSearchTerm}
                  onChange={(e) => setUserSearchTerm(e.target.value)}
                  placeholder="Search by name or employee ID..."
                  className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-blue-500 text-sm"
                  autoFocus
                />
              </div>
              <label className="flex items-center gap-2 mb-3 text-sm text-gray-700 cursor-pointer">
                <input
                  type="checkbox"
                  checked={newUserCanEditRequirements}
                  onChange={(e) => setNewUserCanEditRequirements(e.target.checked)}
                  className="h-4 w-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                />
                Can edit requirements
              </label>
              <div className="max-h-48 overflow-y-auto space-y-1">
                {availableUsers.length > 0 ? (
                  availableUsers.slice(0, 10).map(user => (
                    <button
                      key={user.employeeId}
                      onClick={() => handleAssignUser(user.employeeId)}
                      className="w-full flex items-center gap-3 px-3 py-2 text-left hover:bg-blue-100 rounded-md transition-colors text-sm"
                    >
                      <div className="h-7 w-7 bg-blue-200 rounded-full flex items-center justify-center flex-shrink-0">
                        <span className="text-blue-700 font-medium text-xs">
                          {user.name.split(' ').map(n => n[0]).join('').toUpperCase()}
                        </span>
                      </div>
                      <div className="flex-1 min-w-0">
                        <span className="font-medium text-gray-900">{user.name}</span>
                        <span className="text-gray-500 ml-2">{user.employeeId}</span>
                      </div>
                      <span className="text-xs text-gray-500">{user.department}</span>
                    </button>
                  ))
                ) : (
                  <p className="text-sm text-gray-500 text-center py-3">
                    {userSearchTerm ? 'No matching users found' : 'All active users are already assigned'}
                  </p>
                )}
              </div>
            </div>
          )}

          {/* Assigned Users List */}
          {loadingAssignedUsers ? (
            <div className="text-center py-6">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mx-auto"></div>
              <p className="mt-2 text-sm text-gray-500">Loading assigned users...</p>
            </div>
          ) : assignedUsers.length > 0 ? (
            <div className="space-y-2">
              {assignedUsers.map((au) => (
                <div
                  key={au.employeeId}
                  className="flex items-center justify-between px-4 py-3 border border-gray-200 rounded-lg hover:bg-gray-50"
                >
                  <div className="flex items-center gap-3">
                    <div className="h-8 w-8 bg-blue-100 rounded-full flex items-center justify-center flex-shrink-0">
                      <span className="text-blue-600 font-medium text-xs">
                        {au.userName.split(' ').map((n: string) => n[0]).join('').toUpperCase()}
                      </span>
                    </div>
                    <div>
                      <span className="font-medium text-gray-900">{au.userName}</span>
                      <span className="text-sm text-gray-500 ml-2">{au.employeeId}</span>
                    </div>
                    {/* Role in THIS project — what actually grants authority here.
                        The badge used to show the global users.role, which says
                        nothing about what someone may do on this project. */}
                    <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${
                      au.role === 'manager' ? 'bg-purple-100 text-purple-800' :
                      au.role === 'team_leader' ? 'bg-blue-100 text-blue-800' :
                      'bg-gray-100 text-gray-800'
                    }`}>
                      {au.role === 'team_leader' ? 'team leader' : au.role || 'member'}
                    </span>
                    <span className="text-xs text-gray-400" title="Global role">
                      {au.userRole}
                    </span>
                    {au.userDepartment && (
                      <span className="text-xs text-gray-500">{au.userDepartment}</span>
                    )}
                  </div>
                  <div className="flex items-center gap-3">
                    {canManageProjects && (
                      <select
                        value={au.role || 'member'}
                        disabled={settingRoleFor === au.employeeId}
                        onChange={(e) => handleSetProjectRole(au.employeeId, e.target.value)}
                        className="border border-gray-300 rounded px-2 py-1 text-xs disabled:opacity-50"
                        title="Role in this project: a manager runs it, a team leader may change its secrets"
                      >
                        <option value="member">Member</option>
                        <option value="team_leader">Team leader</option>
                        <option value="manager">Manager</option>
                      </select>
                    )}
                    {canManageProjects && (
                      <label
                        className="flex items-center gap-1.5 text-xs text-gray-600 cursor-pointer"
                        title="Allow this user to edit requirements in this project"
                      >
                        <input
                          type="checkbox"
                          checked={au.canEditRequirements}
                          disabled={togglingReqEditId === au.employeeId}
                          onChange={(e) => handleToggleRequirementsEdit(au.employeeId, e.target.checked)}
                          className="h-3.5 w-3.5 rounded border-gray-300 text-blue-600 focus:ring-blue-500 disabled:opacity-50"
                        />
                        Req. edit
                      </label>
                    )}
                    <span className="text-xs text-gray-400">
                      {new Date(au.assignedAt).toLocaleDateString()}
                    </span>
                    {canManageProjects && (
                      <button
                        onClick={() => handleRemoveUserClick(au.employeeId, au.userName)}
                        disabled={removingUserId === au.employeeId}
                        className="text-red-400 hover:text-red-600 p-1 rounded transition-colors disabled:opacity-50"
                        title="Remove user from project"
                      >
                        <X className="h-4 w-4" />
                      </button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-gray-500 text-center py-6">
              No users assigned to this project yet.
              {canManageProjects && ' Click "Add User" to assign team members.'}
            </p>
          )}
        </div>

        {/* Removal Warning Modal */}
        {removalWarning && (
          <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
            <div className="bg-white rounded-lg shadow-xl p-6 max-w-md w-full mx-4">
              <div className="flex items-center gap-3 mb-4">
                <div className="h-10 w-10 bg-yellow-100 rounded-full flex items-center justify-center">
                  <AlertTriangle className="h-5 w-5 text-yellow-600" />
                </div>
                <h3 className="text-lg font-semibold text-gray-900">Remove User</h3>
              </div>

              <p className="text-gray-700 mb-4">
                {removalWarning.taskCount >= 0 && removalWarning.bugCount >= 0 ? (
                  <>
                    <strong>{removalWarning.userName}</strong> has{' '}
                    <strong>{removalWarning.taskCount} task{removalWarning.taskCount !== 1 ? 's' : ''}</strong> and{' '}
                    <strong>{removalWarning.bugCount} bug{removalWarning.bugCount !== 1 ? 's' : ''}</strong> in this project.
                    They will retain those assignments but lose project access.
                  </>
                ) : (
                  <>
                    Remove <strong>{removalWarning.userName}</strong> from this project?
                    They will lose project access but retain any task/bug assignments.
                  </>
                )}
              </p>

              <div className="flex justify-end gap-3">
                <button
                  onClick={() => setRemovalWarning(null)}
                  className="px-4 py-2 bg-gray-200 text-gray-700 rounded-md hover:bg-gray-300 transition-colors text-sm"
                >
                  Cancel
                </button>
                <button
                  onClick={confirmRemoveUser}
                  className="px-4 py-2 bg-red-600 text-white rounded-md hover:bg-red-700 transition-colors text-sm"
                >
                  Remove User
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Info Box */}
        <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
          <h4 className="font-medium text-blue-900 mb-2">Project Management</h4>
          <ul className="text-sm text-blue-800 space-y-1">
            <li>• Tasks and bugs can be assigned to this project</li>
            <li>• Only admin can delete projects</li>
            <li>• Projects with sub-projects cannot be deleted</li>
            {!project.parentProjectId && (
              <li>• This is a main project and can have sub-projects</li>
            )}
            {project.parentProjectId && (
              <li>• This is a sub-project and cannot have further sub-projects</li>
            )}
          </ul>
        </div>
      </div>

      {/* Subproject Modal */}
      {isSubprojectModalOpen && (
        <ProjectModal
          project={subprojectToEdit}
          employeeId={employeeId}
          parentProjectId={project.projectId}  // Pre-select current project as parent
          onClose={handleSubprojectModalClose}
          onSuccess={handleSubprojectModalSuccess}
        />
      )}
    </div>
  )
}

