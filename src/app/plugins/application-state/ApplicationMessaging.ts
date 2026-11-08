import { ApplicationState } from './ApplicationState'
import { ApplicationMessagingState } from './ApplicationMessagingState'
import { BridgeMessage } from './BridgeMessage'

const ENTRY_KEY = 'application_messaging_state'

type CompletionCallback = (response: unknown) => void
type MessageHandler = (message: BridgeMessage, onSuccess: CompletionCallback, onFailure: CompletionCallback) => void

type CallbackRecord = {
  createdAtMs: number
  onSuccess?: CompletionCallback
  onFailure?: CompletionCallback
}

export class ApplicationMessaging {
  private static singleton: ApplicationMessaging | null = null

  private readonly handlers = new Map<string, MessageHandler>()
  private readonly callbacksById = new Map<string, CallbackRecord[]>()
  private lastFinalizedPruneAtMs = 0

  static Instance(): ApplicationMessaging {
    if (ApplicationMessaging.singleton === null) ApplicationMessaging.singleton = new ApplicationMessaging()
    return ApplicationMessaging.singleton
  }

  SendMessage(
    url: string,
    payload: unknown,
    meta: unknown,
    id: string,
    timeoutMs: number,
    onSuccess?: CompletionCallback,
    onFailure?: CompletionCallback
  ): BridgeMessage {
    const state = this.readState()
    const message = new BridgeMessage({
      id,
      url: this.normalizeUrl(url),
      payload,
      meta,
      created_at_ms: this.nowMs(),
      timeout_ms: timeoutMs,
    })

    if (this.hasActiveId(state, id)) {
      onFailure?.({ error: 'duplicate_active_id', id })
      return message
    }

    state.incoming = [...state.incoming, message]
    this.writeState(state)
    this.storeCallback(id, message.created_at_ms, onSuccess, onFailure)
    return message
  }

  RegisterHandler(url: string, handler: MessageHandler): void {
    this.handlers.set(this.normalizeUrl(url), handler)
  }

  GetMessage(id: string): BridgeMessage | null {
    const state = this.readState()
    for (let i = state.pending.length - 1; i >= 0; i -= 1) if (state.pending[i].id === id) return state.pending[i]
    for (let i = state.incoming.length - 1; i >= 0; i -= 1) if (state.incoming[i].id === id) return state.incoming[i]
    for (let i = state.finalized.length - 1; i >= 0; i -= 1) if (state.finalized[i].id === id) return state.finalized[i]
    return null
  }

  Pump(): void {
    let state = this.readState()
    let changed = false
    const nowMs = this.nowMs()

    for (const message of [...state.incoming]) {
      if (!this.isExpired(message, nowMs)) continue
      this.finalizeFromState(state, 'incoming', message.id, message.created_at_ms, 'failed', { error: 'timeout' }, nowMs, null)
      changed = true
    }
    for (const message of [...state.pending]) {
      if (!this.isExpired(message, nowMs)) continue
      this.finalizeFromState(state, 'pending', message.id, message.created_at_ms, 'failed', { error: 'timeout' }, nowMs, null)
      changed = true
    }
    if (changed) {
      this.writeState(state)
      state = this.readState()
    }

    for (const message of [...state.incoming]) {
      const handler = this.handlers.get(this.normalizeUrl(message.url))
      if (!handler) continue

      const messageId = message.id
      const messageCreatedAtMs = message.created_at_ms
      state.incoming = state.incoming.filter((item) => !(item.id === messageId && item.created_at_ms === messageCreatedAtMs))
      state.pending = [...state.pending, message]
      this.writeState(state)

      const onSuccess = (response: unknown) => this.completeMessage(messageId, messageCreatedAtMs, 'succeeded', response, message)
      const onFailure = (response: unknown) => this.completeMessage(messageId, messageCreatedAtMs, 'failed', response, message)

      try {
        handler(message, onSuccess, onFailure)
      } catch (error) {
        onFailure({ error: 'handler_exception', message: String((error as Error)?.message ?? error) })
      }

      state = this.readState()
    }

    const pruneNowMs = this.nowMs()
    if (pruneNowMs - this.lastFinalizedPruneAtMs >= 10000) {
      this.lastFinalizedPruneAtMs = pruneNowMs
      const pruneState = this.readState()
      const keptFinalized = pruneState.finalized.filter((message) =>
        pruneNowMs <= message.created_at_ms + message.timeout_ms + 1000
      )
      if (keptFinalized.length !== pruneState.finalized.length) {
        pruneState.finalized = keptFinalized
        this.writeState(pruneState)
      }
    }
    this.deliverFinalizedCallbacks(this.readState().finalized)
  }

  Dump(category: string): BridgeMessage[] {
    const state = this.readState()
    const normalized = this.normalizeCategory(category)
    const queue = state[normalized as keyof ApplicationMessagingState]
    if (!Array.isArray(queue)) throw new Error(`unknown_category:${category}`)
    console.log(queue)
    return queue as BridgeMessage[]
  }

  Purge(category: string): void {
    const normalized = this.normalizeCategory(category)
    if (normalized !== 'finalized') throw new Error(`unsupported_purge_category:${category}`)

    const state = this.readState()
    const finalizedSnapshot = [...state.finalized]
    state.finalized = []
    this.writeState(state)

    let firstError: unknown = null
    for (const message of finalizedSnapshot) {
      const callback = this.takeCallback(message.id, message.created_at_ms)
      if (!callback) continue
      try {
        if (message.outcome === 'succeeded') callback.onSuccess?.(message.response)
        else callback.onFailure?.(message.response)
      } catch (error) {
        if (firstError === null) firstError = error
      }
    }
    if (firstError !== null) throw firstError
  }

  private readState(): ApplicationMessagingState {
    const entry = ApplicationState.Instance(ENTRY_KEY) as Record<string, unknown>
    return new ApplicationMessagingState({
      incoming: entry.incoming,
      pending: entry.pending,
      finalized: entry.finalized,
    }) as ApplicationMessagingState
  }

  private writeState(state: ApplicationMessagingState): void {
    const entry = ApplicationState.Instance(ENTRY_KEY) as Record<string, unknown>
    entry.incoming = state.incoming
    entry.pending = state.pending
    entry.finalized = state.finalized
  }

  private storeCallback(id: string, createdAtMs: number, onSuccess?: CompletionCallback, onFailure?: CompletionCallback): void {
    if (!onSuccess && !onFailure) return
    const list = this.callbacksById.get(id) ?? []
    list.push({ createdAtMs, onSuccess, onFailure })
    this.callbacksById.set(id, list)
  }

  private takeCallback(id: string, createdAtMs: number): CallbackRecord | null {
    const list = this.callbacksById.get(id)
    if (!list) return null
    const index = list.findIndex((item) => item.createdAtMs === createdAtMs)
    if (index < 0) return null
    const [callback] = list.splice(index, 1)
    if (list.length === 0) this.callbacksById.delete(id)
    else this.callbacksById.set(id, list)
    return callback ?? null
  }

  private deliverFinalizedCallbacks(finalizedQueue: BridgeMessage[]): void {
    for (const message of finalizedQueue) {
      const callback = this.takeCallback(message.id, message.created_at_ms)
      if (!callback) continue
      if (message.outcome === 'succeeded') callback.onSuccess?.(message.response)
      else callback.onFailure?.(message.response)
    }
  }

  private hasActiveId(state: ApplicationMessagingState, id: string): boolean {
    return state.incoming.some((message) => message.id === id) ||
      state.pending.some((message) => message.id === id)
  }

  private isExpired(message: BridgeMessage, nowMs: number): boolean {
    return nowMs - message.created_at_ms >= message.timeout_ms
  }

  private completeMessage(
    id: string,
    createdAtMs: number,
    outcome: string,
    response: unknown,
    completionMessage: BridgeMessage | null
  ): void {
    const state = this.readState()
    const pendingMessage = state.pending.find((item) => item.id === id && item.created_at_ms === createdAtMs)
    if (!pendingMessage) return
    this.finalizeFromState(state, 'pending', id, createdAtMs, outcome, response, this.nowMs(), completionMessage)
    this.writeState(state)
  }

  private finalizeFromState(
    state: ApplicationMessagingState,
    category: 'incoming' | 'pending',
    id: string,
    createdAtMs: number,
    outcome: string,
    response: unknown,
    completedAtMs: number,
    completionMessage: BridgeMessage | null
  ): void {
    const queue = state[category]
    const message = queue.find((item) => item.id === id && item.created_at_ms === createdAtMs)
    if (!message) return

    state[category] = queue.filter((item) => !(item.id === id && item.created_at_ms === createdAtMs)) as BridgeMessage[]
    const finalizedMeta = completionMessage ? completionMessage.meta : message.meta
    state.finalized = [...state.finalized, new BridgeMessage({
      id: message.id,
      url: message.url,
      payload: message.payload,
      meta: finalizedMeta,
      created_at_ms: message.created_at_ms,
      timeout_ms: message.timeout_ms,
      response,
      outcome,
      completed_at_ms: completedAtMs,
    })]
  }

  private normalizeUrl(url: string): string { return String(url).trim().toLowerCase() }
  private normalizeCategory(category: string): string { return String(category).trim().toLowerCase() }
  private nowMs(): number { return Date.now() }
}
