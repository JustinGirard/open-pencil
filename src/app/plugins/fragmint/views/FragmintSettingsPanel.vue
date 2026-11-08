<script setup lang="ts">
import { computed, ref, watch } from 'vue'

import { colorToHex, parseColor } from '@open-pencil/scene-graph/color'
import type { Color } from '@open-pencil/scene-graph/primitives'

import { DispatchUnityCommand } from '@/app/plugins/application-state/DispatchUnityCommand'
import { ApplicationState } from '@/app/plugins/application-state/ApplicationState'
import { SID_STYLE_GROUPS, type SidStyleGroupName, StyleGroup, StyleSettings, createDefaultSidStyleMapping, normalizeSidStyleMappingValue } from '@/app/plugins/application-state/StyleSettings'
import { toast } from '@/app/shell/ui'
import { JsonTextEditorDialog } from '@/app/plugins/fragmint/components'
import SettingsDisclosure from '@/components/settings/layout/SettingsDisclosure.vue'
import { FragmintViewportSettings } from '@/app/plugins/application-state/FragmintViewportSettings'
import AppButton from '@/components/ui/button/AppButton.vue'
import ColorInput from '@/components/ColorPicker/ColorInput.vue'
import SettingsGroup from '@/components/settings/layout/SettingsGroup.vue'
import SettingsRow from '@/components/settings/layout/SettingsRow.vue'
import SettingsSection from '@/components/settings/layout/SettingsSection.vue'
import AppInput from '@/components/ui/input/AppInput.vue'
import AppSwitch from '@/components/ui/toggle/AppSwitch.vue'

const appState = ApplicationState.Instance('style_settings')
const initialHex = appState['background_color'] as string
const backgroundColor = ref(parseColor(initialHex))
const styleMappingDialogOpen = ref(false)
const styleMappingInitialValue = ref('')
const styleSettingsDialogOpen = ref(false)
const styleSettingsInitialValue = ref('')
const debugModeState = ApplicationState.Instance('debug_mode')
const initialDebugModeActive = debugModeState['active']
if (typeof initialDebugModeActive !== 'boolean') throw new Error('debug_mode.active must be boolean')
const debugModeActive = ref<boolean>(initialDebugModeActive)
const debugModeModel = computed({
  get: () => {
    const active = debugModeActive.value
    if (typeof active !== 'boolean') throw new Error('debug_mode.active must be boolean')
    console.log('[DEBUG_MODE_TOGGLE]', {
      stage: 'render_value',
      renderedValue: active
    })
    return active
  },
  set: (next: boolean) => {
    const beforeWrite = debugModeState['active']
    console.log('[DEBUG_MODE_TOGGLE]', {
      stage: 'before_write',
      incomingToggleValue: next,
      debugModeActiveBeforeWrite: beforeWrite
    })
    debugModeState['active'] = next
    const afterWrite = debugModeState['active']
    console.log('[DEBUG_MODE_TOGGLE]', {
      stage: 'after_write',
      incomingToggleValue: next,
      debugModeActiveAfterWrite: afterWrite
    })
    if (typeof afterWrite !== 'boolean') throw new Error('debug_mode.active must be boolean')
    debugModeActive.value = afterWrite
  }
})

const viewportSettingsState = ApplicationState.Instance(
  'fragmint_viewport_settings',
  new FragmintViewportSettings({})
)
const viewportSyncOpen = ref(false)

const viewportMessageIntervalInput = ref(
  String(viewportSettingsState['message_interval_ms'])
)
const viewportSmoothTimeInput = ref(
  String(viewportSettingsState['smooth_time_seconds'])
)

function commitViewportMessageInterval(): void {
  const value = Number(viewportMessageIntervalInput.value)
  if (Number.isInteger(value) && value > 0)
    viewportSettingsState['message_interval_ms'] = value
  viewportMessageIntervalInput.value = String(viewportSettingsState['message_interval_ms'])
}

function commitViewportSmoothTime(): void {
  const value = Number(viewportSmoothTimeInput.value)
  if (Number.isFinite(value) && value > 0)
    viewportSettingsState['smooth_time_seconds'] = value
  viewportSmoothTimeInput.value = String(viewportSettingsState['smooth_time_seconds'])
}

type StyleGroupName = SidStyleGroupName
type StyleColorField =
  | 'font_color'
  | 'background_color'
  | 'textbox_background_color'
  | 'textbox_textcolor'
  | 'button_color'
  | 'border_color'
type StyleNumberField =
  | 'font_scale'
  | 'icon_scale'
  | 'button_scale'
  | 'corner_round'
  | 'padding_scale'
  | 'margin_scale'
  | 'border_width'
type StyleFieldName = StyleColorField | StyleNumberField
type StyleGroupRecord = Record<StyleFieldName, string | number>

function mapGroups<T>(build: (name: StyleGroupName) => T): Record<StyleGroupName, T> {
  return SID_STYLE_GROUPS.reduce(
    (acc, groupName) => {
      acc[groupName] = build(groupName)
      return acc
    },
    {} as Record<StyleGroupName, T>
  )
}

function styleGroupLabel(groupName: StyleGroupName): string {
  return `${groupName.slice(0, 1).toUpperCase()}${groupName.slice(1)}`
}

const colorFields: Array<{ key: StyleColorField; label: string }> = [
  { key: 'font_color', label: 'Font Color' },
  { key: 'background_color', label: 'Background Color' },
  { key: 'textbox_background_color', label: 'Textbox Background Color' },
  { key: 'textbox_textcolor', label: 'Textbox Text Color' },
  { key: 'button_color', label: 'Button Color' },
  { key: 'border_color', label: 'Border Color' }
]

const numberFields: Array<{ key: StyleNumberField; label: string; step: number; min: number }> = [
  { key: 'font_scale', label: 'Font Scale', step: 0.1, min: 0.01 },
  { key: 'icon_scale', label: 'Icon Scale', step: 0.1, min: 0.01 },
  { key: 'button_scale', label: 'Button Scale', step: 0.1, min: 0.01 },
  { key: 'corner_round', label: 'Corner Round', step: 1, min: 0 },
  { key: 'padding_scale', label: 'Padding Scale', step: 0.1, min: 0.01 },
  { key: 'margin_scale', label: 'Margin Scale', step: 0.1, min: 0.01 },
  { key: 'border_width', label: 'Border Width', step: 1, min: 0 }
]

const disclosureOpen = ref<Record<StyleGroupName, boolean>>(mapGroups(() => false))

ensureStyleGroupsInitialized()
const groupState = ref<Record<StyleGroupName, StyleGroupRecord>>(
  mapGroups(name => readGroupValidated(name))
)
const numberInputState = ref<Record<StyleGroupName, Record<StyleNumberField, string | number>>>(
  mapGroups(name => numberInputStateFromGroup(groupState.value[name]))
)
const integerNumberFields = new Set<StyleNumberField>([
  'corner_round',
  'border_width'
])

ensureSidStyleMappingInitialized()

function numberInputStateFromGroup(
  group: StyleGroupRecord
): Record<StyleNumberField, string | number> {
  return {
    font_scale: group.font_scale,
    icon_scale: group.icon_scale,
    button_scale: group.button_scale,
    corner_round: group.corner_round,
    padding_scale: group.padding_scale,
    margin_scale: group.margin_scale,
    border_width: group.border_width
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
}

function ensureStyleGroupsInitialized(): void {
  for (const name of SID_STYLE_GROUPS) {
    if (appState[name] === undefined) {
      appState[name] = new StyleGroup({})
    }
  }
}

function ensureSidStyleMappingInitialized(): void {
  const current = appState['sid_style_mapping']
  if (current === undefined) {
    appState['sid_style_mapping'] = createDefaultSidStyleMapping()
    return
  }
  try {
    const normalized = normalizeSidStyleMappingValue(current)
    appState['sid_style_mapping'] = normalized
  } catch (error) {
    console.error('[FragmintSettings] invalid sid_style_mapping detected; resetting to defaults.', error)
    appState['sid_style_mapping'] = createDefaultSidStyleMapping()
  }
}

function prettyJson(value: unknown): string {
  return JSON.stringify(value, null, 2)
}

function groupToRecord(group: StyleGroup): StyleGroupRecord {
  return {
    font_color: String(group[StyleGroup.keys.font_color]),
    font_scale: Number(group[StyleGroup.keys.font_scale]),
    background_color: String(group[StyleGroup.keys.background_color]),
    textbox_background_color: String(group[StyleGroup.keys.textbox_background_color]),
    textbox_textcolor: String(group[StyleGroup.keys.textbox_textcolor]),
    icon_scale: Number(group[StyleGroup.keys.icon_scale]),
    button_color: String(group[StyleGroup.keys.button_color]),
    button_scale: Number(group[StyleGroup.keys.button_scale]),
    corner_round: Number(group[StyleGroup.keys.corner_round]),
    padding_scale: Number(group[StyleGroup.keys.padding_scale]),
    margin_scale: Number(group[StyleGroup.keys.margin_scale]),
    border_width: Number(group[StyleGroup.keys.border_width]),
    border_color: String(group[StyleGroup.keys.border_color])
  }
}

function readGroupValidated(name: StyleGroupName): StyleGroupRecord {
  const raw = appState[name]
  if (raw instanceof StyleGroup) return groupToRecord(raw)
  if (isRecord(raw)) return groupToRecord(new StyleGroup(raw))
  throw new Error(`invalid_style_group:${name}`)
}

function refreshGroupState(name: StyleGroupName): void {
  groupState.value = {
    ...groupState.value,
    [name]: readGroupValidated(name)
  }

  numberInputState.value = {
    ...numberInputState.value,
    [name]: numberInputStateFromGroup(groupState.value[name])
  }
}

function setGroupField(name: StyleGroupName, key: StyleFieldName, value: string | number): void {
  const current = readGroupValidated(name)
  const next: StyleGroupRecord = { ...current, [key]: value }
  appState[name] = next
  refreshGroupState(name)
}

function setNumberInputValue(name: StyleGroupName, key: StyleNumberField, value: string | number): void {
  numberInputState.value = {
    ...numberInputState.value,
    [name]: {
      ...numberInputState.value[name],
      [key]: value
    }
  }
}

function resetNumberInputValue(name: StyleGroupName, key: StyleNumberField): void {
  setNumberInputValue(name, key, groupState.value[name][key])
}

function commitNumberInputValue(name: StyleGroupName, key: StyleNumberField): void {
  const parsed = Number(numberInputState.value[name][key])
  if (!Number.isFinite(parsed)) return resetNumberInputValue(name, key)
  if (integerNumberFields.has(key) && !Number.isInteger(parsed)) {
    return resetNumberInputValue(name, key)
  }

  try {
    const validated = new StyleGroup({
      ...groupState.value[name],
      [key]: parsed
    })
    setGroupField(name, key, Number(validated[key]))
  } catch {
    resetNumberInputValue(name, key)
  }
}

for (const groupName of SID_STYLE_GROUPS) {
  watch(() => appState[groupName], () => refreshGroupState(groupName))
}

function colorFor(name: StyleGroupName, key: StyleColorField): Color {
  return parseColor(String(groupState.value[name][key]))
}

function onGroupColorUpdate(name: StyleGroupName, key: StyleColorField, nextColor: Color): void {
  setGroupField(name, key, colorToHex(nextColor))
}

function onSaveInFragmint(): void {
  DispatchUnityCommand({
    url: 'fragmint/save',
    payload: {},
    meta: { sender: 'open-pencil' },
    timeoutMs: 15000,
    onSuccess: () => toast.info('Fragmint save completed.'),
    onFailure: response => toast.error(`Fragmint save failed: ${JSON.stringify(response)}`)
  })
}

function onOpenStyleMapping(): void {
  styleMappingInitialValue.value = prettyJson(appState['sid_style_mapping'])
  styleMappingDialogOpen.value = true
}

function serializeStyleSettingsForEditor(): Record<string, unknown> {
  const snapshot: Record<string, unknown> = {
    background_color: String(appState['background_color']),
    sid_style_mapping: normalizeSidStyleMappingValue(appState['sid_style_mapping'])
  }

  for (const groupName of SID_STYLE_GROUPS)
    snapshot[groupName] = readGroupValidated(groupName)

  return snapshot
}

function onOpenStyleSettings(): void {
  styleSettingsInitialValue.value = prettyJson(serializeStyleSettingsForEditor())
  styleSettingsDialogOpen.value = true
}

function onSaveStyleSettings(nextValue: unknown): string | null {
  try {
    if (!isRecord(nextValue)) throw new Error('invalid_style_settings')
    const validated = new StyleSettings(nextValue)

    appState['background_color'] = String(validated['background_color'])
    for (const groupName of SID_STYLE_GROUPS)
      appState[groupName] = validated[groupName] as Record<string, unknown>
    appState['sid_style_mapping'] = validated['sid_style_mapping'] as Record<string, unknown>

    styleSettingsInitialValue.value = prettyJson(serializeStyleSettingsForEditor())
    toast.info('Style settings saved.')
    return null
  } catch (error) {
    console.error('[FragmintSettings] style_settings save validation failed.', error)
    return error instanceof Error ? error.message : 'invalid_style_settings'
  }
}

function onSaveStyleMapping(nextValue: unknown, mode: 'save' | 'reset' = 'save'): string | null {
  try {
    const normalized = normalizeSidStyleMappingValue(nextValue)
    appState['sid_style_mapping'] = normalized
    styleMappingInitialValue.value = prettyJson(normalized)
    if (mode === 'reset') toast.info('Style mapping reset to defaults.')
    else toast.info('Style mapping saved.')
    return null
  } catch (error) {
    if (mode === 'reset') {
      console.error('[FragmintSettings] sid_style_mapping reset failed.', error)
      toast.error('Style mapping reset failed.')
    } else {
      console.error('[FragmintSettings] sid_style_mapping save validation failed.', error)
    }
    return error instanceof Error ? error.message : 'invalid_sid_style_mapping'
  }
}

function onCancelStyleMapping(): void {
  styleMappingDialogOpen.value = false
}

function onCancelStyleSettings(): void { styleSettingsDialogOpen.value = false }

function onResetStyleMapping(): string | null {
  try {
    for (const groupName of SID_STYLE_GROUPS)
      appState[groupName] = new StyleGroup({})
  } catch (error) {
    console.error('[FragmintSettings] sid_style_mapping reset failed.', error)
    toast.error('Style mapping reset failed.')
    return error instanceof Error ? error.message : 'invalid_sid_style_mapping'
  }
  const defaults = createDefaultSidStyleMapping()
  return onSaveStyleMapping(defaults, 'reset')
}

function onSendMessageToFragmint(): void {
  DispatchUnityCommand({
    url: 'fragmint/test_message',
    payload: {
      title: 'OpenPencil Test Message',
      description: 'Hello from Fragmint Settings.'
    },
    meta: { sender: 'open-pencil' },
    timeoutMs: 15000,
    onSuccess: () => toast.info('Unity test message delivered.'),
    onFailure: response =>
      toast.error(`Unity test message failed: ${JSON.stringify(response)}`)
  })
}

function onBackgroundColorUpdate(nextColor: Color): void {
  const nextHex = colorToHex(nextColor)
  appState['background_color'] = nextHex
  backgroundColor.value = parseColor(nextHex)
}
</script>

<template>
  <section class="flex flex-col gap-6" data-test-id="settings-fragmint-panel">
    <SettingsSection>
      <template #title>Appearance</template>
      <SettingsGroup>
        <label class="flex items-center justify-between gap-4 px-3 py-2.5">
          <span class="text-xs text-surface">Background Color</span>
          <ColorInput
            :color="backgroundColor"
            :editable="true"
            @update="onBackgroundColorUpdate"
          />
        </label>
        <SettingsDisclosure
          v-for="groupName in SID_STYLE_GROUPS"
          :key="groupName"
          :open="disclosureOpen[groupName]"
          class="border-b border-border"
          @update:open="disclosureOpen[groupName] = $event"
        >
          <template #label>{{ styleGroupLabel(groupName) }}</template>
          <div class="flex flex-col gap-1">
            <SettingsRow
              v-for="colorField in colorFields"
              :key="`${groupName}:${colorField.key}`"
              :label="colorField.label"
              class="max-sm:flex-col max-sm:items-stretch"
            >
              <ColorInput
                :color="colorFor(groupName, colorField.key)"
                :editable="true"
                @update="onGroupColorUpdate(groupName, colorField.key, $event)"
              />
            </SettingsRow>
            <SettingsRow
              v-for="numberField in numberFields"
              :key="`${groupName}:${numberField.key}`"
              :label="numberField.label"
              class="max-sm:flex-col max-sm:items-stretch"
            >
              <AppInput
                :model-value="numberInputState[groupName][numberField.key]"
                type="number"
                :step="numberField.step"
                :min="numberField.min"
                class="w-full sm:w-40"
                @update:model-value="setNumberInputValue(groupName, numberField.key, $event)"
                @change="commitNumberInputValue(groupName, numberField.key)"
                @blur="commitNumberInputValue(groupName, numberField.key)"
                @keydown.enter="commitNumberInputValue(groupName, numberField.key)"
              />
            </SettingsRow>
          </div>
        </SettingsDisclosure>
      </SettingsGroup>
    </SettingsSection>
    <SettingsSection>
      <template #title>Messaging</template>
      <SettingsGroup>
        <div class="px-3 py-2.5">
          <AppButton size="xs" variant="outline" data-test-id="fragmint-settings-save" @click="onSaveInFragmint">
            Save In Fragmint
          </AppButton>
        </div>
        <div class="px-3 py-2.5">
          <AppButton size="xs" variant="outline" data-test-id="fragmint-settings-send-test-message" @click="onSendMessageToFragmint">
            Send Test Message
          </AppButton>
        </div>
      </SettingsGroup>
    </SettingsSection>
    <SettingsSection>
      <template #title>Viewport synchronization</template>
      <SettingsGroup>
        <SettingsDisclosure
          :open="viewportSyncOpen"
          class="border-b border-border"
          @update:open="viewportSyncOpen = $event"
        >
          <template #label>Viewport synchronization</template>
          <div class="flex flex-col gap-1">
            <SettingsRow label="Message interval (ms)">
              <AppInput
                :model-value="viewportMessageIntervalInput"
                type="number"
                step="1"
                min="1"
                @update:model-value="viewportMessageIntervalInput = String($event)"
                @change="commitViewportMessageInterval"
                @blur="commitViewportMessageInterval"
              />
            </SettingsRow>
            <SettingsRow label="Smooth time (seconds)">
              <AppInput
                :model-value="viewportSmoothTimeInput"
                type="number"
                step="0.01"
                min="0.000001"
                @update:model-value="viewportSmoothTimeInput = String($event)"
                @change="commitViewportSmoothTime"
                @blur="commitViewportSmoothTime"
              />
            </SettingsRow>
          </div>
        </SettingsDisclosure>
      </SettingsGroup>
    </SettingsSection>
    <SettingsSection>
      <template #title>Debug</template>
      <SettingsGroup>
        <SettingsRow
          label="Debug Mode"
          description="Uses shared ApplicationState debug_mode.active."
          class="max-sm:flex-col max-sm:items-stretch"
        >
          <AppSwitch v-model="debugModeModel" label="Enable debug mode" />
        </SettingsRow>
      </SettingsGroup>
    </SettingsSection>
    <SettingsSection>
      <template #title>Style Settings</template>
      <template #actions>
        <AppButton size="xs" variant="outline" data-test-id="fragmint-settings-open-style-settings" @click="onOpenStyleSettings">
          Show JSON
        </AppButton>
      </template>
      <SettingsGroup>
        <div class="px-3 py-2.5">
          <span class="text-[11px] text-muted">Open and edit SID mapping only.</span>
        </div>
        <div class="px-3 py-2.5">
          <AppButton size="xs" variant="outline" data-test-id="fragmint-settings-open-style-mapping" @click="onOpenStyleMapping">
            Open Style Mapping
          </AppButton>
        </div>
      </SettingsGroup>
    </SettingsSection>
  </section>

  <JsonTextEditorDialog
    v-model:open="styleMappingDialogOpen"
    title="Style Mapping JSON"
    :initial-value="styleMappingInitialValue"
    :on-save="onSaveStyleMapping"
    :on-cancel="onCancelStyleMapping"
    :on-reset="onResetStyleMapping"
  />
  <JsonTextEditorDialog
    v-model:open="styleSettingsDialogOpen"
    title="Style Settings JSON"
    :initial-value="styleSettingsInitialValue"
    :on-save="onSaveStyleSettings"
    :on-cancel="onCancelStyleSettings"
  />
</template>
