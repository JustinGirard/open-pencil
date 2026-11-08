<script setup lang="ts">
import { watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'

import { useActiveEditorStoreRef } from '@/app/editor/active-store'
import { fragmintCenterDeactivateToken } from '@/app/plugins/fragmint/state/centerMode'
import FragmintUnityHost from '@/app/plugins/fragmint/views/FragmintUnityHost.vue'

const route = useRoute()
const router = useRouter()
const storeRef = useActiveEditorStoreRef()

function clearFragmintCenterMode() {
  if (route.query.center_plugin !== 'fragmint') return
  const query = { ...route.query }
  delete query.center_plugin
  void router.replace({ path: route.path, query, hash: route.hash })
}

watch(fragmintCenterDeactivateToken, () => {
  clearFragmintCenterMode()
})

watch(
  () => storeRef.value?.state.currentPageId,
  (next, prev) => {
    if (!next || !prev || next === prev) return
    clearFragmintCenterMode()
  }
)
</script>

<template>
  <div class="absolute inset-0">
    <FragmintUnityHost :enable-canvas-kit-overlay="true" />
  </div>
</template>
