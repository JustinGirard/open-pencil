import { defineStorageProvider, StorageProviderRegistry } from './registry'
import { createFragmintStorageAdapter } from '@/app/plugins/fragmint/storage/adapter'
import { createS3StorageAdapter } from './s3/adapter'

export const S3_STORAGE_PROVIDER = defineStorageProvider({
  id: 's3-compatible',
  label: 'S3 storage',
  description: 'AWS S3, Backblaze B2, Cloudflare R2, MinIO, and compatible storage',
  preferenceFields: [
    { id: 'endpoint', label: 'Endpoint', kind: 'url', required: true },
    { id: 'bucket', label: 'Bucket', kind: 'text', required: true },
    { id: 'region', label: 'Region', kind: 'text' }
  ],
  credentialFields: [
    { id: 'access-key-id', label: 'Access key ID', required: true },
    { id: 'secret-access-key', label: 'Secret access key', required: true }
  ],
  createAdapter: createS3StorageAdapter
})

export const FRAGMINT_STORAGE_PROVIDER = defineStorageProvider({
  id: 'fragmint',
  label: 'Fragmint storage',
  description: 'Fragmint Node MCP FieldSet storage',
  preferenceFields: [],
  credentialFields: [],
  createAdapter: createFragmintStorageAdapter
})

export const storageProviderRegistry = new StorageProviderRegistry([
  S3_STORAGE_PROVIDER,
  FRAGMINT_STORAGE_PROVIDER
])
