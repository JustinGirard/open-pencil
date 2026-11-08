import { shallowRef } from 'vue'

type FragmintSaveAsRequest = {
  suggestedName: string
}

export const fragmintSaveAsRequest = shallowRef<FragmintSaveAsRequest | null>(null)
let resolveRequest: ((value: string | null) => void) | null = null
let pending = Promise.resolve()

function resolveAndClear(value: string | null): void {
  const resolve = resolveRequest
  resolveRequest = null
  fragmintSaveAsRequest.value = null
  resolve?.(value)
}

export function cancelFragmintSaveAsName(): void {
  resolveAndClear(null)
}

export function submitFragmintSaveAsName(name: string): void {
  resolveAndClear(name)
}

export function requestFragmintSaveAsName(suggestedName: string): Promise<string | null> {
  const result = pending.then(
    () =>
      new Promise<string | null>((resolve) => {
        resolveRequest = resolve
        fragmintSaveAsRequest.value = { suggestedName }
      })
  )
  pending = result.then(() => undefined, () => undefined)
  return result
}
