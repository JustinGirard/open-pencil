<script setup lang="ts">
import { pluginLeftSections } from '@/app/plugins/pluginRegistry'
</script>

<template>
  <div v-if="pluginLeftSections.length" class="shrink-0">
    <component :is="section.component" v-for="section in pluginLeftSections" :key="section.id" />
  </div>
</template>
