import { get as getSharedStorage } from '@/app/plugins/fragmint/sharedStorage'
import { getFragmintBaseUrl } from '@/app/plugins/fragmint/baseUrl'
import { ApplicationState } from '@/app/plugins/application-state/ApplicationState'
import { BaseData, type DataRecord } from '@/app/plugins/base/BaseData'

export interface FragmintBridgeConfig {
  remoteName: string
  manifestUrl: string
  canvasId: string
  serverUrl: string
  authEmail: string
  authToken: string
  graphPath: string | null
  singleGraphViewerEnabled: boolean | null
  applicationEnv: ApplicationEnvSpec
}

const LEGACY_SERVER_SESSION_KEY = 'basepage_signin_demo.server_session'
const LEGACY_FRAGMINT_CONTENT_URL = '/fragmint_content.json'

class LegacyContentSpec extends BaseData.define({
  sections: 'array'
}) {}

class LegacySectionDocumentSpec extends BaseData.define({
  sections: 'array'
}) {}

class LegacyUnitySectionSpec extends BaseData.define({
  remote_name: 'string',
  manifest_url: 'string',
  canvas_id: 'string',
  application_env: 'object'
}) {}

class RemoteSelectionSpec extends BaseData.define({
  server_url: 'string',
  user_email: 'string',
  user_token: 'string'
}) {}

class LegacyServerSessionSpec extends BaseData.define({
  remote: RemoteSelectionSpec
}) {}

class BridgeQuerySpec extends BaseData.define({
  remote_name: ['string', 'remote'],
  manifest_url: ['string', '/generated/unity/unity-manifest.json'],
  canvas_id: 'string',
  graph_path: ['string', null],
  application_env: 'string'
}) {}

export class ApplicationEnvSpec extends BaseData.define({
  servers: ['object', {}],
  selected_server: ['string'],
  single_graph_viewer_enabled: ['boolean', null],
  graph_path: ['string']
}) {}

function parseObjectJson(value: string): DataRecord {
  const parsed = JSON.parse(value)
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed))
    throw new Error('[fragmint-plugin] application_env must be a JSON object')
  return parsed as DataRecord
}

async function fetchJson(url: string, label: string): Promise<DataRecord> {
  const res = await fetch(url, { cache: 'no-store' })
  if (!res.ok) throw new Error(`[fragmint-plugin] ${label} fetch failed: ${res.status} ${url}`)
  return (await res.json()) as DataRecord
}

async function loadBridgeQueryInput(): Promise<DataRecord> {
  const contentRaw = await fetchJson(LEGACY_FRAGMINT_CONTENT_URL, 'content')
  const content = new LegacyContentSpec(contentRaw)
  const sectionPath = content.sections[0] as string

  const sectionDocumentRaw = await fetchJson(sectionPath, 'section')
  const sectionDocument = new LegacySectionDocumentSpec(sectionDocumentRaw)

  const unitySectionRaw = sectionDocument.sections[0] as DataRecord
  const section = new LegacyUnitySectionSpec(unitySectionRaw)

  const applicationEnvRaw = section.application_env as DataRecord
  const applicationEnv = new ApplicationEnvSpec(applicationEnvRaw)
  const graphFileState = ApplicationState.Instance('graph_file_state', {
    selected_graph_path: applicationEnv.graph_path
  })
  const selectedGraphPath = graphFileState['selected_graph_path'] as string

  const bridgeInput = {
    remote_name: section.remote_name,
    manifest_url: section.manifest_url,
    canvas_id: section.canvas_id,
    graph_path: selectedGraphPath,
    application_env: JSON.stringify(section.application_env)
  }
  return bridgeInput
}

export async function resolveFragmintBridgeConfig(): Promise<FragmintBridgeConfig> {
  try {
    const bridgeInput = await loadBridgeQueryInput()
    const query = new BridgeQuerySpec(bridgeInput)

    const sessionSource = getSharedStorage(LEGACY_SERVER_SESSION_KEY) as unknown

    const sessionRaw = sessionSource as DataRecord
    const serverUrl = `${getFragmintBaseUrl()}/cmd`
    if (!serverUrl) throw new Error('[fragmint-plugin] failed to resolve server_url')
    ;(sessionRaw as DataRecord).server_url = serverUrl
    ;(sessionRaw as DataRecord).req_mode = 'mcp_http_service'
    const session = new LegacyServerSessionSpec({
      remote: {
        server_url: sessionRaw.server_url,
        user_email: sessionRaw.email,
        user_token: sessionRaw.auth_token
      }
    })
    const remote = session.remote

    const parsedApplicationEnv = parseObjectJson(query.application_env)
    const applicationEnv = new ApplicationEnvSpec(parsedApplicationEnv)
    const singleGraphViewerEnabled = applicationEnv.single_graph_viewer_enabled as boolean | null

    return {
      remoteName: query.remote_name.trim(),
      manifestUrl: query.manifest_url.trim(),
      canvasId: query.canvas_id.trim(),
      serverUrl: remote.server_url,
      authEmail: remote.user_email,
      authToken: remote.user_token,
      graphPath: query.graph_path,
      singleGraphViewerEnabled,
      applicationEnv
    }
  } catch (error) {
    throw error
  }
}
