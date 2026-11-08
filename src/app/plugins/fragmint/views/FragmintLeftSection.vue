<script setup lang="ts">
import {
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuPortal,
  ContextMenuRoot,
  ContextMenuTrigger
} from 'reka-ui'
import { tv } from 'tailwind-variants'
import { computed, onMounted, onUnmounted, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'

import { ApplicationState } from '@/app/plugins/application-state/ApplicationState'
import { DispatchUnityCommand } from '@/app/plugins/application-state/DispatchUnityCommand'
import { BaseData } from '@/app/plugins/base/BaseData'
import { resolveFragmintBridgeConfig } from '@/app/plugins/fragmint/unity/bridgeConfig'
import {
  FragmintGraphListError,
  listFragmintGraphs,
  type FragmintGraphNode
} from '@/app/plugins/fragmint/graphs/listGraphs'
import { FragmintNodeListError, listFragmintNodesForGraph } from '@/app/plugins/fragmint/graphs/listNodes'
import { FragmintViewport } from '@/app/plugins/fragmint/FragmintViewport'
import { toast } from '@/app/shell/ui'
import IconButton from '@/components/ui/button/IconButton.vue'
import { useMenuUI } from '@/components/ui/menu/menu'
import MenuScrollArea from '@/components/ui/menu/MenuScrollArea.vue'
import pageListTheme from '@/theme/page-list'

interface GraphTreeNode {
  key: string
  label: string
  graphId: string | null
  childrenByLabel: Map<string, GraphTreeNode>
}

interface GraphRow {
  key: string
  label: string
  depth: number
  graphId: string | null
  hasChildren: boolean
  expanded: boolean
}

class GraphSelectionSpec extends BaseData.define({
  graph_id: 'string',
  graph_name: 'string',
  graph_storage_root: 'string',
  selected_server: 'string'
}) {
  override do_every_validation(key: string, value: unknown): [unknown, string] {
    if (typeof value === 'string' && value.trim().length === 0)
      return [value, `graph_selection_missing_${key}`]
    return [value, '']
  }
}

const route = useRoute()
const router = useRouter()
const isActive = computed(() => route.query.center_plugin === 'fragmint')
const pageListStyles = tv(pageListTheme)
const listStyles = pageListStyles()

const graphState = ApplicationState.Instance('graph_file_state')
const styleState = ApplicationState.Instance('style_settings')
const rowMenu = useMenuUI({ content: 'w-44', item: 'justify-start gap-2' })
const rowMenuDangerItem = useMenuUI({ item: 'justify-start gap-2 text-error' }).item

const FRAGMINT_GRAPH_CREATE_URL = 'fragmint/graph_create'
const FRAGMINT_GRAPH_COPY_URL = 'fragmint/graph_copy'
const FRAGMINT_GRAPH_RENAME_URL = 'fragmint/graph_rename'
const FRAGMINT_GRAPH_DELETE_NUKE_URL = 'fragmint/graph_delete_nuke'

function digestGraphId(value: string): string {
  const raw = (value ?? '').trim()
  if (!raw) return 'empty'
  return `${raw.slice(0, 8)}…(len=${raw.length})`
}

function dispatchGraphCommand(url: string, payload: Record<string, unknown>, successMessage: string): void {
  let immediateFailureHandled = false
  try {
    DispatchUnityCommand({
      url,
      payload,
      meta: { sender: 'open-pencil', source: 'fragmint-left-graphs' },
      timeoutMs: 15000,
      onImmediateFailure: (error) => {
        immediateFailureHandled = true
        const message = error instanceof Error ? error.message : String(error)
        console.error(`[FragmintLeftSection] dispatch failed (${url})`, error)
        toast.error(`Fragmint command dispatch failed (${url}): ${message}`)
      },
      onSuccess: () => toast.info(successMessage),
      onFailure: (response) => toast.error(`Fragmint command failed (${url}): ${JSON.stringify(response)}`)
    })
  } catch (error) {
    if (immediateFailureHandled) return
    console.error(`[FragmintLeftSection] dispatch threw (${url})`, error)
    toast.error(`Fragmint command dispatch failed (${url}): ${error instanceof Error ? error.message : String(error)}`)
  }
}

const loading = ref(true)
const inFlight = ref(false)
const error = ref<string | null>(null)
const graphs = ref<FragmintGraphNode[]>([])
const selectedGraphId = ref('')
const expandedKeys = ref(new Set<string>())

let pollTimer: ReturnType<typeof setInterval> | null = null
let lastObservedDirtyAtMs = 0
let settledDirtyAtMs = -1
let queuedDirtyAtMs = -1
let didInitExpansion = false
let selectNodeListRequestSeq = 0

const tree = computed<GraphTreeNode[]>(() => buildTree(graphs.value))
const rows = computed<GraphRow[]>(() => flattenTree(tree.value, expandedKeys.value))

function toggleGraphs(): void {
  const query = { ...route.query }
  if (query.center_plugin === 'fragmint') delete query.center_plugin
  else query.center_plugin = 'fragmint'
  void router.replace({ path: route.path, query, hash: route.hash })
}

function ensureGraphsOpen(): void {
  if (route.query.center_plugin === 'fragmint') return
  const query = { ...route.query, center_plugin: 'fragmint' }
  void router.replace({ path: route.path, query, hash: route.hash })
}

function readSelectedGraphId(): string {
  return graphState['selected_graph_id'] as string
}

function writeSelectedGraphId(graphId: string): void {
  graphState['selected_graph_id'] = graphId
}

function writeSelectedGraphPath(graphPath: string): void {
  graphState['selected_graph_path'] = graphPath
}

function readGraphStorageRoot(): string {
  const raw = styleState['graph_storage_root']
  if (typeof raw !== 'string' || raw.trim().length === 0)
    throw new Error('graph_selection_missing_graph_storage_root')
  return raw
}

function buildSelectedGraphSavePath(selection: GraphSelectionSpec): string {
  const gid = selection.graph_id.trim()
  const gname = selection.graph_name.trim()
  const graphStorageRoot = selection.graph_storage_root.trim()
  const selectedServer = selection.selected_server.trim()
  return `${graphStorageRoot}/.server_server_local/${selectedServer}/${gid}/${gname}_save.json`
}

function findGraphById(graphId: string): FragmintGraphNode | null {
  const gid = (graphId ?? '').trim()
  if (!gid) return null
  for (let i = 0; i < graphs.value.length; i++) {
    const row = graphs.value[i]
    if ((row.graph_id ?? '').trim() !== gid) continue
    return row
  }
  return null
}

function nextSelectNodeListRequestId(): number {
  selectNodeListRequestSeq += 1
  return selectNodeListRequestSeq
}

function readDirtyAtMs(): number {
  return graphState['graph_list_dirty_at_ms'] as number
}

function writeDirtyAtMs(value: number): void {
  graphState['graph_list_dirty_at_ms'] = value
}

function nextDirtyAtMs(current: number): number {
  const now = Date.now()
  return now > current ? now : current + 1
}

function createNode(pathKey: string, label: string): GraphTreeNode {
  return {
    key: pathKey,
    label,
    graphId: null,
    childrenByLabel: new Map<string, GraphTreeNode>()
  }
}

function buildTree(items: FragmintGraphNode[]): GraphTreeNode[] {
  const rootChildren = new Map<string, GraphTreeNode>()

  for (let i = 0; i < items.length; i++) {
    const graph = items[i]
    const segments = graph.graph_name
      .split('/')
      .map((segment) => segment.trim())
      .filter(Boolean)
    if (segments.length === 0) {
      continue
    }

    let path = ''
    let children = rootChildren
    for (let i = 0; i < segments.length; i++) {
      const label = segments[i]
      path = path ? `${path}/${label}` : label

      let node = children.get(label)
      if (!node) {
        node = createNode(path, label)
        children.set(label, node)
      }
      if (i === segments.length - 1) node.graphId = graph.graph_id
      children = node.childrenByLabel
    }
  }

  const sortNodeMap = (map: Map<string, GraphTreeNode>): GraphTreeNode[] =>
    Array.from(map.values()).sort((a, b) => a.label.localeCompare(b.label))

  const normalizeOrder = (nodes: GraphTreeNode[]): GraphTreeNode[] => {
    for (const node of nodes) {
      const sortedChildren = normalizeOrder(sortNodeMap(node.childrenByLabel))
      node.childrenByLabel = new Map(sortedChildren.map((child) => [child.label, child]))
    }
    return nodes
  }

  return normalizeOrder(sortNodeMap(rootChildren))
}

function flattenTree(nodes: GraphTreeNode[], expanded: Set<string>): GraphRow[] {
  const out: GraphRow[] = []
  const visit = (items: GraphTreeNode[], depth: number): void => {
    for (const node of items) {
      const children = Array.from(node.childrenByLabel.values())
      const hasChildren = children.length > 0
      const isExpanded = hasChildren && expanded.has(node.key)
      out.push({
        key: node.key,
        label: node.label,
        depth,
        graphId: node.graphId,
        hasChildren,
        expanded: isExpanded
      })
      if (isExpanded) visit(children, depth + 1)
    }
  }
  visit(nodes, 0)

  return out
}

function collectExpandableKeys(nodes: GraphTreeNode[]): Set<string> {
  const keys = new Set<string>()
  const visit = (items: GraphTreeNode[]): void => {
    for (const node of items) {
      if (node.childrenByLabel.size > 0) keys.add(node.key)
      if (node.childrenByLabel.size > 0) visit(Array.from(node.childrenByLabel.values()))
    }
  }
  visit(nodes)
  return keys
}

function updateExpandedKeys(nodes: GraphTreeNode[]): void {
  const validKeys = collectExpandableKeys(nodes)
  if (!didInitExpansion) {
    expandedKeys.value = validKeys
    didInitExpansion = true
    return
  }

  const next = new Set<string>()
  for (const key of expandedKeys.value) {
    if (validKeys.has(key)) next.add(key)
  }
  expandedKeys.value = next
}

function toggleExpanded(key: string): void {
  const next = new Set(expandedKeys.value)
  if (next.has(key)) next.delete(key)
  else next.add(key)
  expandedKeys.value = next
}

function graphRowClass(row: GraphRow): string {
  const active = !!row.graphId && row.graphId === selectedGraphId.value
  const base = pageListStyles({ active }).item()
  if (!row.graphId) return `${base} cursor-default text-muted hover:bg-transparent hover:text-muted`
  return base
}

function formatGraphListError(err: unknown): string {
  if (err instanceof FragmintGraphListError) {
    return `${err.message}\n\n${JSON.stringify(err.diagnostics, null, 2)}`
  }
  if (err instanceof Error) return err.stack || err.message
  return String(err)
}

async function requestGraphRefresh(targetDirtyAtMs: number, force = false): Promise<void> {
  if (!force && targetDirtyAtMs <= settledDirtyAtMs) return

  if (inFlight.value) {
    if (targetDirtyAtMs > queuedDirtyAtMs) queuedDirtyAtMs = targetDirtyAtMs
    return
  }

  inFlight.value = true
  if (loading.value && graphs.value.length === 0) error.value = null

  try {
    const nextGraphs = await listFragmintGraphs()
    graphs.value = nextGraphs
    updateExpandedKeys(buildTree(nextGraphs))
    error.value = null
  } catch (err) {
    error.value = formatGraphListError(err)
  } finally {
    inFlight.value = false
    loading.value = false
    if (targetDirtyAtMs > settledDirtyAtMs) settledDirtyAtMs = targetDirtyAtMs

    if (queuedDirtyAtMs > settledDirtyAtMs) {
      const queued = queuedDirtyAtMs
      queuedDirtyAtMs = -1
      void requestGraphRefresh(queued)
    }
  }
}

function publishDirtyMarker(): void {
  writeDirtyAtMs(nextDirtyAtMs(readDirtyAtMs()))
}

function onManualRefresh(): void {
  publishDirtyMarker()
}

function onCreateGraph(): void {
  dispatchGraphCommand(FRAGMINT_GRAPH_CREATE_URL, {}, 'Graph create workflow launched.')
}

function onCopyGraph(graphId: string): void {
  dispatchGraphCommand(FRAGMINT_GRAPH_COPY_URL, { graph_id: graphId }, `Copy workflow launched for ${digestGraphId(graphId)}.`)
}

function onRenameGraph(graphId: string): void {
  dispatchGraphCommand(FRAGMINT_GRAPH_RENAME_URL, { graph_id: graphId }, `Rename workflow launched for ${digestGraphId(graphId)}.`)
}

function onDeleteGraphNuke(graphId: string): void {
  dispatchGraphCommand(FRAGMINT_GRAPH_DELETE_NUKE_URL, { graph_id: graphId }, `Delete workflow launched for ${digestGraphId(graphId)}.`)
}

async function onSelectGraph(graphId: string): Promise<void> {
  if (!graphId) return
  ensureGraphsOpen()

  const current = readSelectedGraphId()
  const matchesCurrentSelection = current === graphId
  if (matchesCurrentSelection) return

  const selectedGraph = findGraphById(graphId)
  const selectedGraphName = selectedGraph ? (selectedGraph.graph_name ?? '').trim() : ''
  const cfg = await resolveFragmintBridgeConfig()
  const selection = new GraphSelectionSpec({
    graph_id: graphId,
    graph_name: selectedGraphName,
    graph_storage_root: readGraphStorageRoot(),
    selected_server: cfg.remoteName
  })

  FragmintViewport.current = null

  writeSelectedGraphId(graphId)
  const selectedGraphPath = buildSelectedGraphSavePath(selection)
  writeSelectedGraphPath(selectedGraphPath)
  selectedGraphId.value = graphId

  const nodeListRequestId = nextSelectNodeListRequestId()
  const rootPath = selectedGraph?.root_path
  if (typeof rootPath !== 'string' || rootPath.trim().length === 0) {
    console.error('[Fragmint list_nodes] failed', {
      graphId,
      rootPath,
      error: new Error('graph_selection_missing_root_path')
    })
    return
  }

  const normalizedRootPath = rootPath.trim()
  const executionGraphPath = `executions/${selection.graph_name}.json`
  try {
    const nodeIds = await listFragmintNodesForGraph({ rootPath: normalizedRootPath, executionGraphPath })
    if (nodeListRequestId !== selectNodeListRequestSeq || readSelectedGraphId() !== graphId) return

    console.info('[Fragmint list_nodes] success', {
      graphId,
      rootPath: normalizedRootPath,
      nodeIds
    })
  } catch (error) {
    if (nodeListRequestId !== selectNodeListRequestSeq || readSelectedGraphId() !== graphId) return

    const message = error instanceof Error ? error.message : String(error)
    const diagnostics = error instanceof FragmintNodeListError ? error.diagnostics : null
    const httpStatus =
      diagnostics && typeof diagnostics.http_status === 'number'
        ? diagnostics.http_status
        : null

    console.error('[Fragmint list_nodes] failure', {
      graphId,
      rootPath: normalizedRootPath,
      executionGraphPath,
      httpStatus,
      status: httpStatus,
      message,
      diagnostics,
      error
    })
  }
}

function pollSharedGraphState(): void {
  const sharedSelected = readSelectedGraphId()
  if (sharedSelected !== selectedGraphId.value) selectedGraphId.value = sharedSelected

  const sharedDirtyAtMs = readDirtyAtMs()
  if (sharedDirtyAtMs !== lastObservedDirtyAtMs) {
    lastObservedDirtyAtMs = sharedDirtyAtMs
    void requestGraphRefresh(sharedDirtyAtMs)
  }
}

onMounted(() => {
  selectedGraphId.value = readSelectedGraphId()
  lastObservedDirtyAtMs = readDirtyAtMs()
  void requestGraphRefresh(lastObservedDirtyAtMs, true)
  pollTimer = setInterval(pollSharedGraphState, 1000)
})

onUnmounted(() => {
  if (pollTimer) clearInterval(pollTimer)
  pollTimer = null
})
</script>

<template>
  <section class="shrink-0 border-b border-border">
    <div class="flex items-center gap-2 px-3 py-1.5">
      <button
        data-test-id="graphs-header"
        class="min-w-0 flex-1 text-left text-[11px] font-semibold text-surface hover:text-foreground"
        @click="toggleGraphs"
      >
        Graphs
      </button>
      <IconButton
        label="Create new graph"
        size="xs"
        data-test-id="graphs-create"
        @click.stop="onCreateGraph"
      >
        <icon-lucide-plus class="size-3.5" />
      </IconButton>
      <IconButton
        label="Refresh graph list"
        size="xs"
        data-test-id="graphs-refresh"
        @click.stop="onManualRefresh"
      >
        <icon-lucide-refresh-cw class="size-3.5" />
      </IconButton>
    </div>

    <div class="min-h-0">
      <div
        v-if="error"
        data-test-id="graphs-error"
        class="mb-2 rounded border border-red-500/40 bg-red-500/10 p-2 text-[11px] text-red-200 whitespace-pre-wrap select-text"
      >
        {{ error }}
      </div>

      <div
        v-if="loading && graphs.length === 0"
        data-test-id="graphs-loading"
        class="px-3 py-1 text-[11px] text-surface/70"
      >
        Loading graphs...
      </div>

      <div
        v-else-if="!error && graphs.length === 0"
        data-test-id="graphs-empty"
        class="px-3 py-1 text-[11px] text-surface/70"
      >
        No graphs found.
      </div>

      <div v-else-if="graphs.length > 0" data-test-id="graphs-tree">
        <div :class="listStyles.viewport()">
          <div v-for="row in rows" :key="row.key" class="flex items-center">
            <button
              type="button"
              class="mr-1 inline-flex size-4 shrink-0 items-center justify-center rounded text-muted hover:bg-hover hover:text-surface disabled:opacity-40"
              :style="{ marginLeft: `${row.depth * 14}px` }"
              :disabled="!row.hasChildren"
              @click.stop="row.hasChildren ? toggleExpanded(row.key) : undefined"
            >
              <icon-lucide-chevron-down v-if="row.hasChildren && row.expanded" class="size-3" />
              <icon-lucide-chevron-right v-else-if="row.hasChildren" class="size-3" />
            </button>
            <ContextMenuRoot v-if="row.graphId">
              <ContextMenuTrigger as-child>
                <button
                  :class="graphRowClass(row)"
                  @click="onSelectGraph(row.graphId)"
                >
                  <icon-lucide-folder v-if="row.hasChildren" class="size-3 shrink-0 opacity-70" />
                  <icon-lucide-file v-else class="size-3 shrink-0 opacity-70" />
                  <span :class="listStyles.label()">{{ row.label }}</span>
                </button>
              </ContextMenuTrigger>
              <ContextMenuPortal>
                <ContextMenuContent :class="rowMenu.content" data-test-id="graphs-row-menu">
                  <MenuScrollArea>
                    <ContextMenuItem
                      :class="rowMenu.item"
                      data-test-id="graphs-row-copy"
                      @select="onCopyGraph(row.graphId)"
                    >
                      <icon-lucide-copy :class="rowMenu.icon" />
                      Copy
                    </ContextMenuItem>
                    <ContextMenuItem
                      :class="rowMenu.item"
                      data-test-id="graphs-row-rename"
                      @select="onRenameGraph(row.graphId)"
                    >
                      <icon-lucide-pencil :class="rowMenu.icon" />
                      Rename
                    </ContextMenuItem>
                    <ContextMenuItem
                      :class="rowMenuDangerItem"
                      data-test-id="graphs-row-delete"
                      @select="onDeleteGraphNuke(row.graphId)"
                    >
                      <icon-lucide-trash-2 :class="rowMenu.icon" />
                      Delete
                    </ContextMenuItem>
                  </MenuScrollArea>
                </ContextMenuContent>
              </ContextMenuPortal>
            </ContextMenuRoot>
            <button
              v-else
              :class="graphRowClass(row)"
              :disabled="true"
            >
              <icon-lucide-folder v-if="row.hasChildren" class="size-3 shrink-0 opacity-70" />
              <icon-lucide-file v-else class="size-3 shrink-0 opacity-70" />
              <span :class="listStyles.label()">{{ row.label }}</span>
            </button>
          </div>
        </div>
      </div>

      <div v-if="!isActive" class="mt-2 text-[10px] text-surface/65">
        Click Graphs to open Fragmint in center view.
      </div>
    </div>
  </section>
</template>
