<script setup lang="ts">
import { computed } from 'vue'
import { useRoute } from 'vue-router'

import { resolveCenterView } from '@/app/plugins/base/runtime'
import { plugins } from '@/app/plugins/pluginRegistry'

const route = useRoute()
const activeCenterView = computed(() => resolveCenterView(plugins, { route }))
</script>

<template>
  <component :is="activeCenterView.component" v-if="activeCenterView" class="absolute inset-0 z-20" />
</template>
