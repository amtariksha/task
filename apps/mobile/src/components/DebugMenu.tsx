/**
 * Debug Menu Component
 * In-app debugging interface for production testing
 */

import React, { useState } from 'react'
import {
  View,
  Text,
  Modal,
  TouchableOpacity,
  ScrollView,
  StyleSheet,
  Share,
  Alert,
} from 'react-native'
import { logger } from '../utils/debugLogger'
import AsyncStorage from '@react-native-async-storage/async-storage'
import { buildApiUrl } from '../config/api'
import { isDraftStorageKey } from '../utils/brainDump'

// Every signed-in account can open this menu, and a founder's Brain dump draft outlives sign-out.
const HIDDEN_VALUE = '(hidden: Brain dump draft)'

interface DebugMenuProps {
  visible: boolean
  onClose: () => void
}

export const DebugMenu: React.FC<DebugMenuProps> = ({ visible, onClose }) => {
  const [activeTab, setActiveTab] = useState<'logs' | 'info' | 'storage'>('logs')
  const [logs, setLogs] = useState(logger.getLogs())
  const [storageData, setStorageData] = useState<Record<string, any>>({})

  const refreshLogs = () => {
    setLogs(logger.getLogs())
  }

  const loadStorageData = async () => {
    try {
      const keys = await AsyncStorage.getAllKeys()
      const data: Record<string, any> = {}
      
      for (const key of keys) {
        data[key] = isDraftStorageKey(key) ? HIDDEN_VALUE : await AsyncStorage.getItem(key)
      }
      
      setStorageData(data)
    } catch (error) {
      Alert.alert('Error', 'Failed to load storage data')
    }
  }

  const exportLogs = async () => {
    try {
      const logsJson = logger.exportLogs()
      await Share.share({
        message: logsJson,
        title: 'Debug Logs',
      })
    } catch (error) {
      Alert.alert('Error', 'Failed to export logs')
    }
  }

  const clearLogs = () => {
    Alert.alert(
      'Clear Logs',
      'Are you sure you want to clear all logs?',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Clear',
          style: 'destructive',
          onPress: () => {
            logger.clearLogs()
            refreshLogs()
          },
        },
      ]
    )
  }

  const getLevelColor = (level: string) => {
    switch (level) {
      case 'error': return '#ef4444'
      case 'warn': return '#f59e0b'
      case 'info': return '#3b82f6'
      case 'debug': return '#6b7280'
      default: return '#000'
    }
  }

  React.useEffect(() => {
    if (visible) {
      refreshLogs()
      if (activeTab === 'storage') {
        loadStorageData()
      }
    }
  }, [visible, activeTab])

  return (
    <Modal visible={visible} animationType="slide" onRequestClose={onClose}>
      <View style={styles.container}>
        {/* Header */}
        <View style={styles.header}>
          <Text style={styles.title}>Debug Menu</Text>
          <TouchableOpacity onPress={onClose} style={styles.closeButton}>
            <Text style={styles.closeButtonText}>Close</Text>
          </TouchableOpacity>
        </View>

        {/* Tabs */}
        <View style={styles.tabs}>
          <TouchableOpacity
            style={[styles.tab, activeTab === 'logs' && styles.activeTab]}
            onPress={() => setActiveTab('logs')}
          >
            <Text style={[styles.tabText, activeTab === 'logs' && styles.activeTabText]}>
              Logs ({logs.length})
            </Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.tab, activeTab === 'info' && styles.activeTab]}
            onPress={() => setActiveTab('info')}
          >
            <Text style={[styles.tabText, activeTab === 'info' && styles.activeTabText]}>
              Info
            </Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.tab, activeTab === 'storage' && styles.activeTab]}
            onPress={() => setActiveTab('storage')}
          >
            <Text style={[styles.tabText, activeTab === 'storage' && styles.activeTabText]}>
              Storage
            </Text>
          </TouchableOpacity>
        </View>

        {/* Content */}
        <ScrollView style={styles.content}>
          {activeTab === 'logs' && (
            <View>
              <View style={styles.actions}>
                <TouchableOpacity onPress={refreshLogs} style={styles.actionButton}>
                  <Text style={styles.actionButtonText}>Refresh</Text>
                </TouchableOpacity>
                <TouchableOpacity onPress={exportLogs} style={styles.actionButton}>
                  <Text style={styles.actionButtonText}>Export</Text>
                </TouchableOpacity>
                <TouchableOpacity onPress={clearLogs} style={[styles.actionButton, styles.dangerButton]}>
                  <Text style={styles.actionButtonText}>Clear</Text>
                </TouchableOpacity>
              </View>
              
              {logs.slice().reverse().map((log, index) => (
                <View key={index} style={styles.logEntry}>
                  <View style={styles.logHeader}>
                    <Text style={[styles.logLevel, { color: getLevelColor(log.level) }]}>
                      {log.level.toUpperCase()}
                    </Text>
                    <Text style={styles.logCategory}>{log.category}</Text>
                    <Text style={styles.logTime}>
                      {new Date(log.timestamp).toLocaleTimeString()}
                    </Text>
                  </View>
                  <Text style={styles.logMessage}>{log.message}</Text>
                  {log.data && (
                    <Text style={styles.logData}>
                      {JSON.stringify(log.data, null, 2)}
                    </Text>
                  )}
                </View>
              ))}
            </View>
          )}

          {activeTab === 'info' && (
            <View style={styles.infoContainer}>
              <InfoRow label="Environment" value={__DEV__ ? 'Development' : 'Production'} />
              <InfoRow label="API URL" value={buildApiUrl('/api/graphql')} />
              <InfoRow label="Platform" value={require('react-native').Platform.OS} />
              <InfoRow label="Version" value={require('react-native').Platform.Version.toString()} />
            </View>
          )}

          {activeTab === 'storage' && (
            <View>
              <TouchableOpacity onPress={loadStorageData} style={styles.actionButton}>
                <Text style={styles.actionButtonText}>Refresh Storage</Text>
              </TouchableOpacity>
              {Object.entries(storageData).map(([key, value]) => (
                <View key={key} style={styles.storageEntry}>
                  <Text style={styles.storageKey}>{key}</Text>
                  <Text style={styles.storageValue}>{value}</Text>
                </View>
              ))}
            </View>
          )}
        </ScrollView>
      </View>
    </Modal>
  )
}

const InfoRow: React.FC<{ label: string; value: any }> = ({ label, value }) => (
  <View style={styles.infoRow}>
    <Text style={styles.infoLabel}>{label}:</Text>
    <Text style={styles.infoValue}>
      {typeof value === 'object' ? JSON.stringify(value) : String(value)}
    </Text>
  </View>
)

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#fff',
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#e5e7eb',
    backgroundColor: '#f9fafb',
  },
  title: {
    fontSize: 20,
    fontWeight: 'bold',
  },
  closeButton: {
    padding: 8,
  },
  closeButtonText: {
    color: '#3b82f6',
    fontSize: 16,
    fontWeight: '600',
  },
  tabs: {
    flexDirection: 'row',
    borderBottomWidth: 1,
    borderBottomColor: '#e5e7eb',
  },
  tab: {
    flex: 1,
    padding: 12,
    alignItems: 'center',
  },
  activeTab: {
    borderBottomWidth: 2,
    borderBottomColor: '#3b82f6',
  },
  tabText: {
    fontSize: 14,
    color: '#6b7280',
  },
  activeTabText: {
    color: '#3b82f6',
    fontWeight: '600',
  },
  content: {
    flex: 1,
    padding: 16,
  },
  actions: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: 16,
  },
  actionButton: {
    flex: 1,
    padding: 10,
    backgroundColor: '#3b82f6',
    borderRadius: 6,
    alignItems: 'center',
  },
  dangerButton: {
    backgroundColor: '#ef4444',
  },
  actionButtonText: {
    color: '#fff',
    fontWeight: '600',
  },
  logEntry: {
    marginBottom: 12,
    padding: 12,
    backgroundColor: '#f9fafb',
    borderRadius: 6,
    borderLeftWidth: 3,
    borderLeftColor: '#3b82f6',
  },
  logHeader: {
    flexDirection: 'row',
    marginBottom: 4,
    gap: 8,
  },
  logLevel: {
    fontWeight: 'bold',
    fontSize: 12,
  },
  logCategory: {
    fontSize: 12,
    color: '#6b7280',
    fontWeight: '600',
  },
  logTime: {
    fontSize: 11,
    color: '#9ca3af',
    marginLeft: 'auto',
  },
  logMessage: {
    fontSize: 14,
    marginBottom: 4,
  },
  logData: {
    fontSize: 12,
    fontFamily: 'monospace',
    color: '#4b5563',
    backgroundColor: '#f3f4f6',
    padding: 8,
    borderRadius: 4,
  },
  infoContainer: {
    gap: 12,
  },
  infoRow: {
    flexDirection: 'row',
    padding: 12,
    backgroundColor: '#f9fafb',
    borderRadius: 6,
  },
  infoLabel: {
    fontWeight: '600',
    marginRight: 8,
    minWidth: 100,
  },
  infoValue: {
    flex: 1,
    color: '#4b5563',
  },
  storageEntry: {
    marginBottom: 12,
    padding: 12,
    backgroundColor: '#f9fafb',
    borderRadius: 6,
  },
  storageKey: {
    fontWeight: '600',
    marginBottom: 4,
  },
  storageValue: {
    fontSize: 12,
    fontFamily: 'monospace',
    color: '#4b5563',
  },
})

