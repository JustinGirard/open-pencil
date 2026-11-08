import { useEventListener } from '@vueuse/core'
import type { ComputedRef } from 'vue'
import { useRoute } from 'vue-router'

import type { EditorStore } from '@/app/editor/active-store'

import { isButtonActivation } from './focus'

export function bindSpaceHandTool(inputFocused: ComputedRef<boolean>, store: EditorStore) {
  let toolBeforeSpace: typeof store.state.activeTool | null = null
  const route = useRoute()

  function restoreTool() {
    if (toolBeforeSpace === null) return
    store.setTool(toolBeforeSpace)
    toolBeforeSpace = null
  }

  useEventListener(window, 'keydown', (event: KeyboardEvent) => {
    if (event.code !== 'Space' || isButtonActivation(event)) return
    if (route.query.center_plugin === 'fragmint') return
    if (inputFocused.value || store.state.editingTextId) return
    if (event.metaKey || event.ctrlKey || event.altKey) return
    // console.info('[SPACE_TOOL_CANCEL]', {
    //   'event.code': event.code,
    //   'event.defaultPrevented': event.defaultPrevented,
    //   'inputFocused.value': inputFocused.value,
    //   'store.state.editingTextId': store.state.editingTextId,
    //   'document.activeElement': document.activeElement
    // })
    event.preventDefault()
    if (toolBeforeSpace !== null || store.state.activeTool === 'HAND') return
    toolBeforeSpace = store.state.activeTool
    store.setTool('HAND')
  })

  useEventListener(window, 'keyup', (event: KeyboardEvent) => {
    if (event.code === 'Space') restoreTool()
  })

  useEventListener(window, 'blur', restoreTool)

  return {
    resetToolBeforeSpace() {
      toolBeforeSpace = null
    }
  }
}
