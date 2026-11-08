import type { StorageDocumentBinding, StorageProviderID } from '@/app/integrations/storage/types'
import { notificationMessages } from '@/app/i18n/notifications'
import { rememberRecentStorageDocument } from '@/app/recent-files'
import { toast } from '@/app/shell/ui'
import { FragmintDocumentExistsError } from '@/app/plugins/fragmint/storage/connector'
import { persistFragmintDocument } from '@/app/plugins/fragmint/storage/adapter'
import { requestFragmintSaveAsName } from '@/app/plugins/fragmint/storage/saveAsDialog'

const FRAGMINT_PROVIDER_ID: StorageProviderID = 'fragmint'

type FragmintSaveTarget = {
  state: { documentName: string }
  getStorageBinding: () => StorageDocumentBinding | null
  saveFigFileToStorageDocument: (
    providerId: StorageProviderID,
    documentId: string,
    documentName: string,
    persistDocument: (figBytes: Uint8Array, metadata: { name: string; updatedAt: string }) => Promise<void>
  ) => Promise<boolean>
}

function defaultFullName(documentName: string): string {
  const trimmed = documentName.trim()
  if (!trimmed) return 'Untitled.fig'
  return /\.fig$/i.test(trimmed) ? trimmed : `${trimmed}.fig`
}

function normalizeFullName(raw: string): string {
  const trimmed = raw.trim()
  if (!trimmed) throw new Error('Fragmint filename is required')
  return /\.fig$/i.test(trimmed) ? trimmed : `${trimmed}.fig`
}

function currentFragmintFullName(store: FragmintSaveTarget): string {
  const binding = store.getStorageBinding()
  if (binding?.providerId !== FRAGMINT_PROVIDER_ID) return defaultFullName(store.state.documentName)
  return normalizeFullName(binding.documentId)
}

async function persistToFragmint(
  store: FragmintSaveTarget,
  fullName: string,
  options: { createOnly: boolean }
): Promise<boolean> {
  try {
    const saved = await store.saveFigFileToStorageDocument(
      FRAGMINT_PROVIDER_ID,
      fullName,
      fullName,
      (figBytes, metadata) =>
        persistFragmintDocument(fullName, figBytes, metadata, undefined, {
          createOnly: options.createOnly
        })
    )
    if (!saved) return false
    rememberRecentStorageDocument(FRAGMINT_PROVIDER_ID, fullName, fullName)
    toast.info(`Saved in Fragmint: ${fullName}`)
    return true
  } catch (error) {
    if (error instanceof FragmintDocumentExistsError) {
      toast.error(error.message)
      return false
    }
    toast.error(notificationMessages.get().operationFailed({
      error: error instanceof Error ? error.message : String(error)
    }))
    return false
  }
}

export async function saveInFragmint(store: FragmintSaveTarget): Promise<boolean> {
  const fullName = currentFragmintFullName(store)
  return persistToFragmint(store, fullName, { createOnly: false })
}

export async function saveAsInFragmint(store: FragmintSaveTarget): Promise<boolean> {
  const raw = await requestFragmintSaveAsName(currentFragmintFullName(store))
  if (raw == null) return false
  const fullName = normalizeFullName(raw)
  return persistToFragmint(store, fullName, { createOnly: true })
}
