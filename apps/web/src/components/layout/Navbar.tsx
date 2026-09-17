'use client'

import { useState, useEffect, useRef } from 'react'
import { useRouter, usePathname } from 'next/navigation'
import { useQuery } from '@apollo/client/react'
import Link from 'next/link'
import Image from 'next/image'
import { logout, getCurrentUser, getRoleDisplayName } from '@/lib/auth'
import CompanySwitcher from './CompanySwitcher'
import { User as UserType } from '@/lib/types'
import { hasTabAccess } from '@/lib/permissions'
import NotificationBell from './NotificationBell'
import { useProjectFilter } from '@/contexts/ProjectFilterContext'
import { ME_IS_FOUNDER } from '@/lib/founder-queries'
import {
  Menu,
  X,
  User,
  LogOut,
  Home,
  Briefcase,
  Bug,
  CheckSquare,
  Calendar,
  FileText,
  ChevronDown,
  Laptop,
  Settings,
  Users,
  Shield,
  FolderKanban,
  ListTodo,
  Code,
  UserCog,
  MessageSquare,
  ClipboardCheck,
  Trash2,
  BarChart3,
  ChevronLeft,
  ChevronRight,
  Sun,
  Moon,
  Sunrise
} from 'lucide-react'

interface MeIsFounderData { me: { employeeId: string; isFounder: boolean | null } | null }

export default function Navbar() {
  const [isMenuOpen, setIsMenuOpen] = useState(false)
  const [activeCategory, setActiveCategory] = useState<string | null>(null)
  const [currentUser, setCurrentUser] = useState<UserType | null>(null)
  const [isClient, setIsClient] = useState(false)
  const router = useRouter()
  const pathname = usePathname()
  const scrollContainerRef = useRef<HTMLDivElement>(null)
  const [hasOverflow, setHasOverflow] = useState(false)
  const [isDark, setIsDark] = useState(false)

  // Project Filtering Context & Dropdown State
  const { selectedProjectIds, setSelectedProjectIds, projects, isLoading: isProjectsLoading } = useProjectFilter()
  const [isProjectDropdownOpen, setIsProjectDropdownOpen] = useState(false)
  const dropdownRef = useRef<HTMLDivElement>(null)

  // Handle click outside to close project dropdown
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsProjectDropdownOpen(false)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  const scroll = (direction: 'left' | 'right') => {
    if (scrollContainerRef.current) {
      const scrollAmount = 200
      const newScrollLeft = direction === 'left'
        ? scrollContainerRef.current.scrollLeft - scrollAmount
        : scrollContainerRef.current.scrollLeft + scrollAmount

      scrollContainerRef.current.scrollTo({
        left: newScrollLeft,
        behavior: 'smooth'
      })
    }
  }

  useEffect(() => {
    setIsClient(true)
    setCurrentUser(getCurrentUser())
    setIsDark(document.documentElement.classList.contains('dark'))
  }, [])

  // The stored login user only knows isPlatformAdmin; founders listed in
  // FOUNDER_EMPLOYEE_IDS are known to the server alone, so ask it (once per session).
  const { data: founderData } = useQuery<MeIsFounderData>(ME_IS_FOUNDER, {
    skip: !currentUser || currentUser.isPlatformAdmin === true,
    fetchPolicy: 'cache-first',
  })
  const showFounderStart = currentUser?.isPlatformAdmin === true
    || (founderData?.me?.isFounder === true && founderData.me.employeeId === currentUser?.employeeId)

  const toggleTheme = () => {
    const newTheme = !isDark
    setIsDark(newTheme)
    if (newTheme) {
      document.documentElement.classList.add('dark')
      localStorage.setItem('themeMode', 'dark')
    } else {
      document.documentElement.classList.remove('dark')
      localStorage.setItem('themeMode', 'light')
    }
  }

  // Navigation Structure with permission keys
  const allNavigationItems = [
    {
      label: 'Home',
      href: '/home',
      icon: Home,
      key: 'home'
    },
    {
      label: 'Feed',
      href: '/feed',
      icon: MessageSquare,
      key: 'feed',
      children: [
        { label: 'Show Feed', href: '/feed', icon: MessageSquare, key: 'feed' },
        { label: 'Create Post', href: '/feed?create=true', icon: FileText, key: 'feed' },
      ]
    },
    {
      label: 'Work',
      icon: Briefcase,
      key: 'work_group', // Virtual key for grouping
      children: [
        { label: 'Start', href: '/start', icon: Sunrise, key: 'founder_start' },
        { label: 'Dashboard', href: '/dashboard', icon: Briefcase, key: 'home' }, // Dashboard usually accessible with home or specific key
        { label: 'Your Work', href: '/your-work', icon: ListTodo, key: 'your_work' },
        { label: 'Team Tasks', href: '/team-tasks', icon: Users, key: 'team_tasks' },
        { label: 'Tasks', href: '/tasks', icon: CheckSquare, key: 'tasks' },
        { label: 'Development', href: '/bugs', icon: Bug, key: 'bugs' },
        // Requirements sits alongside Development; visible to all members (any
        // project member may view a project's requirements — see filter below).
        { label: 'Requirements', href: '/requirements', icon: FileText, key: 'requirements' },
      ]
    },
    {
      label: 'Attendance',
      icon: Calendar,
      key: 'attendance_group', // Virtual key
      children: [
        { label: 'Leave', href: '/leave/apply', icon: Calendar, key: 'leaves' },
        { label: 'WFH', href: '/wfh/apply', icon: Laptop, key: 'wfh' },
        { label: 'Applications', href: '/my-applications', icon: FileText, key: 'leaves' }, // Grouped with leaves
      ]
    },
    {
      label: 'Admin',
      icon: Shield,
      key: 'admin_group',
      children: [
        { label: 'Projects', href: '/projects', icon: FolderKanban, key: 'projects' },
        { label: 'User Management', href: '/users', icon: UserCog, key: 'user_management' },
        { label: 'Feed Topics', href: '/feed-topics', icon: MessageSquare, key: 'feed_topics' },
        { label: 'Approvals', href: '/approvals', icon: ClipboardCheck, key: 'approvals' },
        { label: 'Settings', href: '/settings', icon: Settings, key: 'settings' },
        { label: 'Deleted Items', href: '/deleted-items', icon: Trash2, key: 'deleted_items' },
        { label: 'Reports', href: '/reports', icon: BarChart3, key: 'reports' },
      ]
    },
    {
      label: 'Account',
      href: '/profile',
      icon: User,
      key: 'profile' // Always accessible
    }
  ]

  // Filter navigation items based on permissions
  const navigationItems = allNavigationItems.map(item => {
    // If it has children, filter them
    if (item.children) {
      const filteredChildren = item.children.filter(child =>
        // 'requirements' is visible to every authenticated user (project-level
        // access is enforced on the page). Otherwise gate by tab access.
        // 'founder_start' is not a tab permission: only the founder (or platform admin) sees it; /start re-checks on the server.
        child.key === 'founder_start'
          ? showFounderStart
          : child.key === 'requirements' ? true : (child.key ? hasTabAccess(currentUser, child.key) : true)
      )

      // If no children left, return null (unless it's a group that should show empty? No, hide it)
      if (filteredChildren.length === 0) return null

      return { ...item, children: filteredChildren }
    }

    // 'profile' (Account) is always accessible.
    if (item.key === 'profile') return item

    // Check access for other items
    if (item.key && hasTabAccess(currentUser, item.key)) {
      return item
    }

    return null
  }).filter(Boolean) as typeof allNavigationItems

  // Calculate active sub-items
  const activeSubItems = navigationItems.find(item => item.label === activeCategory)?.children || []

  // Detect overflow in sub-menu
  useEffect(() => {
    const checkOverflow = () => {
      if (scrollContainerRef.current) {
        const { scrollWidth, clientWidth } = scrollContainerRef.current
        setHasOverflow(scrollWidth > clientWidth)
      }
    }

    checkOverflow()
    window.addEventListener('resize', checkOverflow)
    return () => window.removeEventListener('resize', checkOverflow)
  }, [activeSubItems])

  // Determine active category based on pathname or hover
  useEffect(() => {
    if (!activeCategory) {
      const currentItem = navigationItems.find(item =>
        item.children?.some(child => pathname === child.href)
      )
      if (currentItem) {
        setActiveCategory(currentItem.label)
      }
    }
  }, [pathname, navigationItems])

  // Show skeleton navbar while loading to prevent flickering
  if (!isClient || !currentUser) {
    return (
      <nav className="bg-white shadow-sm border-b border-gray-200 page-transition">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between h-16">
            <div className="flex items-center">
              <div className="flex-shrink-0 flex items-center">
                <div className="h-8 w-8 bg-gray-200 rounded skeleton-pulse"></div>
                <div className="ml-2 h-6 w-24 bg-gray-200 rounded skeleton-pulse"></div>
              </div>
            </div>
            <div className="flex items-center space-x-4">
              <div className="h-8 w-20 bg-gray-200 rounded skeleton-pulse"></div>
              <div className="h-8 w-8 bg-gray-200 rounded-full skeleton-pulse"></div>
            </div>
          </div>
        </div>
      </nav>
    )
  }

  const handleLogout = async () => {
    await logout()
    router.push('/')
  }

  return (
    <nav
      className="sticky top-0 z-[99999] bg-white shadow-sm border-b border-gray-200 backdrop-blur-sm bg-white/95"
      onMouseLeave={() => {
        // Reset to current path's category on leave, or keep null if top level
        const currentItem = navigationItems.find(item =>
          item.children?.some(child => pathname === child.href)
        )
        setActiveCategory(currentItem ? currentItem.label : null)
      }}
    >
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        {/* Top Header Row */}
        <div className="flex justify-between items-center h-16">
          {/* Logo and Title */}
          <div className="flex items-center">
            <Link href="/home" className="flex items-center space-x-3">
              <div className="h-12 flex items-center justify-center">
                <Image
                  src="/images/logos/amtariksha_logo.png"
                  alt="Karmayog Logo"
                  width={1021}
                  height={244}
                  className="h-12 w-auto object-contain dark:brightness-100 brightness-0 transition-all"
                  priority
                />
              </div>
              {currentUser.role !== 'amtarikshian' && (
                <div className="border-l border-gray-300 dark:border-neutral-700 pl-3 ml-1 h-8 flex items-center">
                  <p className="text-xs text-gray-600 dark:text-neutral-400 font-medium">{getRoleDisplayName(currentUser.role)}</p>
                </div>
              )}
            </Link>
          </div>

          {/* User Menu */}
          <div className="flex items-center space-x-4">
            {/* Company switcher — renders nothing unless the user belongs to more than one */}
            {isClient && currentUser && <CompanySwitcher />}

            {/* Project Filter Dropdown */}
            {isClient && currentUser && (
              <div className="relative mr-2" ref={dropdownRef}>
                <button
                  onClick={() => setIsProjectDropdownOpen(!isProjectDropdownOpen)}
                  className="flex items-center space-x-2 px-3 py-1.5 bg-gray-50 dark:bg-neutral-800 hover:bg-gray-100 dark:hover:bg-neutral-700 border border-gray-200 dark:border-neutral-700 rounded-lg text-sm font-medium text-gray-700 dark:text-gray-200 transition-colors"
                >
                  <FolderKanban className="h-4 w-4 text-gray-500 dark:text-gray-400" />
                  <span className="hidden sm:inline">Projects</span>
                  {selectedProjectIds.length > 0 ? (
                    <span className="bg-primary text-white text-xs px-2 py-0.5 rounded-full font-bold">
                      {selectedProjectIds.length}
                    </span>
                  ) : (
                    <span className="text-gray-400 dark:text-gray-500 text-xs">(All)</span>
                  )}
                  <ChevronDown className={`h-3 w-3 text-gray-500 dark:text-gray-400 transition-transform ${isProjectDropdownOpen ? 'rotate-180' : ''}`} />
                </button>

                {isProjectDropdownOpen && (
                  <div className="absolute right-0 mt-2 w-64 bg-white dark:bg-neutral-900 border border-gray-200 dark:border-neutral-800 rounded-lg shadow-lg z-[99999] py-2">
                    <div className="px-3 py-1.5 border-b border-gray-100 dark:border-neutral-800 flex justify-between items-center">
                      <span className="text-xs font-semibold text-gray-500 dark:text-gray-400">Filter Projects</span>
                      <div className="flex space-x-2">
                        <button
                          onClick={() => setSelectedProjectIds([])}
                          className="text-[11px] text-primary hover:underline font-medium"
                        >
                          Clear
                        </button>
                        <button
                          onClick={() => setSelectedProjectIds(projects.map(p => p.projectId))}
                          className="text-[11px] text-primary hover:underline font-medium"
                        >
                          Select All
                        </button>
                      </div>
                    </div>
                    <div className="max-h-60 overflow-y-auto px-1 py-1">
                      {isProjectsLoading ? (
                        <div className="text-center py-4 text-xs text-gray-400 dark:text-gray-500">Loading projects...</div>
                      ) : projects.length === 0 ? (
                        <div className="text-center py-4 text-xs text-gray-400 dark:text-gray-500">No projects found</div>
                      ) : (
                        projects.map((project) => {
                          const isSelected = selectedProjectIds.includes(project.projectId)
                          return (
                            <button
                              // Use project.projectId as the key instead of project.id.
                              // The API returns 'projectId' as the primary key. Using 'project.id' (undefined)
                              // would cause duplicate keys, leading to React reconciliation issues.
                              key={project.projectId}
                              onClick={() => {
                                if (isSelected) {
                                  setSelectedProjectIds(selectedProjectIds.filter(id => id !== project.projectId))
                                } else {
                                  setSelectedProjectIds([...selectedProjectIds, project.projectId])
                                }
                              }}
                              className={`w-full flex items-center space-x-2.5 px-3 py-2 text-left text-sm rounded-md transition-colors ${
                                isSelected
                                  ? 'bg-primary/5 dark:bg-primary/10 text-primary font-medium'
                                  : 'text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-neutral-800'
                              }`}
                            >
                              <input
                                type="checkbox"
                                checked={isSelected}
                                readOnly
                                className="h-4 w-4 rounded border-gray-300 dark:border-neutral-700 text-primary focus:ring-primary cursor-pointer"
                              />
                              <span className="truncate">{project.projectName}</span>
                            </button>
                          )
                        })
                      )}
                    </div>
                  </div>
                )}
              </div>
            )}

            <div className="hidden md:block text-right">
              <p className="text-sm font-medium text-black">{currentUser.name}</p>
              <p className="text-xs text-gray-600">{currentUser.employeeId}</p>
            </div>

            {/* Notification Bell */}
            <NotificationBell />

            {/* Theme Toggle */}
            <button
              onClick={toggleTheme}
              className="p-2 text-black dark:text-white hover:bg-gray-100 dark:hover:bg-neutral-800 rounded-full transition-colors duration-150"
              aria-label="Toggle theme"
            >
              {isDark ? <Sun className="h-5 w-5" /> : <Moon className="h-5 w-5" />}
            </button>

            <button
              onClick={handleLogout}
              className="flex items-center space-x-1 text-black hover:text-gray-600 px-3 py-2 rounded-md text-sm font-medium transition-colors"
            >
              <LogOut className="h-4 w-4" />
              <span className="hidden md:inline">Logout</span>
            </button>

            {/* Mobile menu button */}
            <button
              onClick={() => setIsMenuOpen(!isMenuOpen)}
              className="md:hidden p-2 rounded-md text-black hover:text-primary"
            >
              {isMenuOpen ? <X className="h-6 w-6" /> : <Menu className="h-6 w-6" />}
            </button>
          </div>
        </div>

        {/* Navigation Tabs Row - Desktop */}
        <div className="hidden md:block border-t border-gray-100">
          <div className="flex flex-col">
            {/* Level 1: Main Categories */}
            <div className="flex items-center justify-center space-x-1 py-3 overflow-x-auto scrollbar-hide">
              {navigationItems.map((item) => {
                const Icon = item.icon
                // Active if it's the current category being hovered/viewed OR if one of its children is active (and no other category is hovered)
                const isActive = activeCategory === item.label || (!activeCategory && item.href === pathname)

                return (
                  <div
                    key={item.label}
                    onMouseEnter={() => setActiveCategory(item.label)}
                    className="relative"
                  >
                    {item.children ? (
                      <button
                        className={`flex items-center space-x-2 px-3 py-2 rounded-lg text-sm font-medium transition-all duration-300 whitespace-nowrap transform hover:scale-105 ${isActive
                          ? 'bg-primary text-white shadow-md border border-primary-600 scale-105'
                          : 'text-text-secondary hover:text-primary dark:hover:text-white hover:bg-gray-50 dark:hover:bg-neutral-800'
                          }`}
                      >
                        <Icon className="h-4 w-4" />
                        <span className="hidden lg:inline">{item.label}</span>
                        <span className="lg:hidden">{item.label.split(' ')[0]}</span>
                        <ChevronDown className={`h-3 w-3 transition-transform duration-300 ${isActive ? 'rotate-180' : ''}`} />
                      </button>
                    ) : (
                      <Link
                        href={item.href!}
                        className={`flex items-center space-x-2 px-3 py-2 rounded-lg text-sm font-medium transition-all duration-300 whitespace-nowrap transform hover:scale-105 ${isActive
                          ? 'bg-primary text-white shadow-md border border-primary-600 scale-105'
                          : 'text-text-secondary hover:text-primary dark:hover:text-white hover:bg-gray-50 dark:hover:bg-neutral-800'
                          }`}
                        onMouseEnter={() => setActiveCategory(null)} // Clear sub-menu when hovering a leaf item
                      >
                        <Icon className="h-4 w-4" />
                        <span className="hidden lg:inline">{item.label}</span>
                        <span className="lg:hidden">{item.label.split(' ')[0]}</span>
                      </Link>
                    )}
                  </div>
                )
              })}
            </div>

            {/* Level 2: Sub-menu (Horizontal Accordion) */}
            <div
              className={`overflow-hidden transition-all duration-300 ease-in-out bg-bg-secondary rounded-b-lg ${activeSubItems.length > 0 ? 'max-h-16 opacity-100 border-t border-border-primary' : 'max-h-0 opacity-0'
                }`}
            >
              <div className="relative group px-8">
                {/* Left Scroll Button - only show when overflow */}
                {hasOverflow && (
                  <button
                    onClick={() => scroll('left')}
                    className="absolute left-0 top-1/2 -translate-y-1/2 z-10 p-1 bg-white dark:bg-neutral-800 rounded-full shadow-md text-text-secondary hover:text-primary dark:hover:text-white hover:bg-gray-50 dark:hover:bg-neutral-700 opacity-0 group-hover:opacity-100 transition-opacity disabled:opacity-0"
                  >
                    <ChevronLeft className="h-4 w-4" />
                  </button>
                )}

                <div
                  ref={scrollContainerRef}
                  className={`flex items-center space-x-6 py-2 overflow-x-auto scrollbar-hide scroll-smooth ${hasOverflow ? 'justify-start' : 'justify-center'
                    }`}
                >
                  {activeSubItems.map((child) => {
                    const ChildIcon = child.icon
                    const isChildActive = pathname === child.href
                    return (
                      <Link
                        key={child.href}
                        href={child.href}
                        className={`flex items-center space-x-2 px-3 py-1.5 rounded-md text-sm font-medium transition-colors whitespace-nowrap ${isChildActive
                          ? 'text-primary bg-white dark:bg-neutral-800 shadow-sm border border-neutral-200 dark:border-neutral-700'
                          : 'text-text-secondary hover:text-primary dark:hover:text-white hover:bg-neutral-100 dark:hover:bg-neutral-800/50'
                          }`}
                      >
                        <ChildIcon className="h-3.5 w-3.5" />
                        <span>{child.label}</span>
                      </Link>
                    )
                  })}
                </div>

                {/* Right Scroll Button - only show when overflow */}
                {hasOverflow && (
                  <button
                    onClick={() => scroll('right')}
                    className="absolute right-0 top-1/2 -translate-y-1/2 z-10 p-1 bg-white dark:bg-neutral-800 rounded-full shadow-md text-text-secondary hover:text-primary dark:hover:text-white hover:bg-gray-50 dark:hover:bg-neutral-700 opacity-0 group-hover:opacity-100 transition-opacity"
                  >
                    <ChevronRight className="h-4 w-4" />
                  </button>
                )}
              </div>
            </div>
          </div>
        </div>

        {/* Mobile Navigation Menu (Expanded) */}
        {isMenuOpen && (
          <div className="md:hidden py-4 border-t border-gray-200 pb-24">
            <div className="space-y-2">
              {navigationItems.map((item) => {
                const Icon = item.icon
                const isActive = item.href ? pathname === item.href : item.children?.some(child => pathname === child.href)

                if (item.children) {
                  const isExpanded = activeCategory === item.label
                  return (
                    <div key={item.label} className="space-y-1">
                      <button
                        onClick={() => setActiveCategory(isExpanded ? null : item.label)}
                        className={`w-full flex items-center justify-between px-4 py-3 rounded-lg text-sm font-medium transition-colors ${isActive
                          ? 'bg-primary text-black shadow-sm'
                          : 'text-gray-600 hover:text-black hover:bg-gray-50'
                          }`}
                      >
                        <div className="flex items-center space-x-3">
                          <Icon className="h-4 w-4" />
                          <span>{item.label}</span>
                        </div>
                        <ChevronDown className={`h-4 w-4 transition-transform ${isExpanded ? 'rotate-180' : ''}`} />
                      </button>

                      {isExpanded && (
                        <div className="ml-4 space-y-1 border-l-2 border-gray-200 pl-4">
                          {item.children.map((child) => {
                            const ChildIcon = child.icon
                            const isChildActive = pathname === child.href
                            return (
                              <Link
                                key={child.href}
                                href={child.href}
                                className={`flex items-center space-x-3 px-4 py-2.5 rounded-lg text-sm font-medium transition-colors ${isChildActive
                                  ? 'bg-primary text-black shadow-sm'
                                  : 'text-gray-600 hover:text-black hover:bg-gray-50'
                                  }`}
                                onClick={() => setIsMenuOpen(false)}
                              >
                                <ChildIcon className="h-4 w-4" />
                                <span>{child.label}</span>
                              </Link>
                            )
                          })}
                        </div>
                      )}
                    </div>
                  )
                }

                return (
                  <Link
                    key={item.href}
                    href={item.href!}
                    className={`flex items-center space-x-3 px-4 py-3 rounded-lg text-sm font-medium transition-colors ${isActive
                      ? 'bg-primary text-black shadow-sm'
                      : 'text-gray-600 hover:text-black hover:bg-gray-50'
                      }`}
                    onClick={() => setIsMenuOpen(false)}
                  >
                    <Icon className="h-4 w-4" />
                    <span>{item.label}</span>
                  </Link>
                )
              })}

              {/* Mobile theme toggle */}
              <button
                onClick={toggleTheme}
                className="w-full flex items-center justify-between px-4 py-3 rounded-lg text-sm font-medium text-gray-600 hover:text-black dark:text-gray-300 dark:hover:text-white hover:bg-gray-50 dark:hover:bg-neutral-800 transition-colors"
              >
                <div className="flex items-center space-x-3">
                  {isDark ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
                  <span>{isDark ? 'Light Mode' : 'Dark Mode'}</span>
                </div>
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Bottom Tab Bar (Mobile Only) */}
      <div className="md:hidden fixed bottom-0 left-0 right-0 bg-white border-t border-gray-200 px-4 py-2 z-[99999] flex justify-between items-center safe-area-bottom">
        <Link
          href="/feed"
          className={`flex flex-col items-center p-2 ${pathname === '/feed' ? 'text-primary' : 'text-gray-500'}`}
        >
          <MessageSquare className="h-6 w-6" />
          <span className="text-[10px] mt-1">Feed</span>
        </Link>

        <Link
          href="/tasks"
          className={`flex flex-col items-center p-2 ${pathname === '/tasks' ? 'text-primary' : 'text-gray-500'}`}
        >
          <CheckSquare className="h-6 w-6" />
          <span className="text-[10px] mt-1">Tasks</span>
        </Link>

        <Link
          href="/home"
          className="flex flex-col items-center justify-center -mt-8"
        >
          <div className={`flex items-center justify-center h-14 w-14 rounded-full shadow-lg ${pathname === '/home' || pathname === '/dashboard' ? 'bg-primary text-white' : 'bg-white text-primary border border-gray-200'}`}>
            <Home className="h-7 w-7" />
          </div>
          <span className="text-[10px] mt-1 font-medium">Home</span>
        </Link>

        <Link
          href="/bugs"
          className={`flex flex-col items-center p-2 ${pathname === '/bugs' ? 'text-primary' : 'text-gray-500'}`}
        >
          <Bug className="h-6 w-6" />
          <span className="text-[10px] mt-1">Dev</span>
        </Link>

        <button
          onClick={() => setIsMenuOpen(!isMenuOpen)}
          className={`flex flex-col items-center p-2 ${isMenuOpen ? 'text-primary' : 'text-gray-500'}`}
        >
          <Menu className="h-6 w-6" />
          <span className="text-[10px] mt-1">Menu</span>
        </button>
      </div>
    </nav>
  )
}
