import type {
  StorageAdapter,
  StorageDocument,
  StorageDocumentMetadata,
  StorageProviderRuntime,
  StorageTransferProgress,
  StorageUsage
} from '@/app/integrations/storage/types'
import {
  listFragmintDocumentNames,
  loadFragmintDocumentPayload,
  saveFragmintDocumentPayload
} from '@/app/plugins/fragmint/storage/connector'

const FRAGMINT_PROVIDER_ID = 'fragmint'
const EPOCH_ISO = new Date(0).toISOString()

function normalizeFullName(raw: string): string {
  const value = raw.trim()
  if (!value) throw new Error('Fragmint filename is required')
  return value
}

function toBase64(bytes: Uint8Array): string {
  let binary = ''
  const chunk = 0x8000
  for (let i = 0; i < bytes.length; i += chunk) {
    const part = bytes.subarray(i, i + chunk)
    binary += String.fromCharCode(...part)
  }
  return btoa(binary)
}

function encodeDocumentBytes(bytes: Uint8Array): string {
  return JSON.stringify({
    encoding: 'base64',
    data: toBase64(bytes)
  })
}

function fromBase64(data: string): Uint8Array {
  const binary = atob(data)
  const bytes = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i)
  return bytes
}

function decodeDocumentBytes(payload: string): Uint8Array {
  let parsed: unknown
  try {
    parsed = JSON.parse(payload)
  } catch (error) {
    throw new Error(
      `Fragmint document payload malformed JSON: ${error instanceof Error ? error.message : String(error)}`
    )
  }
  const asRecord =
    parsed && typeof parsed === 'object' && !Array.isArray(parsed)
      ? (parsed as Record<string, unknown>)
      : null
  if (!asRecord) throw new Error('Fragmint document payload is not an object')
  if (asRecord.encoding !== 'base64') {
    throw new Error(`Fragmint document payload encoding unsupported: ${String(asRecord.encoding)}`)
  }
  const data = asRecord.data
  if (typeof data !== 'string') throw new Error('Fragmint document payload missing base64 data')
  return fromBase64(data)
}

function logFragmintAdapterInfo(operation: string, stage: string, context: Record<string, unknown>): void {
  console.info('[Fragmint storage] adapter checkpoint', {
    operation,
    stage,
    providerId: FRAGMINT_PROVIDER_ID,
    ...context
  })
}

function logFragmintAdapterError(
  operation: string,
  stage: string,
  context: Record<string, unknown>,
  error: unknown
): void {
  console.error('[Fragmint storage] adapter failure', {
    operation,
    stage,
    providerId: FRAGMINT_PROVIDER_ID,
    ...context,
    error
  })
}

export type FragmintPersistOptions = {
  createOnly?: boolean
}

export async function persistFragmintDocument(
  id: string,
  bytes: Uint8Array,
  metadata: StorageDocumentMetadata,
  onProgress?: (progress: StorageTransferProgress) => void,
  options: FragmintPersistOptions = {}
): Promise<void> {
  const fullName = normalizeFullName(id)
  onProgress?.({ transferredBytes: 0, totalBytes: bytes.byteLength })
  await saveFragmintDocumentPayload(fullName, encodeDocumentBytes(bytes), metadata.name, {
    createOnly: options.createOnly === true
  })
  onProgress?.({ transferredBytes: bytes.byteLength, totalBytes: bytes.byteLength })
}

export function createFragmintStorageAdapter(_runtime: StorageProviderRuntime): StorageAdapter {
  logFragmintAdapterInfo('provider_init', 'adapter_initialized', {})
  return {
    async testConnection() {
      await listFragmintDocumentNames()
      return { ok: true, message: 'Connected to Fragmint storage.' }
    },

    async listDocuments(): Promise<StorageDocument[]> {
      const names = await listFragmintDocumentNames()
      logFragmintAdapterInfo('list_documents', 'list_documents_success', {
        documentCount: names.length
      })
      return names.map((fullName) => ({
        id: fullName,
        name: fullName,
        updatedAt: EPOCH_ISO,
        metadataAuthoritative: false
      }))
    },

    async getDocument(id, onProgress, signal): Promise<Uint8Array> {
      const fullName = normalizeFullName(id)
      signal?.throwIfAborted()
      onProgress?.({ transferredBytes: 0, totalBytes: null })
      const payload = await loadFragmintDocumentPayload(fullName)
      signal?.throwIfAborted()
      let bytes: Uint8Array
      try {
        bytes = decodeDocumentBytes(payload)
      } catch (error) {
        logFragmintAdapterError('get_document', 'decode_document_payload', { documentId: fullName }, error)
        throw error
      }
      onProgress?.({ transferredBytes: bytes.byteLength, totalBytes: bytes.byteLength })
      logFragmintAdapterInfo('get_document', 'get_document_success', {
        documentId: fullName,
        byteLength: bytes.byteLength
      })
      return bytes
    },

    async putDocument(
      id: string,
      bytes: Uint8Array,
      metadata: StorageDocumentMetadata,
      onProgress?: (progress: StorageTransferProgress) => void
    ): Promise<void> {
      await persistFragmintDocument(id, bytes, metadata, onProgress)
    },

    async deleteDocument(_id: string): Promise<void> {
      throw new Error('Fragmint deleteDocument is outside Diff 1 scope')
    },

    async getUsage(): Promise<StorageUsage> {
      const docs = await this.listDocuments()
      return {
        bytesUsed: 0,
        objectCount: docs.length,
        documentCount: docs.length
      }
    }
  }
}
