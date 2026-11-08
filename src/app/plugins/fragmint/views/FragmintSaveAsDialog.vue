<script setup lang="ts">
import { useStore } from '@nanostores/vue'
import { onUnmounted, ref, useTemplateRef, watch } from 'vue'

import { commonMessages } from '@open-pencil/vue'

import {
  cancelFragmintSaveAsName,
  fragmintSaveAsRequest,
  submitFragmintSaveAsName
} from '@/app/plugins/fragmint/storage/saveAsDialog'
import AppButton from '@/components/ui/button/AppButton.vue'
import { AppDialogBody, AppDialogFooter, AppDialogHeader, AppDialogRoot } from '@/components/ui/dialog'
import AppInput from '@/components/ui/input/AppInput.vue'

const common = useStore(commonMessages)
const value = ref('')
const fileInput = useTemplateRef<{ focus: (options?: FocusOptions) => void }>('fileInput')

watch(fragmintSaveAsRequest, (request) => {
  if (!request) return
  value.value = request.suggestedName
  requestAnimationFrame(() => fileInput.value?.focus({ preventScroll: true }))
})

onUnmounted(() => {
  if (fragmintSaveAsRequest.value !== null) cancelFragmintSaveAsName()
})

function updateOpen(open: boolean): void {
  if (!open) cancelFragmintSaveAsName()
}

function submit(): void {
  submitFragmintSaveAsName(value.value)
}
</script>

<template>
  <AppDialogRoot :open="fragmintSaveAsRequest !== null" size="sm" @update:open="updateOpen">
    <AppDialogHeader
      heading="Save As in Fragmint"
      description="Enter a full filename. Relative paths like inner/design.fig are supported."
      :close-label="common.close"
    />
    <AppDialogBody>
      <label class="flex flex-col gap-2 text-xs text-muted">
        Full filename
        <AppInput
          ref="fileInput"
          v-model="value"
          size="md"
          aria-label="Fragmint full filename"
          @enter="submit"
        />
      </label>
    </AppDialogBody>
    <AppDialogFooter>
      <AppButton size="md" variant="outline" @click="cancelFragmintSaveAsName()">
        {{ common.cancel }}
      </AppButton>
      <AppButton
        size="md"
        color="primary"
        variant="solid"
        :disabled="value.trim().length === 0"
        @click="submit"
      >
        {{ common.saveAs }}
      </AppButton>
    </AppDialogFooter>
  </AppDialogRoot>
</template>
