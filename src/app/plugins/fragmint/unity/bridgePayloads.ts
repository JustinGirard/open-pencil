import { BaseData, type DataRecord } from '@/app/plugins/base/BaseData'
import type { FragmintBridgeConfig } from '@/app/plugins/fragmint/unity/bridgeConfig'
import { ApplicationEnvSpec } from '@/app/plugins/fragmint/unity/bridgeConfig'
import { ApplicationState } from '@/app/plugins/application-state/ApplicationState'

type UnityInstance = { SendMessage?: (objectName: string, methodName: string, payload?: string) => void }

class ServerRegistrationPayloadSpec extends BaseData.define({
  req_mode: 'string',
  server_url: 'string',
  user_email: 'string',
  user_token: 'string'
}) {}

export function sendBridgeMessage(
  unity: UnityInstance,
  method: 'UpsertAndSelectServerRegistration' | 'ConfigureSingleGraphViewer',
  payloadJson: string
): boolean {
  if (typeof unity.SendMessage !== 'function') return false
  try {
    unity.SendMessage('WebRuntimeBridge', method, payloadJson)
    return true
  } catch (error) {
    console.warn(`[fragmint-plugin] bridge call failed: ${method}`, error)
    return false
  }
}

export function buildStartupApplicationEnvPayload(
  cfg: FragmintBridgeConfig
): Record<string, unknown> | null {
  const next = new ApplicationEnvSpec(cfg.applicationEnv)
  const graphFileState = ApplicationState.Instance('graph_file_state')
  const selectedGraphPath = graphFileState['selected_graph_path']
  if (typeof selectedGraphPath === 'string') {
    const trimmedSelectedGraphPath = selectedGraphPath.trim()
    if (trimmedSelectedGraphPath.length > 0) next.graph_path = trimmedSelectedGraphPath
  }
  next.single_graph_viewer_enabled = cfg.singleGraphViewerEnabled
  const servers = { ...(next.servers as DataRecord) }
  servers[cfg.remoteName] = new ServerRegistrationPayloadSpec({
    req_mode: 'mcp_http_service',
    server_url: cfg.serverUrl,
    user_email: cfg.authEmail,
    user_token: cfg.authToken
  }) as unknown as DataRecord
  next.servers = servers
  next.selected_server = cfg.remoteName
  return next as unknown as Record<string, unknown>
}

export function buildGraphRetargetPayload(cfg: FragmintBridgeConfig): Record<string, unknown> | null {
  if (!cfg.graphPath) return null
  return { graph_path: cfg.graphPath }
}
