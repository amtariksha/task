import React, { useEffect, useState, useCallback, Component, ErrorInfo, ReactNode, useRef } from 'react'
import { GestureHandlerRootView } from 'react-native-gesture-handler'
import { NavigationContainer, NavigationContainerRef, DefaultTheme as NavigationLightTheme, DarkTheme as NavigationDarkTheme } from '@react-navigation/native'
import type { NavigationState } from '@react-navigation/native'
import { createNativeStackNavigator } from '@react-navigation/native-stack'
import { ApolloProvider, useQuery } from '@apollo/client/react'
import { AuthContext } from './contexts/AuthContext'
import LoginScreen from './screens/LoginScreen'
import PinSetupScreen from './screens/PinSetupScreen'
import PinLockScreen from './screens/PinLockScreen'
import DashboardScreen from './screens/DashboardScreen'
import HomeScreen from './screens/HomeScreen'
import BugListScreen from './screens/BugListScreen'
import BugDetailsScreen from './screens/BugDetailsScreen'
import CreateBugScreen from './screens/CreateBugScreen'
import TaskListScreen from './screens/TaskListScreen'
import TaskDetailsScreen from './screens/TaskDetailsScreen'
import CreateTaskScreen from './screens/CreateTaskScreen'
import SettingsScreen from './screens/SettingsScreen'
import FeedScreen from './screens/FeedScreen'
import FeedPostDetailsScreen from './screens/FeedPostDetailsScreen'
import CreateFeedPostScreen from './screens/CreateFeedPostScreen'
import NotificationsScreen from './screens/NotificationsScreen'
import NotificationSettingsScreen from './screens/NotificationSettingsScreen'
import LeaveListScreen from './screens/LeaveListScreen'
import LeaveDetailsScreen from './screens/LeaveDetailsScreen'
import CreateLeaveScreen from './screens/CreateLeaveScreen'
import WFHListScreen from './screens/WFHListScreen'
import WFHDetailsScreen from './screens/WFHDetailsScreen'
import CreateWFHScreen from './screens/CreateWFHScreen'
import AttendanceDashboardScreen from './screens/AttendanceDashboardScreen'
import AttendanceApprovalsScreen from './screens/AttendanceApprovalsScreen'
import AttendanceCalendarScreen from './screens/AttendanceCalendarScreen'
import YourWorkScreen from './screens/YourWorkScreen'
import TeamTasksScreen from './screens/TeamTasksScreen'
import ProjectsScreen from './screens/ProjectsScreen'
import ProjectDetailsScreen from './screens/ProjectDetailsScreen'
import RequirementsListScreen from './screens/RequirementsListScreen'
import RequirementDetailScreen from './screens/RequirementDetailScreen'
import UsersScreen from './screens/UsersScreen'
import FeedTopicsScreen from './screens/FeedTopicsScreen'
import DeletedItemsScreen from './screens/DeletedItemsScreen'
import ReportsScreen from './screens/ReportsScreen'
import { FounderStartScreen } from './screens/founder/FounderStartScreen'
import { FounderRankScreen } from './screens/founder/FounderRankScreen'
import NotificationBell from './components/NotificationBell'
import CustomDrawerContent from './components/CustomDrawerContent'
import { OfflineBanner } from './components/OfflineBanner'
import { ActivityIndicator, View, LogBox, Text, ScrollView, TouchableOpacity, Image, StatusBar } from 'react-native'
import { IconButton, Provider as PaperProvider } from 'react-native-paper'
import { apolloClient, initializeApollo, persistor } from './config/apollo'
import { getUserToken, saveUserToken, saveUserData, clearSecureData, getUserData, getSecure, SECURE_KEYS, save, get, remove } from './utils/secureStorage'
import { LOGIN_MUTATION, REGISTER_PUSH_TOKEN, UNREGISTER_PUSH_TOKEN, GET_FEED_POSTS, GET_FEED_TOPICS } from './config/graphql-queries'
import { ThemeProvider, useTheme, lightColors, darkColors, DrawerProvider, useDrawer } from './contexts/ThemeContext'
import { ToastProvider } from './contexts/ToastContext'
import { ProjectFilterProvider } from './contexts/ProjectFilterContext'
import { registerForPushNotifications, setupNotificationListeners, cancelAllNotifications, setBadgeCount } from './services/pushNotificationService'
import Constants from 'expo-constants'
import * as Application from 'expo-application'
import { Platform, Linking, AppState, AppStateStatus } from 'react-native'
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs'
import { MaterialCommunityIcons } from '@expo/vector-icons'
import { materialColors, lightTheme, darkTheme } from './config/materialTheme'
import { TabBarProvider } from './context/TabBarContext'
import AnimatedTabBar from './components/AnimatedTabBar'
import { doc, onSnapshot } from 'firebase/firestore'
import { firestore } from './config/firebase'
import { setOnUnauthorized } from './utils/authEvents'
import { API_BASE_URL } from './config/api'
import { getCachedFounderFlag, refreshFounderFlag, clearFounderFlag } from './services/founderFlagService'
import { istDateString } from './utils/founderFormat'
import { FOUNDER_START } from './config/founder-queries'

type RootNavigation = NavigationContainerRef<any> | null
type RootState = NavigationState | undefined

/**
 * Losing the founder flag drops FounderStart from under any screen stacked on it, which would leave
 * that screen as the root with no back button. Put Main back underneath (logged-in stack only).
 */
function restoreMainUnderneath(navigation: RootNavigation, rootState: RootState): void {
  if (!navigation || !rootState?.routeNames.includes('Main')) return
  const mainIndex = rootState.routes.findIndex((route) => route.name === 'Main')
  if (mainIndex === 0) return
  const mainRoute: NavigationState['routes'][number] = { key: `Main-restored-${Date.now()}`, name: 'Main' }
  const routes = mainIndex > 0 ? rootState.routes.slice(mainIndex) : [mainRoute, ...rootState.routes]
  // Existing route keys are kept, so the screen on top is not remounted.
  navigation.reset({ ...rootState, index: routes.length - 1, routes })
}


// Disable dev tools warnings in production builds
if (!__DEV__) {
  LogBox.ignoreAllLogs(true)
  // Suppress console warnings about devtools in production
  const originalWarn = console.warn
  console.warn = (...args) => {
    if (
      args[0]?.includes?.('devtools') ||
      args[0]?.includes?.('websocket') ||
      args[0]?.includes?.('runtime not ready')
    ) {
      return
    }
    originalWarn(...args)
  }

  const originalError = console.error
  console.error = (...args) => {
    if (
      args[0]?.includes?.('devtools') ||
      args[0]?.includes?.('websocket') ||
      args[0]?.includes?.('runtime not ready')
    ) {
      return
    }
    originalError(...args)
  }
}

const Tab = createBottomTabNavigator()

// FeedScreen component moved to src/screens/FeedScreen.tsx

// Bottom Tab Navigator with 5 tabs
function BottomTabNavigator({ toggleDrawer }: { toggleDrawer: () => void }) {
  return (
    <Tab.Navigator
      initialRouteName="HomeTab"
      tabBar={props => <AnimatedTabBar {...props} />}
      screenOptions={{
        headerShown: false,
      }}
    >
      <Tab.Screen
        name="FeedTab"
        component={FeedScreen}
        options={{
          tabBarLabel: 'Feed',
          tabBarIcon: ({ focused }) => (
            <MaterialCommunityIcons name="rss" size={25} color={focused ? materialColors.primary : '#748c94'} />
          )
        }}
      />
      <Tab.Screen
        name="TasksTab"
        component={TaskListScreen}
        options={{
          tabBarLabel: 'Tasks',
          tabBarIcon: ({ focused }) => (
            <MaterialCommunityIcons name="checkbox-marked-circle-outline" size={25} color={focused ? materialColors.primary : '#748c94'} />
          )
        }}
      />
      <Tab.Screen
        name="HomeTab"
        component={DashboardScreen}
        options={{
          tabBarLabel: 'Dashboard',
          tabBarIcon: ({ focused }) => (
            <MaterialCommunityIcons name="view-dashboard" size={25} color={focused ? materialColors.primary : '#748c94'} />
          )
        }}
      />
      <Tab.Screen
        name="DevTab"
        component={BugListScreen}
        options={{
          tabBarLabel: 'Dev',
          tabBarIcon: ({ focused }) => (
            <MaterialCommunityIcons name="bug" size={25} color={focused ? materialColors.primary : '#748c94'} />
          )
        }}
      />
      <Tab.Screen
        name="MenuTab"
        component={View}
        options={{
          tabBarLabel: 'Menu',
          tabBarIcon: ({ focused }) => (
            <MaterialCommunityIcons name="menu" size={25} color={focused ? materialColors.primary : '#748c94'} />
          )
        }}
        listeners={{
          tabPress: (e) => {
            e.preventDefault();
            toggleDrawer();
          },
        }}
      />
    </Tab.Navigator>
  )
}

const Stack = createNativeStackNavigator()

// Error Boundary to catch and log component errors
interface ErrorBoundaryProps {
  children: ReactNode
}

interface ErrorBoundaryState {
  hasError: boolean
  error: Error | null
  errorInfo: ErrorInfo | null
}

class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  constructor(props: ErrorBoundaryProps) {
    super(props)
    this.state = { hasError: false, error: null, errorInfo: null }
  }

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { hasError: true, error, errorInfo: null }
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    // Log detailed error information
    console.error('🔴 ERROR BOUNDARY CAUGHT ERROR:')
    console.error('Error:', error)
    console.error('Error message:', error.message)
    console.error('Error stack:', error.stack)
    console.error('Component stack:', errorInfo.componentStack)

    // Try to identify which component failed
    const componentStack = errorInfo.componentStack
    if (componentStack) {
      const lines = componentStack.split('\n')
      console.error('🎯 Component hierarchy (top to bottom):')
      lines.forEach((line, index) => {
        if (line.trim()) {
          console.error(`  ${index}: ${line.trim()}`)
        }
      })
    }

    this.setState({ error, errorInfo })
  }

  render() {
    if (this.state.hasError) {
      return (
        <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', padding: 20, backgroundColor: '#fff' }}>
          <Text style={{ fontSize: 20, fontWeight: 'bold', color: '#d32f2f', marginBottom: 10 }}>
            Component Error Detected
          </Text>
          <Text style={{ fontSize: 14, color: '#666', marginBottom: 20, textAlign: 'center' }}>
            {this.state.error?.message || 'Unknown error'}
          </Text>
          <Text style={{ fontSize: 12, color: '#999', textAlign: 'center' }}>
            Check console logs for detailed error information
          </Text>
        </View>
      )
    }

    return this.props.children
  }
}

const navLightTheme = {
  ...NavigationLightTheme,
  colors: {
    ...NavigationLightTheme.colors,
    primary: lightColors.primary,
    background: lightColors.background,
    card: lightColors.card,
    text: lightColors.text,
    border: lightColors.border,
  },
}

const navDarkTheme = {
  ...NavigationDarkTheme,
  colors: {
    ...NavigationDarkTheme.colors,
    primary: darkColors.primary,
    background: darkColors.background,
    card: darkColors.card,
    text: darkColors.text,
    border: darkColors.border,
  },
}

// Version comparison helper
function isVersionLessThan(v1: string, v2: string): boolean {
  const sanitize = (v: string) => {
    if (!v) return []
    // Remove "v" or other non-numeric prefix/suffix, keep only numbers and dots
    const clean = String(v).replace(/[^0-9.]/g, '')
    return clean.split('.').map(part => {
      const parsed = parseInt(part, 10)
      return isNaN(parsed) ? 0 : parsed
    })
  }

  const parts1 = sanitize(v1)
  const parts2 = sanitize(v2)

  for (let i = 0; i < Math.max(parts1.length, parts2.length); i++) {
    const p1 = parts1[i] || 0
    const p2 = parts2[i] || 0
    if (p1 < p2) return true
    if (p1 > p2) return false
  }
  return false
}

// Maintenance Screen Component
function MaintenanceScreen({ onRetry }: { onRetry: () => void }) {
  const { theme } = useTheme()
  const currentColors = theme === 'dark' ? darkColors : lightColors

  return (
    <View style={{ flex: 1, backgroundColor: currentColors.background, justifyContent: 'center', alignItems: 'center', padding: 30 }}>
      <MaterialCommunityIcons name="alert-octagon" size={80} color="#f43f5e" style={{ marginBottom: 20 }} />
      <Text style={{ fontSize: 24, fontWeight: 'bold', color: currentColors.text, textAlign: 'center', marginBottom: 12 }}>
        System Maintenance
      </Text>
      <Text style={{ fontSize: 14, color: currentColors.textSecondary, textAlign: 'center', marginBottom: 30, lineHeight: 20 }}>
        The system is currently undergoing scheduled maintenance or the servers are temporarily unavailable. We'll be back online shortly! Thank you for your patience.
      </Text>
      <TouchableOpacity 
        onPress={onRetry}
        style={{ 
          backgroundColor: '#f43f5e', 
          paddingVertical: 12, 
          paddingHorizontal: 24, 
          borderRadius: 12,
          flexDirection: 'row',
          alignItems: 'center',
          gap: 8,
          shadowColor: '#000',
          shadowOffset: { width: 0, height: 2 },
          shadowOpacity: 0.1,
          shadowRadius: 4,
          elevation: 3
        }}
      >
        <MaterialCommunityIcons name="refresh" size={20} color="#fff" />
        <Text style={{ color: '#fff', fontWeight: 'bold', fontSize: 16 }}>Retry Connection</Text>
      </TouchableOpacity>
    </View>
  )
}

// Update Required Screen Component
function UpdateRequiredScreen({ storeUrl, minVersion }: { storeUrl: string; minVersion: string }) {
  const { theme } = useTheme()
  const currentColors = theme === 'dark' ? darkColors : lightColors

  const handleUpdatePress = () => {
    if (storeUrl) {
      Linking.openURL(storeUrl).catch(err => console.error("Couldn't open update URL:", err))
    }
  };

  return (
    <View style={{ flex: 1, backgroundColor: currentColors.background, justifyContent: 'center', alignItems: 'center', padding: 30 }}>
      <MaterialCommunityIcons name="cloud-upload" size={80} color={currentColors.primary} style={{ marginBottom: 20 }} />
      <Text style={{ fontSize: 24, fontWeight: 'bold', color: currentColors.text, textAlign: 'center', marginBottom: 12 }}>
        Update Required
      </Text>
      <Text style={{ fontSize: 14, color: currentColors.textSecondary, textAlign: 'center', marginBottom: 30, lineHeight: 20 }}>
        A new version of Karmayog is available. To continue using the app, please update to version {minVersion} or newer.
      </Text>
      <TouchableOpacity 
        onPress={handleUpdatePress}
        style={{ 
          backgroundColor: currentColors.primary, 
          paddingVertical: 12, 
          paddingHorizontal: 24, 
          borderRadius: 12,
          flexDirection: 'row',
          alignItems: 'center',
          gap: 8,
          shadowColor: '#000',
          shadowOffset: { width: 0, height: 2 },
          shadowOpacity: 0.1,
          shadowRadius: 4,
          elevation: 3
        }}
      >
        <MaterialCommunityIcons name="download" size={20} color="#fff" />
        <Text style={{ color: '#fff', fontWeight: 'bold', fontSize: 16 }}>Update App</Text>
      </TouchableOpacity>
    </View>
  )
}

// Splash Screen View Component (Displays app splash image while loading configuration)
function SplashScreenView() {
  return (
    <View style={{ flex: 1, backgroundColor: '#ffffff', justifyContent: 'center', alignItems: 'center' }}>
      <Image 
        source={require('../assets/amtariksha_logo.png')} 
        style={{ width: '100%', height: '100%', resizeMode: 'contain' }} 
      />
    </View>
  )
}

function AppContent() {
  const { theme } = useTheme()
  const paperTheme = theme === 'dark' ? darkTheme : lightTheme
  const navigationTheme = theme === 'dark' ? navDarkTheme : navLightTheme

  const [appConfig, setAppConfig] = useState<{
    minAndroidVersion: string
    minIosVersion: string
    updatedAt: number
  }>({
    minAndroidVersion: '1.0.0',
    minIosVersion: '1.0.0',
    updatedAt: 0
  })
  
  const [isApiDown, setIsApiDown] = useState(false)
  const [isConfigLoaded, setIsConfigLoaded] = useState(false)

  // Helper to update appConfig and persist it to AsyncStorage
  const updateAndCacheAppConfig = useCallback((
    updater: (prev: typeof appConfig) => typeof appConfig
  ) => {
    setAppConfig(prevConfig => {
      const nextConfig = updater(prevConfig)
      if (
        prevConfig.minAndroidVersion !== nextConfig.minAndroidVersion ||
        prevConfig.minIosVersion !== nextConfig.minIosVersion ||
        prevConfig.updatedAt !== nextConfig.updatedAt
      ) {
        save('app_config_cache', nextConfig).catch(err => {
          console.warn('Failed to cache app config:', err)
        })
        return nextConfig
      }
      return prevConfig
    })
  }, [])

  // Safety timeout: prevent getting stuck on the splash screen
  useEffect(() => {
    const timer = setTimeout(() => {
      console.log('⏰ Splash screen safety timeout reached - forcing config load')
      setIsConfigLoaded(true)
    }, 2500) // 2.5 seconds safety timeout

    return () => clearTimeout(timer)
  }, [])

  // Listen to remote Firebase configuration
  useEffect(() => {
    console.log('🔗 Setting up real-time Firebase configuration listener on mobile')
    const unsubscribe = onSnapshot(
      doc(firestore, 'app_config', 'maintenance'),
      (docSnap) => {
        if (docSnap.exists()) {
          const data = docSnap.data()
          
          // Parse Firestore updatedAt timestamp
          let firestoreTime = 0
          if (data.updatedAt) {
            if (typeof data.updatedAt.toMillis === 'function') {
              firestoreTime = data.updatedAt.toMillis()
            } else if (data.updatedAt.seconds) {
              firestoreTime = data.updatedAt.seconds * 1000
            } else {
              firestoreTime = new Date(data.updatedAt).getTime()
            }
          }
          if (isNaN(firestoreTime) || firestoreTime <= 0) {
            firestoreTime = Date.now()
          }

          updateAndCacheAppConfig(prevConfig => {
            if (firestoreTime >= prevConfig.updatedAt) {
              return {
                minAndroidVersion: data.minAndroidVersion || '1.0.0',
                minIosVersion: data.minIosVersion || '1.0.0',
                updatedAt: firestoreTime
              }
            }
            console.log('⚠️ Ignored stale Firestore AppConfig. Local/API is newer.')
            return prevConfig
          })
        }
        setIsConfigLoaded(true)
      },
      (error) => {
        console.error('❌ Error listening to Firestore config:', error)
        setIsConfigLoaded(true)
      }
    )

    return () => unsubscribe()
  }, [updateAndCacheAppConfig])

  // Consecutive health-check failures. We only show the "API down" screen after
  // 2+ in a row so a single transient blip doesn't unmount the whole
  // NavigationContainer (destroying nav state + in-progress form input).
  const healthFailuresRef = useRef(0)

  // Check backend server connection health
  const checkApiHealth = useCallback(async () => {
    const markDown = (reason: string) => {
      healthFailuresRef.current += 1
      console.warn(`⚠️ API health check failed (${healthFailuresRef.current}): ${reason}`)
      if (healthFailuresRef.current >= 2) setIsApiDown(true)
    }
    const markUp = () => {
      healthFailuresRef.current = 0
      setIsApiDown(false)
    }
    try {
      const controller = new AbortController()
      const timeoutId = setTimeout(() => controller.abort(), 6000)

      console.log('🔍 Checking backend API connection health & config...')
      const response = await fetch(`${API_BASE_URL}/api/settings/app-management`, {
        signal: controller.signal
      })
      clearTimeout(timeoutId)

      if (response.status >= 500) {
        markDown(`5xx status ${response.status}`)
      } else {
        markUp()
        console.log('✅ API connection is healthy')
        
        const result = await response.json()
        if (result.success && result.data) {
          const apiTime = result.data.updatedAt 
            ? new Date(result.data.updatedAt).getTime() 
            : 0
            
          updateAndCacheAppConfig(prevConfig => {
            if (apiTime >= prevConfig.updatedAt) {
              return {
                minAndroidVersion: result.data.minAndroidVersion || '1.0.0',
                minIosVersion: result.data.minIosVersion || '1.0.0',
                updatedAt: apiTime
              }
            }
            return prevConfig
          })
        }
      }
    } catch (err) {
      markDown(String(err))
    } finally {
      setIsConfigLoaded(true)
    }
  }, [updateAndCacheAppConfig])

  useEffect(() => {
    checkApiHealth()
    const interval = setInterval(checkApiHealth, 30000) // Poll every 30s
    return () => clearInterval(interval)
  }, [checkApiHealth])

  const [state, dispatch] = React.useReducer(
    (prevState: any, action: any) => {
      switch (action.type) {
        case 'RESTORE_TOKEN':
          return {
            ...prevState,
            userToken: action.payload,
            isLoading: false,
          }
        case 'SIGN_IN':
          return {
            ...prevState,
            isSignout: false,
            userToken: action.payload,
          }
        case 'SIGN_OUT':
          return {
            ...prevState,
            isSignout: true,
            userToken: null,
          }
      }
    },
    {
      isLoading: true,
      isSignout: false,
      userToken: null,
    }
  )

  const { isDrawerOpen, openDrawer, closeDrawer } = useDrawer()
  const [pushToken, setPushToken] = React.useState<string | null>(null)
  const navigationRef = useRef<NavigationContainerRef<any>>(null)
  
  // Security lock states
  const [isPinSetupNeeded, setIsPinSetupNeeded] = useState(false)
  const [isAppLocked, setIsAppLocked] = useState(false)

  // Founder flag decides whether FounderStart is registered (and is the root route).
  // The AppState and notification handlers are registered once, so they read it via the ref.
  const [isFounder, setIsFounder] = useState(false)
  const isFounderRef = useRef(false)
  isFounderRef.current = isFounder

  const resetToFounderStart = useCallback(() => {
    const navigation = navigationRef.current
    if (!navigation?.isReady()) return
    // FounderStart is registered only while the unlocked, logged-in stack is mounted.
    if (!navigation.getRootState()?.routeNames?.includes('FounderStart')) return
    navigation.reset({ index: 0, routes: [{ name: 'FounderStart' }] })
  }, [])

  const backgroundedAtRef = useRef(0)
  const notificationNavAtRef = useRef(0)

  // A key-less reset remounts Start even when it is already showing, which would throw away an open
  // close-out (or unsaved rank edits), and it would replace a screen a notification tap just opened.
  // In those cases today's Start is refetched in place instead.
  const showStartForNewIstDay = useCallback(() => {
    const navigation = navigationRef.current
    const rootState = navigation?.isReady() ? navigation.getRootState() : undefined
    const focusedRoute = rootState?.routes[rootState.index]?.name
    const openedByNotification = notificationNavAtRef.current > backgroundedAtRef.current
    if (focusedRoute === 'FounderStart' || focusedRoute === 'FounderRank' || openedByNotification) {
      apolloClient.refetchQueries({ include: [FOUNDER_START] }).catch((error: unknown) => {
        console.warn('Failed to refetch Start for the new day:', error)
      })
      return
    }
    resetToFounderStart()
  }, [resetToFounderStart])

  // Spec §6.1: the founder check runs on login and on every foreground, so a failed check right
  // after login (or a server-side change) doesn't stick until the next cold start.
  const refreshFounderFlagOnForeground = useCallback(async () => {
    try {
      const founder = await refreshFounderFlag()
      if (await getUserToken()) setIsFounder(founder)
    } catch (error) {
      console.warn('Failed to refresh founder flag on foreground:', error)
    }
  }, [])

  // AppState listener for auto-locking when app resumes from background
  const wasBackgroundedRef = useRef(false)
  const appStateRef = useRef(AppState.currentState)
  useEffect(() => {
    const handleAppStateChange = async (nextAppState: AppStateStatus) => {
      if (nextAppState === 'background') {
        wasBackgroundedRef.current = true
        backgroundedAtRef.current = Date.now()
        await save('jsr_last_active_time', Date.now().toString())
      }

      if (
        wasBackgroundedRef.current &&
        nextAppState === 'active'
      ) {
        // Read before the lock check below overwrites it.
        const founderLastActive = isFounderRef.current ? await get('jsr_last_active_time') : null
        let isLocking = false
        console.log('App resumed from background: checking lock...')
        const token = await getUserToken()
        if (token) {
          const storedPin = await getSecure(SECURE_KEYS.USER_PIN)
          if (storedPin) {
            const lastActiveStr = await get('jsr_last_active_time')
            const lastActiveTime = lastActiveStr ? parseInt(lastActiveStr, 10) : 0
            const elapsed = Date.now() - lastActiveTime
            if (elapsed >= 5 * 60 * 1000) {
              isLocking = true
              setIsAppLocked(true)
            } else {
              console.log(`Bypassing lock screen: returned after ${Math.round(elapsed / 1000)}s (< 300s).`)
              await save('jsr_last_active_time', Date.now().toString())
            }
          }
        }
        // A lock remounts the stack, which already lands a founder on Start.
        if (token && !isLocking && isFounderRef.current && founderLastActive) {
          const lastActiveMs = Number(founderLastActive)
          if (lastActiveMs > 0 && istDateString(new Date(lastActiveMs)) !== istDateString(new Date())) {
            showStartForNewIstDay()
          }
        }
        if (token) {
          void refreshFounderFlagOnForeground()
        }
        wasBackgroundedRef.current = false
      }
      appStateRef.current = nextAppState
    }

    const subscription = AppState.addEventListener('change', handleAppStateChange)
    return () => subscription.remove()
  }, [])

  // Always points at the latest signOut. authContext is memoized on [pushToken],
  // so registering the first-render closure (as the old []-dep effect did) meant
  // a forced sign-out used a stale pushToken and never unregistered the current
  // token. The ref is reassigned every render (see below, after authContext).
  const signOutRef = useRef<() => void>(() => {})

  // Register global 401 unauthorized handler to trigger signOut (via the ref).
  useEffect(() => {
    setOnUnauthorized(() => {
      console.log('Global 401 detected — signing out...')
      signOutRef.current()
    })
    return () => setOnUnauthorized(() => {})
  }, [])

  // Helper function to handle notification navigation
  const handleNotificationNavigation = (data: any) => {
    if (!navigationRef.current) {
      console.warn('Navigation ref not ready')
      return
    }
    notificationNavAtRef.current = Date.now()

    if (data?.screen === 'FounderStart') {
      try {
        navigationRef.current.navigate((isFounderRef.current ? 'FounderStart' : 'Notifications') as any)
      } catch (error) {
        console.error('Navigation error:', error)
      }
      return
    }

    const { type, taskId, bugId, leaveId, wfhId, postId } = data

    try {
      switch (type) {
        case 'task':
          if (taskId) {
            navigationRef.current.navigate('TaskDetails' as any, { taskId })
          }
          break
        case 'bug':
          if (bugId) {
            navigationRef.current.navigate('BugDetails' as any, { bugId })
          }
          break
        case 'leave':
          if (leaveId) {
            navigationRef.current.navigate('LeaveDetails' as any, { leaveId })
          }
          break
        case 'wfh':
          if (wfhId) {
            navigationRef.current.navigate('WFHDetails' as any, { wfhId })
          }
          break
        case 'feed':
        case 'mention':
        case 'comment':
        case 'reaction':
          if (postId) {
            navigationRef.current.navigate('FeedPostDetails' as any, { postId })
          } else {
            navigationRef.current.navigate('FeedTab' as any)
          }
          break
        default:
          // Navigate to notifications screen if type is unknown
          navigationRef.current.navigate('Notifications' as any)
      }
    } catch (error) {
      console.error('Navigation error:', error)
    }
  }

  useEffect(() => {
    const bootstrapAsync = async () => {
      let userToken
      try {
        // Load cached app config first to display/dismiss blocker screens instantly
        const cachedConfig = await get('app_config_cache')
        if (cachedConfig) {
          setAppConfig(cachedConfig)
          console.log('📦 Loaded AppConfig from local cache:', cachedConfig)
        }

        // Initialize Apollo cache persistence
        await initializeApollo()

        // Use SecureStore instead of AsyncStorage for token
        userToken = await getUserToken()

        if (userToken) {
          const storedPin = await getSecure(SECURE_KEYS.USER_PIN)
          if (storedPin) {
            const lastActiveStr = await get('jsr_last_active_time')
            const lastActiveTime = lastActiveStr ? parseInt(lastActiveStr, 10) : 0
            if (Date.now() - lastActiveTime >= 5 * 60 * 1000) {
              setIsAppLocked(true)
            } else {
              setIsAppLocked(false)
              await save('jsr_last_active_time', Date.now().toString())
              console.log('Bypassing lock screen on cold boot: returned within 5 minutes.')
            }
            setIsPinSetupNeeded(false)
          } else {
            setIsPinSetupNeeded(true)
            setIsAppLocked(false)
          }
          // Before RESTORE_TOKEN so the first logged-in render already has the right root route.
          setIsFounder(await getCachedFounderFlag())
        }
      } catch (e) {
        console.error('Failed to restore token', e)
      }

      dispatch({ type: 'RESTORE_TOKEN', payload: userToken })
    }

    bootstrapAsync()
  }, [])

  // Re-check the founder flag with the server whenever the signed-in user changes.
  useEffect(() => {
    if (!state.userToken) {
      setIsFounder(false)
      return
    }

    let isCurrent = true
    const syncFounderFlag = async () => {
      try {
        const founder = await refreshFounderFlag()
        if (isCurrent) setIsFounder(founder)
      } catch (error) {
        console.warn('Failed to refresh founder flag:', error)
      }
    }
    syncFounderFlag()

    return () => {
      isCurrent = false
    }
  }, [state.userToken])

  // Runs after the render that registered FounderStart, so the reset can target it
  // (first login as a founder while the logged-in stack is already showing Main).
  useEffect(() => {
    const navigation = navigationRef.current
    const rootState = navigation?.isReady() ? navigation.getRootState() : undefined
    if (!isFounder) {
      restoreMainUnderneath(navigation, rootState)
      return
    }
    // A stack mounted with the flag already set starts on FounderStart; resetting would remount it.
    if (rootState?.routes[rootState.index]?.name === 'FounderStart') return
    resetToFounderStart()
  }, [isFounder, resetToFounderStart])

  // Initialize push notifications when user is authenticated
  useEffect(() => {
    if (!state.userToken) {
      return
    }

    let cleanupListeners: (() => void) | undefined

    const initPushNotifications = async () => {
      try {
        // Get user data to get employee ID
        const userData = await getUserData()
        if (!userData?.employeeId) {
          console.warn('No user data found, skipping push notification registration')
          return
        }

        // Register for push notifications and get token
        const token = await registerForPushNotifications()
        if (token) {
          setPushToken(token)
          console.log('Push token obtained:', token.substring(0, 20) + '...')

          // Send token to backend
          try {
            await apolloClient.mutate({
              mutation: REGISTER_PUSH_TOKEN,
              variables: {
                userId: userData.employeeId,
                pushToken: token,
                deviceType: Platform.OS,
                deviceId: Constants.deviceName || Platform.OS
              }
            })
            console.log('Push token registered with backend')
          } catch (error) {
            console.error('Failed to register push token with backend:', error)
          }
        }

        // Setup notification listeners
        cleanupListeners = setupNotificationListeners(
          // Foreground notification handler
          (notification) => {
            console.log('Foreground notification:', notification)
            // Notification is automatically shown by Notifications.setNotificationHandler
          },
          // Notification tap handler
          (response) => {
            console.log('Notification tapped:', response)
            const data = response.notification.request.content.data
            if (data) {
              handleNotificationNavigation(data)
            }
          }
        )
      } catch (error) {
        console.error('Failed to initialize push notifications:', error)
      }
    }

    initPushNotifications()

    // Cleanup listeners on unmount or logout
    return () => {
      if (cleanupListeners) {
        cleanupListeners()
      }
    }
  }, [state.userToken])

  const authContext = React.useMemo(
    () => ({
      signIn: async (employeeId: string, password: string) => {
        try {
          // Use GraphQL mutation for login
          const result = await apolloClient.mutate({
            mutation: LOGIN_MUTATION,
            variables: { employeeId, password },
          })

          if ((result.data as any)?.login?.token) {
            const { token, user } = (result.data as any).login

            // Save token and user data to SecureStore
            await saveUserToken(token)
            await saveUserData(user)

            // Check if PIN setup is required
            const storedPin = await getSecure(SECURE_KEYS.USER_PIN)
            if (storedPin) {
              setIsAppLocked(true) // Lock the app so they have to enter the PIN
              setIsPinSetupNeeded(false)
            } else {
              setIsPinSetupNeeded(true)
              setIsAppLocked(false)
            }

            dispatch({ type: 'SIGN_IN', payload: token })
            return { success: true, user }
          }

          return { success: false, error: 'Invalid credentials' }
        } catch (error: any) {
          console.error('Login error:', error)
          return {
            success: false,
            error: error.message || 'Network error. Please check your connection.'
          }
        }
      },
      requestOtp: async (employeeId: string) => {
        try {
          const res = await fetch(`${API_BASE_URL}/api/auth/otp/request`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ employeeId }),
          })
          const json = await res.json().catch(() => ({}))
          if (!res.ok) {
            return { success: false, error: json.error || 'Failed to send OTP' }
          }
          return { success: true, maskedPhone: json.maskedPhone }
        } catch (error: any) {
          console.error('OTP request error:', error)
          return { success: false, error: error.message || 'Network error. Please try again.' }
        }
      },
      verifyOtp: async (employeeId: string, otp: string) => {
        try {
          const res = await fetch(`${API_BASE_URL}/api/auth/otp/verify`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ employeeId, otp }),
          })
          const json = await res.json().catch(() => ({}))
          if (!res.ok || !json.token) {
            return { success: false, error: json.error || 'Invalid or expired OTP' }
          }

          const token = json.token
          const user = json.data
          await saveUserToken(token)
          await saveUserData(user)

          const storedPin = await getSecure(SECURE_KEYS.USER_PIN)
          if (storedPin) {
            setIsAppLocked(true)
            setIsPinSetupNeeded(false)
          } else {
            setIsPinSetupNeeded(true)
            setIsAppLocked(false)
          }

          dispatch({ type: 'SIGN_IN', payload: token })
          return { success: true, user }
        } catch (error: any) {
          console.error('OTP verify error:', error)
          return { success: false, error: error.message || 'Network error. Please try again.' }
        }
      },
      restoreSession: async () => {
        // Used by biometric login: reuse the already-stored token instead of
        // re-authenticating. If no token is present, the caller must sign in.
        try {
          const token = await getUserToken()
          const userData = await getUserData()
          if (!token || !userData) {
            return { success: false, error: 'No stored session' }
          }

          const storedPin = await getSecure(SECURE_KEYS.USER_PIN)
          if (storedPin) {
            setIsAppLocked(true)
            setIsPinSetupNeeded(false)
          } else {
            setIsPinSetupNeeded(false)
            setIsAppLocked(false)
          }

          dispatch({ type: 'SIGN_IN', payload: token })
          return { success: true, user: userData }
        } catch (error: any) {
          console.error('Session restore error:', error)
          return { success: false, error: error.message || 'Failed to restore session' }
        }
      },
      signOut: async () => {
        try {
          // Unregister push token from backend
          if (pushToken) {
            try {
              const userData = await getUserData()
              if (userData?.employeeId) {
                await apolloClient.mutate({
                  mutation: UNREGISTER_PUSH_TOKEN,
                  variables: {
                    userId: userData.employeeId,
                    pushToken: pushToken
                  }
                })
                console.log('Push token unregistered from backend')
              }
            } catch (error) {
              console.error('Failed to unregister push token:', error)
            }
          }

          // Clear push token state
          setPushToken(null)

          // Cancel all scheduled notifications
          await cancelAllNotifications()

          // Clear badge count
          await setBadgeCount(0)

          // Clear all secure data
          await clearSecureData()
          await remove('jsr_last_active_time')
          // Clear the saved project filter so the next user on this device
          // doesn't inherit the previous user's selected projects.
          await remove('selectedProjectIds')
          // isFounder is cleared by the [state.userToken] effect after SIGN_OUT. Clearing it here, before
          // the awaits below, would re-render the logged-in stack without FounderStart and mount Main mid-logout.
          await clearFounderFlag()

          // Clear Apollo Client cache AND purge the persisted (AsyncStorage)
          // copy, otherwise the previous user's cached data survives to the
          // next session on the same device.
          await apolloClient.clearStore()
          try {
            await persistor.purge()
          } catch (purgeError) {
            console.error('Failed to purge persisted cache:', purgeError)
          }

          // Close the drawer if open
          closeDrawer()

          setIsPinSetupNeeded(false)
          setIsAppLocked(false)

          dispatch({ type: 'SIGN_OUT' })
        } catch (error) {
          console.error('Logout error:', error)
          // Still dispatch sign out even if cleanup fails
          await clearFounderFlag()
          setIsPinSetupNeeded(false)
          setIsAppLocked(false)
          dispatch({ type: 'SIGN_OUT' })
        }
      },
      signUp: async () => {
        // Not implemented yet
      },
    }),
    [pushToken]
  )

  // Keep the 401 handler pointing at the latest signOut (with current pushToken).
  signOutRef.current = authContext.signOut

  if (state.isLoading || !isConfigLoaded) {
    return <SplashScreenView />
  }

  // Blocker 1: API is down
  if (isApiDown) {
    return <MaintenanceScreen onRetry={checkApiHealth} />
  }

  // Blocker 2: Force Update Check
  const localVersion = Application.nativeApplicationVersion || Constants.expoConfig?.version || '1.0.0'
  const minVersion = Platform.OS === 'ios' ? appConfig.minIosVersion : appConfig.minAndroidVersion
  const storeUrl = Platform.OS === 'ios' 
    ? 'https://apps.apple.com/app/id123456789' 
    : 'https://play.google.com/store/apps/details?id=com.karmayog'
  const needsUpdate = isVersionLessThan(localVersion, minVersion)

  if (needsUpdate) {
    return <UpdateRequiredScreen storeUrl={storeUrl} minVersion={minVersion} />
  }

  return (
    <ApolloProvider client={apolloClient}>
      <PaperProvider theme={paperTheme}>
        <ToastProvider>
          <AuthContext.Provider value={authContext}>
          <TabBarProvider>
            <NavigationContainer ref={navigationRef} theme={navigationTheme} onStateChange={() => { save('jsr_last_active_time', Date.now().toString()) }}>
              <StatusBar
                barStyle={theme === 'dark' ? 'light-content' : 'dark-content'}
                backgroundColor={theme === 'dark' ? '#121212' : '#F8FAFC'}
              />
              <OfflineBanner />
              <Stack.Navigator
                screenOptions={{
                  headerShown: true,
                  animation: 'slide_from_right',
                  animationDuration: 250,
                }}
              >
                {state.userToken == null ? (
                  <Stack.Screen
                    name="Login"
                    component={LoginScreen}
                    options={{
                      headerShown: false,
                      animation: 'none',
                    }}
                  />
                ) : isPinSetupNeeded ? (
                  <Stack.Screen
                    name="PinSetup"
                    options={{
                      headerShown: false,
                      animation: 'fade',
                    }}
                  >
                    {props => <PinSetupScreen {...props} onComplete={() => setIsPinSetupNeeded(false)} />}
                  </Stack.Screen>
                ) : isAppLocked ? (
                  <Stack.Screen
                    name="PinLock"
                    options={{
                      headerShown: false,
                      animation: 'fade',
                    }}
                  >
                    {props => <PinLockScreen {...props} onUnlock={async () => { await save('jsr_last_active_time', Date.now().toString()); setIsAppLocked(false) }} />}
                  </Stack.Screen>
                ) : (
                  <>
                    {/* First child is the initial route, so founders land on Start */}
                    {isFounder && (
                      <Stack.Screen name="FounderStart" component={FounderStartScreen} options={{ headerShown: false }} />
                    )}
                    <Stack.Screen name="Main" options={{ headerShown: false }}>
                    {() => <BottomTabNavigator toggleDrawer={openDrawer} />}
                  </Stack.Screen>

                    {/* Task Screens */}
                    <Stack.Screen
                      name="TaskList"
                      component={TaskListScreen}
                      options={{
                        headerTitle: 'Tasks',
                      }}
                    />
                    <Stack.Screen
                      name="TaskDetails"
                      component={TaskDetailsScreen}
                      options={{
                        headerTitle: 'Task Details',
                      }}
                    />
                    <Stack.Screen
                      name="CreateTask"
                      component={CreateTaskScreen}
                      options={{
                        headerTitle: 'Create Task',
                      }}
                    />

                    {/* Bug Screens */}
                    <Stack.Screen
                      name="BugList"
                      component={BugListScreen}
                      options={{
                        headerTitle: 'Bugs',
                      }}
                    />
                    <Stack.Screen
                      name="BugDetails"
                      component={BugDetailsScreen}
                      options={{
                        headerTitle: 'Bug Details',
                      }}
                    />
                    <Stack.Screen
                      name="CreateBug"
                      component={CreateBugScreen}
                      options={{
                        headerTitle: 'Create Bug',
                      }}
                    />

                    {/* Feed Screens */}
                    <Stack.Screen
                      name="FeedPostDetails"
                      component={FeedPostDetailsScreen}
                      options={{
                        headerTitle: 'Post Details',
                      }}
                    />
                    <Stack.Screen
                      name="CreateFeedPost"
                      component={CreateFeedPostScreen}
                      options={{
                        headerTitle: 'Create Post',
                      }}
                    />

                    {/* Notification Screen */}
                    <Stack.Screen
                      name="Notifications"
                      component={NotificationsScreen}
                      options={{
                        headerTitle: 'Notifications',
                      }}
                    />

                    {/* Leave Screens */}
                    <Stack.Screen
                      name="LeaveList"
                      component={LeaveListScreen}
                      options={{
                        headerTitle: 'Leave Applications',
                      }}
                    />
                    <Stack.Screen
                      name="LeaveDetails"
                      component={LeaveDetailsScreen}
                      options={{
                        headerTitle: 'Leave Details',
                      }}
                    />
                    <Stack.Screen
                      name="CreateLeave"
                      component={CreateLeaveScreen}
                      options={{
                        headerTitle: 'Apply for Leave',
                      }}
                    />

                    {/* WFH Screens */}
                    <Stack.Screen
                      name="WFHList"
                      component={WFHListScreen}
                      options={{
                        headerTitle: 'WFH Applications',
                      }}
                    />
                    <Stack.Screen
                      name="WFHDetails"
                      component={WFHDetailsScreen}
                      options={{
                        headerTitle: 'WFH Details',
                      }}
                    />
                    <Stack.Screen
                      name="CreateWFH"
                      component={CreateWFHScreen}
                      options={{
                        headerTitle: 'Apply for WFH',
                      }}
                    />

                    {/* Notification Settings Screen */}
                    <Stack.Screen
                      name="NotificationSettings"
                      component={NotificationSettingsScreen}
                      options={{
                        headerTitle: 'Notification Settings',
                      }}
                    />

                    {/* Settings Screen */}
                    <Stack.Screen
                      name="Settings"
                      component={SettingsScreen}
                      options={{
                        headerTitle: 'Settings',
                      }}
                    />
                    <Stack.Screen
                      name="AttendanceDashboard"
                      component={AttendanceDashboardScreen}
                      options={{
                        headerTitle: 'Attendance Dashboard',
                      }}
                    />
                    <Stack.Screen
                      name="AttendanceApprovals"
                      component={AttendanceApprovalsScreen}
                      options={{
                        headerTitle: 'Attendance Approvals',
                      }}
                    />
                    <Stack.Screen
                      name="AttendanceCalendar"
                      component={AttendanceCalendarScreen}
                      options={{
                        headerTitle: 'My Attendance',
                      }}
                    />
                    <Stack.Screen
                      name="YourWork"
                      component={YourWorkScreen}
                      options={{
                        headerTitle: 'Your Work Report',
                      }}
                    />
                    <Stack.Screen
                      name="TeamTasks"
                      component={TeamTasksScreen}
                      options={{
                        headerTitle: 'Team Tasks',
                      }}
                    />
                    <Stack.Screen
                      name="Projects"
                      component={ProjectsScreen}
                      options={{
                        headerTitle: 'Projects',
                      }}
                    />
                    <Stack.Screen
                      name="ProjectDetails"
                      component={ProjectDetailsScreen}
                      options={{
                        headerTitle: 'Project Details',
                      }}
                    />
                    <Stack.Screen
                      name="RequirementsList"
                      component={RequirementsListScreen}
                      options={{
                        headerTitle: 'Requirements',
                      }}
                    />
                    <Stack.Screen
                      name="RequirementDetails"
                      component={RequirementDetailScreen}
                      options={{
                        headerTitle: 'Requirement',
                      }}
                    />
                    <Stack.Screen
                      name="Users"
                      component={UsersScreen}
                      options={{
                        headerTitle: 'User Management',
                      }}
                    />
                    <Stack.Screen
                      name="FeedTopics"
                      component={FeedTopicsScreen}
                      options={{
                        headerTitle: 'Feed Topics',
                      }}
                    />
                    <Stack.Screen
                      name="DeletedItems"
                      component={DeletedItemsScreen}
                      options={{
                        headerTitle: 'Deleted Items',
                      }}
                    />
                    <Stack.Screen
                      name="Reports"
                      component={ReportsScreen}
                      options={{
                        headerTitle: 'Reports & Analytics',
                      }}
                    />
                    {isFounder && (
                      <Stack.Screen name="FounderRank" component={FounderRankScreen} options={{ title: 'Rank threads' }} />
                    )}
                  </>
                )}
              </Stack.Navigator>
              <CustomDrawerContent
                visible={isDrawerOpen}
                onClose={closeDrawer}
                isFounder={isFounder}
              />
            </NavigationContainer>
          </TabBarProvider>
        </AuthContext.Provider>
        </ToastProvider>
      </PaperProvider>
    </ApolloProvider>
  )
}

export default function App() {
  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <ErrorBoundary>
        <ThemeProvider>
          <DrawerProvider>
            <ProjectFilterProvider>
              <AppContent />
            </ProjectFilterProvider>
          </DrawerProvider>
        </ThemeProvider>
      </ErrorBoundary>
    </GestureHandlerRootView>
  )
}
