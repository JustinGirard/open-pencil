import { BaseData, type DataRecord } from '@/app/plugins/base/BaseData'

export interface UnityManifest {
  loaderUrl: string
  dataUrl: string
  frameworkUrl: string
  codeUrl: string
  streamingAssetsUrl?: string
  companyName?: string
  productName?: string
  productVersion?: string
  matchWebGLToCanvasSize?: boolean
}

class UnityManifestSpec extends BaseData.define({
  loaderUrl: 'string',
  dataUrl: 'string',
  frameworkUrl: 'string',
  codeUrl: 'string'
}) {}

export async function fetchUnityManifest(manifestUrl: string): Promise<UnityManifest> {
  const res = await fetch(manifestUrl, { cache: 'no-store' })
  if (!res.ok) throw new Error(`[fragmint-plugin] manifest fetch failed: ${res.status} ${manifestUrl}`)
  const manifest = new UnityManifestSpec((await res.json()) as DataRecord)
  return manifest as unknown as UnityManifest
}
