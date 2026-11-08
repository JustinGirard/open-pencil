import { resolveFragmintBridgeConfig } from '@/app/plugins/fragmint/unity/bridgeConfig'

const ROOT_PATH = '__root'
const FIELD_SET_CLASS_NAME = 'FieldSet'
const FIELD_SET_CLASS_PATH = '../../nodes/field_set.py'
const FRAGMINT_FILE_PREFIX = 'fragmint_file_'

type Dict = Record<string, unknown>

function asObject(value: unknown): Dict | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null
  return value as Dict
}

function normalizeFullName(raw: string): string {
  const value = raw.trim()
  if (!value) throw new Error('Fragmint full filename is required')
  return value
}

function nodeIdForFullName(fullName: string): string {
  return `${FRAGMINT_FILE_PREFIX}${fullName}`
}

function fullNameFromNodeId(nodeId: string): string {
  return nodeId.slice(FRAGMINT_FILE_PREFIX.length)
}

function extractFragmintErrorDetail(payload: Dict | null, raw: string): string | null {
  const details: string[] = []
  const pushDetail = (value: unknown): void => {
    if (value == null) return
    if (typeof value === 'string') {
      const text = value.trim()
      if (text) details.push(text)
      return
    }
    if (typeof value === 'number' || typeof value === 'boolean') {
      details.push(String(value))
      return
    }
    if (typeof value === 'object') {
      try {
        const text = JSON.stringify(value)
        if (text && text !== '{}' && text !== '[]' && text !== 'null') details.push(text)
      } catch (_error) {
        return
      }
    }
  }

  if (payload) {
    pushDetail(payload.error)
    pushDetail(payload.reason)
    pushDetail(payload.message)
    pushDetail(payload.detail)
    pushDetail(payload.traceback)
    const result = asObject(payload.result)
    if (result) pushDetail(result.error)
  }
  pushDetail(raw)
  return details.length > 0 ? details[0] : null
}

type FragmintFailurePhase =
  | 'request_error'
  | 'http_error'
  | 'malformed_response'
  | 'payload_error'
  | 'status_error'
  | 'result_error'

function logFragmintCommandFailure(
  commandId: string,
  phase: FragmintFailurePhase,
  context: {
    httpStatus: number
    responseBodyLength: number
    responseKeys: string[]
    parseError?: string | null
    detail?: string | null
    error?: unknown
  }
): void {
  console.error('[Fragmint storage] command failed', {
    command: commandId,
    phase,
    httpStatus: context.httpStatus,
    responseBodyLength: context.responseBodyLength,
    responseKeys: context.responseKeys,
    detail: context.detail ?? null,
    parseError: context.parseError ?? null,
    error: context.error
  })
}

function logFragmintOperationFailure(
  operation: string,
  stage: string,
  context: Dict,
  error: unknown
): void {
  console.error('[Fragmint storage] operation failed', {
    operation,
    stage,
    ...context,
    error
  })
}

async function postFragmintCommand(commandId: string, data: Dict): Promise<Dict> {
  let response: Response
  try {
    const cfg = await resolveFragmintBridgeConfig()
    response = await fetch(cfg.serverUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        command_id: commandId,
        data: {
          auth_email: cfg.authEmail,
          auth_token: cfg.authToken,
          ...data
        }
      })
    })
  } catch (error) {
    logFragmintCommandFailure(commandId, 'request_error', {
      httpStatus: 0,
      responseBodyLength: 0,
      responseKeys: [],
      detail: 'request_setup_or_network',
      error
    })
    throw error
  }
  const raw = await response.text()
  let payload: Dict | null = null
  let parseError: string | null = null
  try {
    payload = asObject(JSON.parse(raw))
    if (!payload) parseError = 'response JSON was not an object'
  } catch (error) {
    parseError = error instanceof Error ? error.message : String(error)
  }
  if (!response.ok) {
    const detail = extractFragmintErrorDetail(payload, raw)
    logFragmintCommandFailure(commandId, 'http_error', {
      httpStatus: response.status,
      responseBodyLength: raw.length,
      responseKeys: payload ? Object.keys(payload) : [],
      parseError,
      detail
    })
    if (detail) throw new Error(`Fragmint ${commandId} failed: HTTP ${response.status} - ${detail}`)
    throw new Error(`Fragmint ${commandId} failed: HTTP ${response.status}`)
  }
  if (parseError) {
    logFragmintCommandFailure(commandId, 'malformed_response', {
      httpStatus: response.status,
      responseBodyLength: raw.length,
      responseKeys: payload ? Object.keys(payload) : [],
      parseError,
      detail: null
    })
    throw new Error(`Fragmint ${commandId} malformed JSON response: ${parseError}`)
  }
  if (!payload) {
    logFragmintCommandFailure(commandId, 'malformed_response', {
      httpStatus: response.status,
      responseBodyLength: raw.length,
      responseKeys: [],
      parseError: 'response JSON was not an object',
      detail: null
    })
    throw new Error(`Fragmint ${commandId} malformed JSON response: response JSON was not an object`)
  }
  const payloadErrorDetail = extractFragmintErrorDetail(payload, '')
  if (payload.error != null) {
    logFragmintCommandFailure(commandId, 'payload_error', {
      httpStatus: response.status,
      responseBodyLength: raw.length,
      responseKeys: Object.keys(payload),
      detail: payloadErrorDetail
    })
    throw new Error(`Fragmint ${commandId} error: ${payloadErrorDetail ? payloadErrorDetail : String(payload.error)}`)
  }
  if (payload.status === 'error') {
    logFragmintCommandFailure(commandId, 'status_error', {
      httpStatus: response.status,
      responseBodyLength: raw.length,
      responseKeys: Object.keys(payload),
      detail: payloadErrorDetail
    })
    throw new Error(`Fragmint ${commandId} returned status=error${payloadErrorDetail ? `: ${payloadErrorDetail}` : ''}`)
  }
  const result = asObject(payload.result)
  if (result?.error != null) {
    logFragmintCommandFailure(commandId, 'result_error', {
      httpStatus: response.status,
      responseBodyLength: raw.length,
      responseKeys: Object.keys(payload),
      detail: payloadErrorDetail
    })
    throw new Error(`Fragmint ${commandId} result error: ${payloadErrorDetail ? payloadErrorDetail : String(result.error)}`)
  }
  return payload
}

type RootGraphSnapshot = {
  executionGraphPath: string
  graph: Record<string, Dict>
}

async function getRootGraphSnapshot(): Promise<RootGraphSnapshot> {
  const response = await postFragmintCommand('graph_op', {
    root_path: ROOT_PATH,
    op: 'get_graph'
  })
  const executionGraphPath = String(response.execution_graph_path ?? '').trim()
  if (!executionGraphPath) throw new Error('Fragmint graph_op(get_graph) missing execution_graph_path')
  const result = asObject(response.result)
  const graphRaw = result ? asObject(result.graph) : null
  if (!graphRaw) throw new Error('Fragmint graph_op(get_graph) missing graph payload')
  const graph: Record<string, Dict> = {}
  for (const [nodeId, value] of Object.entries(graphRaw)) {
    const node = asObject(value)
    if (node) graph[nodeId] = node
  }
  return { executionGraphPath, graph }
}

async function ensureFieldSchema(nodeId: string): Promise<void> {
  await postFragmintCommand('execute', {
    target: {
      root_path: ROOT_PATH,
      cache_path: nodeId,
      class_path: FIELD_SET_CLASS_PATH,
      class_name: FIELD_SET_CLASS_NAME
    },
    name: 'set_fields',
    args: {
      query: {
        document_content: { type: 'file' },
        document_name: { type: 'str' }
      }
    }
  })
}

export type FragmintResolvedNode = {
  fullName: string
  nodeId: string
  created: boolean
  executionGraphPath: string
}

export class FragmintDocumentExistsError extends Error {
  constructor(fullName: string) {
    super(`Fragmint document already exists: ${fullName}`)
    this.name = 'FragmintDocumentExistsError'
  }
}

async function deleteDocumentNode(nodeId: string, executionGraphPath: string): Promise<void> {
  await postFragmintCommand('graph_op', {
    root_path: ROOT_PATH,
    execution_graph_path: executionGraphPath,
    op: 'delete_node',
    payload: {
      node_id: nodeId,
      allow_null: true
    }
  })
}

export async function resolveFragmintDocumentNode(
  fullNameRaw: string,
  options: { createIfMissing: boolean; createOnly?: boolean }
): Promise<FragmintResolvedNode | null> {
  const fullName = normalizeFullName(fullNameRaw)
  const expectedNodeId = nodeIdForFullName(fullName)
  const createOnly = options.createOnly === true
  const snapshot = await getRootGraphSnapshot()
  const existing = snapshot.graph[expectedNodeId]
  if (existing) {
    if (existing.clas !== FIELD_SET_CLASS_NAME) {
      throw new Error(
        `Fragmint node-id collision: "${expectedNodeId}" exists but is not ${FIELD_SET_CLASS_NAME}`
      )
    }
    if (createOnly) throw new FragmintDocumentExistsError(fullName)
    return {
      fullName,
      nodeId: expectedNodeId,
      created: false,
      executionGraphPath: snapshot.executionGraphPath
    }
  }
  if (!options.createIfMissing) return null

  const created = await postFragmintCommand('graph_op', {
    root_path: ROOT_PATH,
    execution_graph_path: snapshot.executionGraphPath,
    op: 'create_node',
    payload: {
      clas: FIELD_SET_CLASS_NAME,
      name: fullName,
      settings: {
        cache_path: expectedNodeId
      }
    }

  })
  const createdResult = asObject(created.result)
  const createdNodeId = String(createdResult?.node_id ?? '').trim()
  if (!createdNodeId) {
    throw new Error(`Fragmint create_node missing node_id for "${fullName}"`)
  }
  if (createdNodeId !== expectedNodeId) {
    let cleanupFailed = false
    try {
      await deleteDocumentNode(createdNodeId, snapshot.executionGraphPath)
    } catch (cleanupError) {
      cleanupFailed = true
      logFragmintOperationFailure(
        'resolve_document_node',
        'cleanup_created_node_on_id_mismatch',
        { fullName, expectedNodeId, createdNodeId },
        cleanupError
      )
    }

    const cleanupSuffix = cleanupFailed ? ' Cleanup failed; node may remain.' : ' Cleaned up created node.'
    throw new Error(
      `Fragmint create_node contract mismatch: expected node_id "${expectedNodeId}", got "${createdNodeId}".${cleanupSuffix}`
    )
  }
  return {
    fullName,
    nodeId: expectedNodeId,
    created: true,
    executionGraphPath: snapshot.executionGraphPath
  }
}

export async function listFragmintDocumentNames(): Promise<string[]> {
  const snapshot = await getRootGraphSnapshot()
  const names: string[] = []
  for (const [nodeId, node] of Object.entries(snapshot.graph)) {
    if (!nodeId.startsWith(FRAGMINT_FILE_PREFIX)) continue
    if (node.clas !== FIELD_SET_CLASS_NAME) continue
    const fullName = fullNameFromNodeId(nodeId)
    if (!fullName) continue
    names.push(fullName)
  }
  return names.sort((a, b) => a.localeCompare(b))
}

export async function fragmintDocumentExists(fullNameRaw: string): Promise<boolean> {
  const resolved = await resolveFragmintDocumentNode(fullNameRaw, { createIfMissing: false })
  return resolved !== null
}

export async function loadFragmintDocumentPayload(fullNameRaw: string): Promise<string> {
  const fullName = normalizeFullName(fullNameRaw)
  let resolved: FragmintResolvedNode | null = null
  let stage = 'resolve_document_node'
  try {
    resolved = await resolveFragmintDocumentNode(fullName, { createIfMissing: false })
    if (!resolved) throw new Error(`Fragmint document not found: ${fullName}`)

    stage = 'execute_get_data'
    const response = await postFragmintCommand('execute', {
      target: {
        root_path: ROOT_PATH,
        cache_path: resolved.nodeId,
        class_path: FIELD_SET_CLASS_PATH,
        class_name: FIELD_SET_CLASS_NAME
      },
      name: 'get_data',
      args: {}
    })

    stage = 'validate_get_data_document_content'
    const contentPayload = response.document_content
    if (typeof contentPayload !== 'string') {
      throw new Error(`Fragmint get_data missing document_content for "${fullName}"`)
    }
    return contentPayload
  } catch (error) {
    logFragmintOperationFailure(
      'load_document_payload',
      stage,
      {
        fullName,
        nodeId: resolved?.nodeId ?? null
      },
      error
    )
    throw error
  }
}

export async function saveFragmintDocumentPayload(
  fullNameRaw: string,
  contentPayload: string,
  documentName: string,
  options: { createOnly?: boolean } = {}
): Promise<FragmintResolvedNode> {
  const resolved = await resolveFragmintDocumentNode(fullNameRaw, {
    createIfMissing: true,
    createOnly: options.createOnly === true
  })
  if (!resolved) throw new Error('Fragmint save could not resolve destination node')
  try {
    await ensureFieldSchema(resolved.nodeId)
    await postFragmintCommand('execute', {
      target: {
        root_path: ROOT_PATH,
        cache_path: resolved.nodeId,
        class_path: FIELD_SET_CLASS_PATH,
        class_name: FIELD_SET_CLASS_NAME
      },
      name: 'set_data',
      args: {
        document_content: contentPayload,
        document_name: documentName
      }
    })
    return resolved
  } catch (error) {
    logFragmintOperationFailure(
      'save_document_payload',
      'ensure_schema_or_set_data',
      {
        fullName: resolved.fullName,
        nodeId: resolved.nodeId,
        created: resolved.created
      },
      error
    )
    if (!resolved.created) throw error

    try {
      await deleteDocumentNode(resolved.nodeId, resolved.executionGraphPath)
    } catch (cleanupError) {
      logFragmintOperationFailure(
        'save_document_payload',
        'cleanup_created_node_after_save_failure',
        {
          fullName: resolved.fullName,
          nodeId: resolved.nodeId,
          executionGraphPath: resolved.executionGraphPath
        },
        cleanupError
      )

      throw new Error(
        `${error instanceof Error ? error.message : String(error)} Cleanup failed for created document node "${resolved.nodeId}": ${cleanupError instanceof Error ? cleanupError.message : String(cleanupError)}`
      )
    }
    throw error
  }
}
