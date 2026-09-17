import { useEffect, useState, type JSX } from 'react'
import { StyleSheet } from 'react-native'
import { Button, Dialog, HelperText, Portal, TextInput } from 'react-native-paper'
import { useMutation } from '@apollo/client/react'
import { useToast } from '../../contexts/ToastContext'
import { useNetworkStatus } from '../../hooks/useNetworkStatus'
import { CREATE_FOUNDER_RESUME_POINT } from '../../config/founder-queries'
import type { FounderThread } from '../../types/founder'

const LABEL_MAX_LENGTH = 120
const FALLBACK_ERROR = 'Could not add the thread.'

interface CreateResumePointData {
  createFounderResumePoint: FounderThread
}

interface CreateResumePointVariables {
  label: string
  projectId?: string | null
}

export interface FounderAddThreadDialogProps {
  visible: boolean
  onDismiss: () => void
  onCreated: () => void
}

export function FounderAddThreadDialog({ visible, onDismiss, onCreated }: FounderAddThreadDialogProps): JSX.Element {
  const { showToast } = useToast()
  const { isConnected, isInternetReachable } = useNetworkStatus()
  // NetInfo reports reachability as null while unknown; only treat an explicit false as offline.
  const isOffline = isConnected === false || isInternetReachable === false

  const [label, setLabel] = useState('')
  const trimmedLabel = label.trim()
  const [createThread, { loading: saving }] = useMutation<CreateResumePointData, CreateResumePointVariables>(
    CREATE_FOUNDER_RESUME_POINT,
    { variables: { label: trimmedLabel } },
  )

  useEffect(() => {
    if (visible) setLabel('')
  }, [visible])

  const canAdd = trimmedLabel.length > 0 && !saving && !isOffline

  const handleAdd = async (): Promise<void> => {
    if (!canAdd) return
    try {
      const result = await createThread({ variables: { label: trimmedLabel } })
      if (result.error || !result.data?.createFounderResumePoint) {
        showToast(result.error?.message ?? FALLBACK_ERROR, 'error')
        return
      }
      showToast('Thread added', 'success')
      onCreated()
      onDismiss()
    } catch (error: unknown) {
      showToast(error instanceof Error ? error.message : FALLBACK_ERROR, 'error')
    }
  }

  return (
    <Portal>
      <Dialog visible={visible} onDismiss={onDismiss} style={styles.dialog}>
        <Dialog.Title>Add thread</Dialog.Title>
        <Dialog.Content>
          <TextInput
            label="Label"
            value={label}
            onChangeText={setLabel}
            mode="outlined"
            autoFocus
            maxLength={LABEL_MAX_LENGTH}
            returnKeyType="done"
            onSubmitEditing={handleAdd}
            editable={!saving}
            accessibilityLabel="Thread label"
          />
          {isOffline ? (
            <HelperText type="error" visible>
              You are offline — connect to add a thread.
            </HelperText>
          ) : (
            <HelperText type="info" visible>
              {`${trimmedLabel.length}/${LABEL_MAX_LENGTH}`}
            </HelperText>
          )}
        </Dialog.Content>
        <Dialog.Actions>
          <Button onPress={onDismiss} accessibilityRole="button" accessibilityLabel="Cancel adding thread">
            Cancel
          </Button>
          <Button
            mode="contained"
            onPress={handleAdd}
            loading={saving}
            disabled={!canAdd}
            accessibilityRole="button"
            accessibilityLabel="Add thread"
          >
            Add
          </Button>
        </Dialog.Actions>
      </Dialog>
    </Portal>
  )
}

const styles = StyleSheet.create({
  dialog: {
    borderRadius: 16,
  },
})
