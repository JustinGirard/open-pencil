import { resolveFragmintBridgeConfig } from '@/app/plugins/fragmint/unity/bridgeConfig'

export interface FragmintGraphNode {
  graph_id: string
  graph_name: string
  root_path: string | null
}

export class FragmintGraphListError extends Error {
  readonly diagnostics: Record<string, unknown>

  constructor(message: string, diagnostics: Record<string, unknown>) {
    super(message)
    this.name = 'FragmintGraphListError'
    this.diagnostics = diagnostics
  }
}

let listGraphsRequestSeq = 0

function nextListGraphsRequestId(): string {
  listGraphsRequestSeq += 1
  return `list-graphs-${listGraphsRequestSeq}`
}

function valueType(value: unknown): string {
  if (value === null) return 'null'
  if (Array.isArray(value)) return 'array'
  return typeof value
}

function asObject(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null
  return value as Record<string, unknown>
}

function sanitizeText(raw: string, authEmail: string, authToken: string): string {
  let next = raw
  if (authEmail) next = next.split(authEmail).join('[REDACTED_EMAIL]')
  if (authToken) next = next.split(authToken).join('[REDACTED_TOKEN]')
  return next
}

function sanitizeDiagnosticValue(value: unknown, authEmail: string, authToken: string): unknown {
  if (typeof value === 'string') return sanitizeText(value, authEmail, authToken)
  if (Array.isArray(value)) {
    return value.map((item) => sanitizeDiagnosticValue(item, authEmail, authToken))
  }
  const obj = asObject(value)
  if (!obj) return value

  const out: Record<string, unknown> = {}
  for (const [key, item] of Object.entries(obj)) {
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

function parseGraphNodes(
  payload: unknown,
  rawResponse: string,
  authEmail: string,
  authToken: string,
  requestId: string
): FragmintGraphNode[] {
  const root = asObject(payload)
  if (!root) {
    throw new FragmintGraphListError(
      'list_graphs: response is not an object',
      buildDiagnostics(
        { request_id: requestId },
        {
          raw_response: rawResponse
        },
        authEmail,
        authToken
      )
    )
  }

  const bodyFromResult = asObject(root.result)
  const body = bodyFromResult ?? root
  if (root.status === 'error' || body.status === 'error') {
    throw new FragmintGraphListError(
      'list_graphs: server returned error envelope',
      buildDiagnostics(
        {
          http_code: root.http_code ?? null,
          status: body.status ?? root.status ?? null,
          error: body.error ?? root.error ?? null,
          reason: body.reason ?? root.reason ?? null,
          raw_response: rawResponse
        },
        authEmail,
        authToken
      )
    )
  }

  const graphNodes = body.graph_nodes
  if (!Array.isArray(graphNodes)) {
    throw new FragmintGraphListError(
      'list_graphs: missing graph_nodes array',
      buildDiagnostics(
        {
          request_id: requestId,
          graph_nodes_type: valueType(graphNodes)
        },
        {
          http_code: root.http_code ?? null,
          status: body.status ?? root.status ?? null,
          response_keys: Object.keys(body),
          raw_response: rawResponse
        },
        authEmail,
        authToken
      )
    )
  }

  const malformedRows: Record<string, unknown>[] = []
  const rows: FragmintGraphNode[] = []
  for (let i = 0; i < graphNodes.length; i++) {
    const rawItem = graphNodes[i]
    const item = asObject(graphNodes[i])
    if (!item) {
      const issue = {
        request_id: requestId,
        stage: 'row_validation',
        error: 'graph_row_not_object',
        row_index: i,
        row_type: valueType(rawItem)
      }
      malformedRows.push(issue)
      continue
    }

    const graphId = typeof item.graph_id === 'string' ? item.graph_id.trim() : ''
    const graphName = typeof item.graph_name === 'string' ? item.graph_name.trim() : ''
    if (!graphId || !graphName) {
      const issue = {
        request_id: requestId,
        stage: 'row_validation',
        error: 'graph_row_missing_graph_id_or_graph_name',
        row_index: i,
        keys: Object.keys(item),
        graph_id_type: valueType(item.graph_id),
        graph_name_type: valueType(item.graph_name),
        graph_id_present: typeof item.graph_id === 'string' && item.graph_id.trim().length > 0,
        graph_name_present: typeof item.graph_name === 'string' && item.graph_name.trim().length > 0,
        graph_id_length: typeof item.graph_id === 'string' ? item.graph_id.length : 0,
        graph_name_length: typeof item.graph_name === 'string' ? item.graph_name.length : 0
      }
      malformedRows.push(issue)
      continue
    }

    const rootPath = typeof item.root_path === 'string' ? item.root_path.trim() : null
    rows.push({
      graph_id: graphId,
      graph_name: graphName,
      root_path: rootPath
    })
  }

  if (rows.length === 0 && graphNodes.length > 0) {
    throw new FragmintGraphListError(
      'list_graphs: all graph rows are malformed',
      buildDiagnostics(
        {
          request_id: requestId,
          malformed_row_count: malformedRows.length,
          malformed_rows: malformedRows,
          input_row_count: graphNodes.length,
          output_row_count: rows.length
        },
        authEmail,
        authToken
      )
    )
  }

  return rows
}

export async function listFragmintGraphs(): Promise<FragmintGraphNode[]> {
  const requestId = nextListGraphsRequestId()

  const cfg = await resolveFragmintBridgeConfig()

  const payload = {
    command_id: 'list_graphs',
    data: {
      auth_email: cfg.authEmail,
      auth_token: cfg.authToken
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
    throw new FragmintGraphListError(
      'list_graphs: HTTP request failed',
      buildDiagnostics(
        {
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
    throw new FragmintGraphListError(
      'list_graphs: malformed JSON response',
      buildDiagnostics(
        {
          parse_error: error instanceof Error ? error.message : String(error),
          raw_response: rawResponse
        },
        cfg.authEmail,
        cfg.authToken
      )
    )
  }

  return parseGraphNodes(parsed, rawResponse, cfg.authEmail, cfg.authToken, requestId)
}
