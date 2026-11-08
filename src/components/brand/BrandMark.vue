<script setup lang="ts">
import { computed, withDefaults } from 'vue'

import { brandMark } from '@/theme/brand'

import type { BrandMarkProps } from './types'

const {
  decorative,
  class: className
} = withDefaults(defineProps<BrandMarkProps>(), {
  variant: 'micro',
  appearance: 'light',
  decorative: false
})

const source = computed(() => {
  return '/brand/fragmint-fragment-logo-small.png'
})
</script>

<template>
  <img
    :src="source"
    :class="brandMark({ class: className })"
    :alt="decorative ? '' : 'Fragmint'"
    width="16"
    height="16"
  />
</template>
