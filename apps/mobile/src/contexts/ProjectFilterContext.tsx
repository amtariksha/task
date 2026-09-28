import React, { createContext, useContext, useState, useEffect, ReactNode, useCallback } from 'react'
import AsyncStorage from '@react-native-async-storage/async-storage'
import { get } from '../services/apiClient'

export interface Project {
  id: string
  projectId: string
  projectName: string
  description?: string
  parentProjectId?: string
}

interface ProjectFilterContextType {
  selectedProjectIds: string[]
  setSelectedProjectIds: (ids: string[]) => void
  projects: Project[]
  isLoading: boolean
  error: string | null
  refreshProjects: () => Promise<void>
  /**
   * Forget the current selection and reload the project list. Called after a
   * company switch: the saved project IDs belong to the previous company, so
   * leaving them in place filtered every screen by projects the new session
   * cannot even see.
   */
  resetForCompanySwitch: () => Promise<void>
}

const ProjectFilterContext = createContext<ProjectFilterContextType | undefined>(undefined)

export function ProjectFilterProvider({ children }: { children: ReactNode }) {
  const [selectedProjectIds, setSelectedProjectIdsState] = useState<string[]>([])
  const [projects, setProjects] = useState<Project[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [isHydrated, setIsHydrated] = useState(false)

  // Fetch active main projects
  const fetchProjects = useCallback(async () => {
    try {
      setIsLoading(true)
      setError(null)
      const data = await get('/api/projects?type=main')
      if (Array.isArray(data)) {
        setProjects(data)
      } else if (data && Array.isArray((data as any).data)) {
        setProjects((data as any).data)
      } else {
        setProjects([])
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load projects')
    } finally {
      setIsLoading(false)
    }
  }, [])

  // Load selected projects from AsyncStorage on mount
  useEffect(() => {
    const loadSavedProjects = async () => {
      try {
        const saved = await AsyncStorage.getItem('selectedProjectIds')
        if (saved) {
          setSelectedProjectIdsState(JSON.parse(saved))
        }
      } catch (e) {
        console.error('Failed to load selected projects from AsyncStorage', e)
      } finally {
        setIsHydrated(true)
      }
    }
    loadSavedProjects()
    fetchProjects()
  }, [fetchProjects])

  // Update selected projects and persist to AsyncStorage
  const setSelectedProjectIds = useCallback(async (ids: string[]) => {
    setSelectedProjectIdsState(ids)
    try {
      await AsyncStorage.setItem('selectedProjectIds', JSON.stringify(ids))
    } catch (e) {
      console.error('Failed to save selected projects to AsyncStorage', e)
    }
  }, [])

  const resetForCompanySwitch = useCallback(async () => {
    setSelectedProjectIdsState([])
    try {
      await AsyncStorage.removeItem('selectedProjectIds')
    } catch (e) {
      console.error('Failed to clear selected projects from AsyncStorage', e)
    }
    await fetchProjects()
  }, [fetchProjects])

  return (
    <ProjectFilterContext.Provider
      value={{
        selectedProjectIds,
        setSelectedProjectIds,
        projects,
        isLoading: isLoading || !isHydrated,
        error,
        refreshProjects: fetchProjects,
        resetForCompanySwitch,
      }}
    >
      {children}
    </ProjectFilterContext.Provider>
  )
}

export function useProjectFilter() {
  const context = useContext(ProjectFilterContext)
  if (context === undefined) {
    throw new Error('useProjectFilter must be used within a ProjectFilterProvider')
  }
  return context
}
