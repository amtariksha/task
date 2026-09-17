import React, { useEffect, useState } from 'react'
import { View, StyleSheet, TouchableOpacity, Modal, ScrollView, Image, Alert } from 'react-native'
import { Avatar, Text, Divider, List, Button, IconButton } from 'react-native-paper'
import { useNavigation } from '@react-navigation/native'
import { getUserData } from '../utils/secureStorage'
import { materialTypography, materialSpacing } from '../config/materialTheme'
import { AuthContext } from '../contexts/AuthContext'
import { useTheme } from '../contexts/ThemeContext'
import { DebugMenu } from './DebugMenu'
import { hasTabAccess } from '../utils/permissions'

interface NavigationItem {
  screen: string
  label: string
  icon: string
  key?: string
}

interface CustomDrawerContentProps {
  visible: boolean
  onClose: () => void
  /** App's flag (the one that registers FounderStart), so the drawer never shows a stale Start item. */
  isFounder?: boolean
}

export default function CustomDrawerContent({ visible, onClose, isFounder = false }: CustomDrawerContentProps) {
  const navigation = useNavigation<any>()
  const { signOut } = React.useContext(AuthContext)
  const [currentUser, setCurrentUser] = useState<any>(null)
  const [expandedAdmin, setExpandedAdmin] = useState(false)
  const [isLoading, setIsLoading] = useState(true)
  const [debugMenuVisible, setDebugMenuVisible] = useState(false)
  const { colors } = useTheme()
  const styles = getStyles(colors)

  useEffect(() => {
    if (visible) {
      loadUser()
    }
  }, [visible])

  const loadUser = async () => {
    setIsLoading(true)
    try {
      const userData = await getUserData()
      if (userData) {
        setCurrentUser(userData)
      }
    } catch (error) {
      console.error('Failed to load user data:', error)
    } finally {
      setIsLoading(false)
    }
  }

  const renderSection = (items: NavigationItem[], title?: string) => (
    <View>
      {items.map((item) => (
        <List.Item
          key={item.screen}
          title={item.label}
          left={(props) => <List.Icon {...props} icon={item.icon} color={colors.primary} />}
          onPress={() => handleNavigation(item)}
          style={styles.navItem}
          titleStyle={styles.navItemTitle}
        />
      ))}
    </View>
  )

  const founderStartItem: NavigationItem = { screen: 'FounderStart', label: 'Start', icon: 'weather-sunset-up' }

  // Navigation Sections matching WebApp
  const homeItems: NavigationItem[] = [
    { screen: 'Home', label: 'Home', icon: 'home' },
  ]

  const feedItems: NavigationItem[] = [
    { screen: 'Feed', label: 'Feed', icon: 'rss' },
  ]

  const workItems = React.useMemo(() => {
    const items: NavigationItem[] = [
      { screen: 'DashboardScreen', label: 'Dashboard', icon: 'view-dashboard' },
      { screen: 'TaskList', label: 'Tasks', icon: 'checkbox-marked-circle-outline' },
      { screen: 'BugList', label: 'Development', icon: 'bug-outline' },
    ]
    if (currentUser?.role === 'amtarikshian') {
      items.push({ screen: 'YourWork', label: 'Your Work', icon: 'file-document-edit-outline' })
    }
    if (['admin', 'top_management', 'management'].includes(currentUser?.role?.toLowerCase() || '')) {
      items.push({ screen: 'TeamTasks', label: 'Team Tasks', icon: 'account-multiple-outline' })
    }
    return items
  }, [currentUser])

  const attendanceItems: NavigationItem[] = [
    { screen: 'LeaveList', label: 'Leave', icon: 'calendar-clock' },
    { screen: 'WFHList', label: 'WFH', icon: 'home-account' },
    { screen: 'AttendanceDashboard', label: 'Attendance Dashboard', icon: 'clock-outline' },
  ]

  const adminItems = React.useMemo(() => {
    if (!currentUser) return []
    const rawAdminItems: NavigationItem[] = [
      { screen: 'Projects', label: 'Projects', icon: 'folder-outline', key: 'projects' },
      { screen: 'Users', label: 'User Management', icon: 'account-group', key: 'user_management' },
      { screen: 'FeedTopics', label: 'Feed Topics', icon: 'message-text-outline', key: 'feed_topics' },
      { screen: 'AttendanceApprovals', label: 'Approvals', icon: 'check-decagram', key: 'approvals' },
      { screen: 'Settings', label: 'Settings', icon: 'cog-outline', key: 'settings' },
      { screen: 'DeletedItems', label: 'Deleted Items', icon: 'delete-outline', key: 'deleted_items' },
      { screen: 'Reports', label: 'Reports', icon: 'chart-bar', key: 'reports' },
    ]
    return rawAdminItems.filter(item => hasTabAccess(currentUser, item.key!))
  }, [currentUser])

  const accountItems: NavigationItem[] = [
    { screen: 'Settings', label: 'Account', icon: 'account-circle-outline' },
    { screen: 'Debug', label: 'Debug Menu', icon: 'bug' },
  ]

  const handleNavigation = (item: NavigationItem) => {
    const missingScreens: string[] = [];

    // Debug menu is a modal, not a screen — open it and close the drawer.
    if (item.screen === 'Debug') {
      onClose();
      setDebugMenuVisible(true);
      return;
    }

    if (missingScreens.includes(item.screen)) {
      Alert.alert('Coming Soon', 'This feature is not yet available in the mobile app.');
      return;
    }

    if (item.screen === 'Home') {
      navigation.navigate('Main', { screen: 'HomeTab' });
    } else if (item.screen === 'DashboardScreen') {
      navigation.navigate('DashboardScreen');
    } else if (item.screen === 'TaskList') {
      navigation.navigate('Main', { screen: 'TasksTab' });
    } else if (item.screen === 'BugList') {
      navigation.navigate('Main', { screen: 'DevTab' });
    } else if (item.screen === 'Feed') {
      navigation.navigate('Main', { screen: 'FeedTab' });
    } else {
      navigation.navigate(item.screen);
    }
    onClose();
  }
  
  const showAdminSection = adminItems.length > 0

  const handleLogout = async () => {
    await signOut()
  }

  const getRoleDisplayName = (role: string) => {
    switch (role) {
      case 'amtarikshian':
        return 'Employee'
      case 'management':
        return 'Management'
      case 'top_management':
        return 'Top Management'
      case 'admin':
        return 'Admin'
      default:
        return role
    }
  }

  const getInitials = (name: string) => {
    if (!name) return '?'
    const parts = name.split(' ')
    if (parts.length >= 2) {
      return `${parts[0][0]}${parts[1][0]}`.toUpperCase()
    }
    return name.substring(0, 2).toUpperCase()
  }

  return (
    <>
    <Modal
      visible={visible}
      animationType="fade"
      transparent={true}
      onRequestClose={onClose}
    >
      <View style={styles.overlay}>
        <View style={styles.menuContainer}>
          <ScrollView style={styles.scrollView} showsVerticalScrollIndicator={false}>
            {/* Header */}
            <View style={styles.header}>
              <Image
                source={require('../../assets/amtariksha_logo.png')}
                style={styles.logo}
                resizeMode="contain"
              />
              <Text style={styles.appTitle}>Karmayog</Text>
              <IconButton
                icon="close"
                size={24}
                onPress={onClose}
                style={styles.closeButton}
                iconColor="#FFFFFF"
              />
            </View>

            {/* User Profile Section */}
            <View style={styles.profileSection}>
              <Avatar.Text
                size={60}
                label={currentUser ? getInitials(currentUser.name) : '?'}
                style={styles.avatar}
                color="#FFFFFF"
              />
              <Text style={styles.userName}>{currentUser?.name || 'Loading...'}</Text>
              <Text style={styles.userRole}>{currentUser ? getRoleDisplayName(currentUser.role) : ''}</Text>
              <Text style={styles.userEmployeeId}>{currentUser?.employeeId || ''}</Text>
            </View>

            <Divider style={styles.divider} />

            {/* Navigation Items */}
            <View style={styles.navigationSection}>
              {isFounder && (
                <>
                  <List.Item
                    title={founderStartItem.label}
                    left={(props) => <List.Icon {...props} icon={founderStartItem.icon} color={colors.primary} />}
                    onPress={() => handleNavigation(founderStartItem)}
                    style={styles.navItem}
                    titleStyle={styles.navItemTitle}
                    accessibilityRole="button"
                    accessibilityLabel="Open Start"
                  />
                  <Divider style={styles.divider} />
                </>
              )}
              {renderSection(homeItems)}

              <Divider style={styles.divider} />
              <List.Accordion
                title="Feed"
                left={props => <List.Icon {...props} icon="rss" color={colors.primary} />}
                style={[styles.navItem, { backgroundColor: colors.card }]}
                titleStyle={styles.navItemTitle}>
                {feedItems.map(item => (
                  <List.Item
                    key={item.label}
                    title={item.label}
                    left={props => <List.Icon {...props} icon={item.icon} color={colors.textSecondary} />}
                    onPress={() => handleNavigation(item)}
                    style={styles.adminNavItem}
                    titleStyle={styles.adminNavItemTitle}
                  />
                ))}
              </List.Accordion>

              <Divider style={styles.divider} />
              <List.Accordion
                title="Work"
                left={props => <List.Icon {...props} icon="briefcase" color={colors.primary} />}
                style={[styles.navItem, { backgroundColor: colors.card }]}
                titleStyle={styles.navItemTitle}>
                {workItems.map(item => (
                  <List.Item
                    key={item.label}
                    title={item.label}
                    left={props => <List.Icon {...props} icon={item.icon} color={colors.textSecondary} />}
                    onPress={() => handleNavigation(item)}
                    style={styles.adminNavItem}
                    titleStyle={styles.adminNavItemTitle}
                  />
                ))}
              </List.Accordion>

              <Divider style={styles.divider} />
              <List.Accordion
                title="Attendance"
                left={props => <List.Icon {...props} icon="calendar" color={colors.primary} />}
                style={[styles.navItem, { backgroundColor: colors.card }]}
                titleStyle={styles.navItemTitle}>
                {attendanceItems.map(item => (
                  <List.Item
                    key={item.label}
                    title={item.label}
                    left={props => <List.Icon {...props} icon={item.icon} color={colors.textSecondary} />}
                    onPress={() => handleNavigation(item)}
                    style={styles.adminNavItem}
                    titleStyle={styles.adminNavItemTitle}
                  />
                ))}
              </List.Accordion>

              {/* Admin Section */}
              {showAdminSection && (
                <>
                  <Divider style={styles.divider} />
                  <List.Accordion
                    title="Admin"
                    left={(props) => <List.Icon {...props} icon="shield-account" color={colors.primary} />}
                    expanded={expandedAdmin}
                    onPress={() => setExpandedAdmin(!expandedAdmin)}
                    style={[styles.navItem, { backgroundColor: colors.card }]}
                    titleStyle={styles.navItemTitle}
                  >
                    {adminItems.map((item) => (
                      <List.Item
                        key={item.label}
                        title={item.label}
                        left={(props) => <List.Icon {...props} icon={item.icon} color={colors.textSecondary} />}
                        onPress={() => handleNavigation(item)}
                        style={styles.adminNavItem}
                        titleStyle={styles.adminNavItemTitle}
                      />
                    ))}
                  </List.Accordion>
                </>
              )}

              <Divider style={styles.divider} />
              {renderSection(accountItems)}
            </View>

            <Divider style={styles.divider} />

            {/* Logout Button */}
            <View style={styles.logoutSection}>
              <Button
                mode="contained"
                onPress={handleLogout}
                icon="logout"
                buttonColor={colors.error}
                textColor="#FFFFFF"
                style={styles.logoutButton}
              >
                Logout
              </Button>
            </View>
          </ScrollView>
        </View>
        <TouchableOpacity style={styles.backdrop} onPress={onClose} activeOpacity={1} />
      </View>
    </Modal>
    <DebugMenu
      visible={debugMenuVisible}
      onClose={() => setDebugMenuVisible(false)}
    />
    </>
  )
}

const getStyles = (colors: any) => StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    flexDirection: 'row',
  },
  backdrop: {
    flex: 1,
  },
  menuContainer: {
    width: 300,
    backgroundColor: colors.card,
    shadowColor: '#000',
    shadowOffset: { width: 2, height: 0 },
    shadowOpacity: 0.25,
    shadowRadius: 8,
    elevation: 5,
  },
  scrollView: {
    flex: 1,
  },
  header: {
    backgroundColor: colors.primary,
    padding: materialSpacing.lg,
    paddingTop: materialSpacing.xxl,
    alignItems: 'center',
    position: 'relative',
  },
  logo: {
    width: 200,
    height: 50,
    marginBottom: materialSpacing.sm,
  },
  appTitle: {
    ...materialTypography.titleMedium,
    color: '#FFFFFF',
    fontWeight: '600',
  },
  closeButton: {
    position: 'absolute',
    right: 8,
    top: 8,
  },
  profileSection: {
    padding: materialSpacing.lg,
    alignItems: 'center',
    backgroundColor: colors.surfaceVariant,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  avatar: {
    backgroundColor: colors.primary,
    marginBottom: materialSpacing.md,
  },
  userName: {
    ...materialTypography.titleLarge,
    color: colors.text,
    fontWeight: '600',
  },
  userRole: {
    ...materialTypography.bodyMedium,
    color: colors.textSecondary,
    marginTop: materialSpacing.xs,
    textTransform: 'capitalize',
  },
  userEmployeeId: {
    ...materialTypography.bodySmall,
    color: colors.textTertiary,
    marginTop: materialSpacing.xs,
  },
  divider: {
    backgroundColor: colors.border,
    marginVertical: materialSpacing.sm,
  },
  navigationSection: {
    flex: 1,
  },
  navItem: {
    paddingVertical: materialSpacing.xs,
  },
  navItemTitle: {
    ...materialTypography.bodyLarge,
    color: colors.text,
  },
  adminNavItem: {
    paddingLeft: materialSpacing.xl,
    paddingVertical: materialSpacing.xs,
  },
  adminNavItemTitle: {
    ...materialTypography.bodyMedium,
    color: colors.textSecondary,
  },
  logoutSection: {
    padding: materialSpacing.md,
  },
  logoutButton: {
    borderRadius: 8,
  },
})
