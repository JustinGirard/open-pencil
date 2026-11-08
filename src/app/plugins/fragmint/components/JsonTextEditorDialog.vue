<script setup lang="ts">
import { ref, watch } from 'vue'

import { createTextClipboard } from '@/app/editor/clipboard/text'
import { toast } from '@/app/shell/ui'
import AppButton from '@/components/ui/button/AppButton.vue'
import { AppDialogFooter, AppDialogHeader, AppDialogRoot } from '@/components/ui/dialog'
import AppTextarea from '@/components/ui/input/AppTextarea.vue'

const copyText = createTextClipboard()
const props = defineProps<{
  open: boolean
  title: string
  initialValue: string
  onSave: (value: unknown) => string | null
  onCancel?: () => void
  onReset?: () => string | null
}>()

const emit = defineEmits<{
  (event: 'update:open', value: boolean): void
}>()

const jsonText = ref('')
const errorText = ref('')

watch(
  () => props.open,
  (open) => {
    if (!open) return
    jsonText.value = props.initialValue
    errorText.value = ''
  },
  { immediate: true }
)

watch(
  () => props.initialValue,
  next => {
    if (!props.open) return
    jsonText.value = next
    errorText.value = ''
  }
)

function close(): void {
  emit('update:open', false)
}

function handleCancel(): void {
  errorText.value = ''
  props.onCancel?.()
  close()
}

function handleSave(): void {
  let parsed: unknown
  try {
    parsed = JSON.parse(jsonText.value)
  } catch (error) {
    errorText.value = error instanceof Error ? error.message : 'Invalid JSON'
    return
  }

  const saveError = props.onSave(parsed)
  if (saveError) {
    errorText.value = saveError
    return
  }

  errorText.value = ''
  close()
}

function handleReset(): void {
  if (!props.onReset) return
  const resetError = props.onReset()
  if (resetError) {
    errorText.value = resetError
    return
  }
  errorText.value = ''
  jsonText.value = props.initialValue
}

function onOpenUpdate(nextOpen: boolean): void {
  if (!nextOpen) handleCancel()
  else emit('update:open', nextOpen)
}

async function handleCopy(): Promise<void> {
  try {
    await copyText(jsonText.value, 'JSON')
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error)
    toast.error(`Copy failed: ${reason}`)
  }
}
</script>

<template>
  <AppDialogRoot :open="open" size="lg" height="tall" @update:open="onOpenUpdate">
    <AppDialogHeader :heading="title" description="Edit JSON and save validated values." />
    <div class="flex min-h-0 flex-1 flex-col gap-3 px-4 py-4">
      <AppTextarea v-model="jsonText" :rows="18" />
      <p v-if="errorText" role="alert" class="text-xs text-error">{{ errorText }}</p>
    </div>
    <AppDialogFooter>
      <AppButton size="md" variant="outline" @click="handleCancel">
        Cancel
      </AppButton>
      <AppButton size="md" variant="outline" @click="handleCopy">
        Copy
      </AppButton>
      <AppButton v-if="onReset" size="md" variant="outline" @click="handleReset">
        Reset to Defaults
      </AppButton>
      <AppButton size="md" @click="handleSave">
        Save
      </AppButton>
    </AppDialogFooter>
  </AppDialogRoot>
</template>
