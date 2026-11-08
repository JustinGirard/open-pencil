import { ApplicationMessaging } from '@/app/plugins/application-state/ApplicationMessaging'
import type { BridgeMessage } from '@/app/plugins/application-state/BridgeMessage'
import { toast } from '@/app/shell/ui'

type CompletionCallback = (response: unknown) => void

export interface DispatchUnityCommandArgs {
  url: string
  payload: unknown
  meta: unknown
  timeoutMs: number
  onImmediateFailure?: (error: unknown) => void
  onSuccess?: CompletionCallback
  onFailure?: CompletionCallback
}

export function DispatchUnityCommand({
  url,
  payload,
  meta,
  timeoutMs,
  onImmediateFailure,
  onSuccess,
  onFailure
}: DispatchUnityCommandArgs): BridgeMessage {
  const id = `unity-command:${crypto.randomUUID()}`
  try {
    return ApplicationMessaging.Instance().SendMessage(
      url,
      payload,
      meta,
      id,
      timeoutMs,
      (response) => {
        if (onSuccess) return onSuccess(response)
        toast.info(`Unity command succeeded: ${url}`)
      },
      (response) => {
        if (onFailure) return onFailure(response)
        toast.error(`Unity command failed (${url}): ${JSON.stringify(response)}`)
      }
    )
  } catch (error) {
    if (onImmediateFailure) onImmediateFailure(error)
    else {
      toast.error(
        `Unity command dispatch failed (${url}): ${
          error instanceof Error ? error.message : String(error)
        }`
      )
    }
    throw error
  }
}
