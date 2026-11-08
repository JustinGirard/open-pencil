import { BaseData, type DataRecord } from '@/app/plugins/base/BaseData'
import { resolveFragmintBridgeConfig } from '@/app/plugins/fragmint/unity/bridgeConfig'

export interface ListFragmintNodesForGraphInput {
  rootPath: string
  executionGraphPath: string
}

class ListNodesResultLooseSpec extends BaseData.define({
  status: ['string'],
  error: ['any'],
  reason: ['any'],
  node_ids: ['any']
}) {}

class ListNodesEnvelopeLooseSpec extends BaseData.define({
  status: ['string'],
  error: ['any'],
  reason: ['any'],
  http_code: ['any'],
  result: [ListNodesResultLooseSpec]
}) {}

class ListNodesResultSuccessSpec extends BaseData.define({
  node_ids: { listOf: 'string' }
}) {}

class ListNodesEnvelopeSuccessSpec extends BaseData.define({
  result: ListNodesResultSuccessSpec,
  status: ['string'],
  error: ['any'],
  reason: ['any'],
  http_code: ['any']
}) {}

export class FragmintNodeListError extends Error {
  readonly diagnostics: Record<string, unknown>

  constructor(message: string, diagnostics: Record<string, unknown>) {
    super(message)
    this.name = 'FragmintNodeListError'
    this.diagnostics = diagnostics
  }
}

let listNodesRequestSeq = 0

function nextListNodesRequestId(): string {
  listNodesRequestSeq += 1
  return `list-nodes-${listNodesRequestSeq}`
}

function sanitizeText(raw: string, authEmail: string, authToken: string): string {
  let next = raw
  if (authEmail) next = next.split(authEmail).join('[REDACTED_EMAIL]')
  if (authToken) next = next.split(authToken).join('[REDACTED_TOKEN]')
  return next
}

function sanitizeDiagnosticValue(value: unknown, authEmail: string, authToken: string): unknown {
  if (typeof value === 'string') return sanitizeText(value, authEmail, authToken)
  if (Array.isArray(value)) return value.map((item) => sanitizeDiagnosticValue(item, authEmail, authToken))
  if (!value || typeof value !== 'object') return value

  const out: Record<string, unknown> = {}
  for (const [key, item] of Object.entries(value as Record<string, unknown>)) {
    out[key] = sanitizeDiagnosticValue(item, authEmail, authToken)
  }
  return out
}

function buildDiagnostics(
  diagnostics: Record<string, unknown>,
  authEmail: string,
  authToken: string
): Record<string, unknown> {
  return sanitizeDiagnosticValue(diagnostics, authEmail, authToken) as Record<string, unknown>
}

function parseNodeIds(
  payload: unknown,
  rawResponse: string,
  authEmail: string,
  authToken: string,
  requestId: string,
  rootPath: string
): string[] {
  let envelopeLoose: ListNodesEnvelopeLooseSpec
  try {
    envelopeLoose = new ListNodesEnvelopeLooseSpec(payload as DataRecord)
  } catch (error) {
    throw new FragmintNodeListError(
      'list_nodes: malformed response envelope',
      buildDiagnostics(
        {
          request_id: requestId,
          root_path: rootPath,
          parse_error: error instanceof Error ? error.message : String(error),
          raw_response: rawResponse
        },
        authEmail,
        authToken
      )
    )
  }

  const resultStatus = envelopeLoose.result?.status
  if (envelopeLoose.status === 'error' || resultStatus === 'error') {
    throw new FragmintNodeListError(
      'list_nodes: server returned error envelope',
      buildDiagnostics(
        {
          request_id: requestId,
          root_path: rootPath,
          http_code: envelopeLoose.http_code ?? null,
          status: resultStatus ?? envelopeLoose.status ?? null,
          error: envelopeLoose.result?.error ?? envelopeLoose.error ?? null,
          reason: envelopeLoose.result?.reason ?? envelopeLoose.reason ?? null,
          raw_response: rawResponse
        },
        authEmail,
        authToken
      )
    )
  }

  let successEnvelope: ListNodesEnvelopeSuccessSpec
  try {
    successEnvelope = new ListNodesEnvelopeSuccessSpec(payload as DataRecord)
  } catch (error) {
    throw new FragmintNodeListError(
      'list_nodes: malformed success response',
      buildDiagnostics(
        {
          request_id: requestId,
          root_path: rootPath,
          parse_error: error instanceof Error ? error.message : String(error),
          raw_response: rawResponse
        },
        authEmail,
        authToken
      )
    )
  }

  const nodeIds = successEnvelope.result.node_ids
  return [...nodeIds].sort((a, b) => a.localeCompare(b))
}

export async function listFragmintNodesForGraph(input: ListFragmintNodesForGraphInput): Promise<string[]> {
  const requestId = nextListNodesRequestId()
  const rootPath = typeof input.rootPath === 'string' ? input.rootPath.trim() : ''
  const executionGraphPath =
    typeof input.executionGraphPath === 'string' ? input.executionGraphPath.trim() : ''
  if (!rootPath) {
    throw new FragmintNodeListError('list_nodes: missing root_path', {
      request_id: requestId,
      root_path: input.rootPath
    })
  }
  if (!executionGraphPath) {
    throw new FragmintNodeListError('list_nodes: missing execution_graph_path', {
      request_id: requestId,
      execution_graph_path: input.executionGraphPath
    })
  }

  const cfg = await resolveFragmintBridgeConfig()
  const payload = {
    command_id: 'graph_op',
    data: {
      auth_email: cfg.authEmail,
      auth_token: cfg.authToken,
      execution_graph_path: executionGraphPath,
      root_path: rootPath,
      op: 'list_nodes'
    }
  }

  const res = await fetch(cfg.serverUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload)
  })

  const rawText = await res.text()
  const rawResponse = sanitizeText(rawText, cfg.authEmail, cfg.authToken)

  if (!res.ok) {
    throw new FragmintNodeListError(
      'list_nodes: HTTP request failed',
      buildDiagnostics(
        {
          request_id: requestId,
          root_path: rootPath,
          http_status: res.status,
          http_status_text: res.statusText,
          raw_response: rawResponse
        },
        cfg.authEmail,
        cfg.authToken
      )
    )
  }

  let parsed: unknown
  try {
    parsed = JSON.parse(rawText)
  } catch (error) {
    throw new FragmintNodeListError(
      'list_nodes: malformed JSON response',
      buildDiagnostics(
        {
          request_id: requestId,
          root_path: rootPath,
          parse_error: error instanceof Error ? error.message : String(error),
          raw_response: rawResponse
        },
        cfg.authEmail,
        cfg.authToken
      )
    )
  }

  return parseNodeIds(parsed, rawResponse, cfg.authEmail, cfg.authToken, requestId, rootPath)
}
