<script setup lang="ts">
import { SplitterGroup, SplitterPanel, SplitterResizeHandle } from 'reka-ui'
import { tv } from 'tailwind-variants'
import { computed, ref, watch, type ComputedRef } from 'vue'

import { useI18n, vTestId } from '@open-pencil/vue'

import AppMenu from '@/components/shell/AppMenu.vue'
import SegmentedControl from '@/components/ui/select/SegmentedControl.vue'
import splitterTheme from '@/theme/splitter'
import PluginLeftSections from '@/app/plugins/mounts/PluginLeftSections.vue'

import AssetsPanel from './assets-panel/AssetsPanel.vue'
import LayerTree from './LayerTree/LayerTree.vue'
import PagesPanel from './PagesPanel.vue'

const { menu, panels } = useI18n()
const { hidePagesAndLayers } = withDefaults(defineProps<{
  hidePagesAndLayers?: boolean
}>(), {
  hidePagesAndLayers: false
})
const activePanel = ref<'file' | 'assets'>('file')
const panelModel = computed({
  get: () => activePanel.value,
  set: (value: string) => {
    if (value === 'file' || value === 'assets') activePanel.value = value
  }
})
const panelOptions = computed(() => [
  { value: 'file', label: menu.value.file },
  { value: 'assets', label: panels.value.assets }
])
const panelTabsUI = { root: 'w-full' }
const splitterStyles = tv(splitterTheme)({ direction: 'vertical' })

type LayersPanelController = {
  collapse: () => void
  expand: () => void
  isCollapsed: ComputedRef<boolean>
}

const layersPanelRef = ref<LayersPanelController | null>(null)
const autoCollapsedForFragmint = ref(false)

function syncLayersPanelForFragmint(nextHidden: boolean, prevHidden: boolean | undefined): void {
  const panel = layersPanelRef.value
  if (!panel) return
  if (nextHidden === prevHidden) return

  if (nextHidden) {
    if (panel.isCollapsed.value) return
    panel.collapse()
    autoCollapsedForFragmint.value = true
    return
  }

  if (!autoCollapsedForFragmint.value) return
  panel.expand()
  autoCollapsedForFragmint.value = false
}

watch(
  () => hidePagesAndLayers,
  (next, prev) => {
    syncLayersPanelForFragmint(next, prev)
  },
  { flush: 'post' }
)

watch(
  layersPanelRef,
  (panel) => {
    if (!panel) return
    if (hidePagesAndLayers) {
      syncLayersPanelForFragmint(true, false)
      return
    }
    if (!autoCollapsedForFragmint.value) return
    panel.expand()
    autoCollapsedForFragmint.value = false
  },
  { flush: 'post' }
)
</script>

<template>
  <aside
    data-test-id="layers-panel"
    class="flex min-w-0 flex-1 flex-col overflow-hidden border-r border-border bg-panel"
    style="contain: paint layout style"
  >
    <AppMenu />
    <div class="shrink-0 border-b border-border px-2 py-1.5">
      <SegmentedControl
        v-model="panelModel"
        :options="panelOptions"
        :label="panels.layers"
        :ui="panelTabsUI"
      >
        <template #option="{ option }">
          <span
            v-test-id="option.value === 'file' ? 'left-panel-layers-tab' : 'left-panel-assets-tab'"
            class="truncate"
          >
            {{ option.label }}
          </span>
        </template>
      </SegmentedControl>
    </div>
    <AssetsPanel v-if="activePanel === 'assets'" />
    <PluginLeftSections v-if="activePanel === 'file'" />
    <SplitterGroup
      v-if="activePanel === 'file'"
      direction="vertical"
      auto-save-id="layers-layout"
      class="flex-1 overflow-hidden"
    >
      <SplitterPanel
        :default-size="30"
        :min-size="10"
        :max-size="60"
        class="flex flex-col overflow-hidden"
      >
        <PagesPanel />
      </SplitterPanel>
      <SplitterResizeHandle v-show="!hidePagesAndLayers" :class="splitterStyles.handle()">
        <div :class="splitterStyles.divider()" />
      </SplitterResizeHandle>
      <SplitterPanel
        ref="layersPanelRef"
        collapsible
        :collapsed-size="0"
        :default-size="70"
        :min-size="20"
        class="flex flex-col overflow-hidden"
      >
        <header
          data-test-id="layers-header"
          class="shrink-0 px-3 py-2 text-[11px] font-semibold text-surface"
        >
          {{ panels.layers }}
        </header>
        <LayerTree data-test-id="layers-tree" />
      </SplitterPanel>
    </SplitterGroup>
  </aside>
</template>
