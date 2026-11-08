import { BaseData } from '@/app/plugins/base/BaseData'

const HEX_COLOR_REGEX = /^#[0-9A-Fa-f]{6}$/
const SID_STYLE_MAPPING_VERSION = 1
export const SID_STYLE_GROUPS = [
  'primary',
  'secondary',
  'experimental',
  'diagnostic',
  'accent',
  'subtle',
  'disabled'
] as const
const SID_STYLE_PROPERTIES = [
  'font_color',
  'font_scale',
  'background_color',
  'button_color',
  'padding_scale',
  'margin_scale',
  'textbox_background_color',
  'textbox_textcolor',
  'border_width',
  'border_color',
  'corner_round'
] as const

export type SidStyleGroupName = (typeof SID_STYLE_GROUPS)[number]
type SidStylePropertyToken = (typeof SID_STYLE_PROPERTIES)[number]

const SID_STYLE_GROUP_SET = new Set<string>(SID_STYLE_GROUPS)
const SID_STYLE_PROPERTY_SET = new Set<string>(SID_STYLE_PROPERTIES)
const SID_STYLE_MAPPING_KEYS = new Set(['version', 'bindings'])
const SID_STYLE_BINDING_KEYS = new Set(['group', 'properties'])
const LEGACY_SYMBOL_KEYS = new Set([
  'sid_wrapped_label',
  'sid_wrapped_label_faded',
  'sid_title_label',
  'sid_small_label',
  'sid_form_textarea',
  'sid_wrapped_textarea',
  'sid_json_preview_textarea',
  'sid_cell_editing',
  'sid_select_button',
  'sid_select_sub_button',
  'sid_title_mini_button',
  'sid_field_vis_mini_button',
  'sid_toggle',
  'sid_file_link_button',
  'sid_node_window_panel',
  'sid_node_window_border',
  'sid_node_window_container',
  'sid_node_window_container_clear',
  'sid_panel_output',
  'sid_panel_title',
  'sid_image_container',
  'sid_title_background',
  'sid_title_label_center',
  'sid_tiny_label',
  'sid_small_button',
  'sid_menu_button',
  'sid_panel_light',
  'sid_dock_panel'
])

function asRecord(value: unknown, label: string): Record<string, unknown> {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error(`invalid_object:${label}`)
  }
  return value as Record<string, unknown>
}

function validateExactKeys(
  value: Record<string, unknown>,
  allowed: Set<string>,
  label: string
): void {
  for (const key of Object.keys(value)) {
    if (!allowed.has(key)) {
      throw new Error(`invalid_key:${label}.${key}`)
    }
  }
}

function createBinding(group: SidStyleGroupName, properties: SidStylePropertyToken[]): Record<string, unknown> {
  return { group, properties: [...properties] }
}

function createDefaultSidStyleBindings(): Record<string, unknown> {
  return {
    wrapped_label: createBinding('primary', ['font_color', 'font_scale']),
    wrapped_label_faded: createBinding('primary', ['font_scale']),
    title_label: createBinding('primary', ['font_color', 'font_scale']),
    small_label: createBinding('primary', ['font_color', 'font_scale']),
    form_textarea: createBinding('primary', ['font_scale', 'padding_scale', 'margin_scale', 'textbox_background_color', 'textbox_textcolor']),
    wrapped_textarea: createBinding('primary', ['font_scale', 'padding_scale', 'margin_scale', 'textbox_background_color', 'textbox_textcolor']),
    json_preview_textarea: createBinding('primary', ['font_scale', 'padding_scale', 'textbox_background_color', 'textbox_textcolor']),
    cell_editing: createBinding('primary', ['font_scale', 'padding_scale', 'margin_scale', 'textbox_background_color', 'textbox_textcolor']),
    cell: createBinding('primary', []),
    cell_data: createBinding('primary', []),
    cell_title: createBinding('secondary', []),
    select_button: createBinding('primary', ['font_color', 'font_scale', 'button_color', 'padding_scale', 'margin_scale', 'border_width', 'border_color', 'corner_round']),
    select_button_selected: createBinding('primary', ['font_color']),
    select_sub_button: createBinding('primary', ['font_color', 'font_scale', 'button_color', 'padding_scale', 'margin_scale', 'border_width', 'border_color', 'corner_round']),
    title_mini_button: createBinding('primary', ['font_color', 'font_scale', 'button_color', 'padding_scale', 'border_width', 'border_color', 'corner_round']),
    field_vis_mini_button: createBinding('primary', ['font_color', 'font_scale', 'button_color', 'padding_scale', 'border_width', 'border_color', 'corner_round']),
    toggle: createBinding('primary', ['font_color', 'font_scale', 'padding_scale']),
    file_link_button: createBinding('primary', ['font_color', 'font_scale', 'padding_scale']),
    node_window: createBinding('primary', ['background_color', 'padding_scale', 'margin_scale', 'border_width', 'border_color', 'corner_round']),
    node_window_border: createBinding('primary', ['background_color', 'border_width', 'border_color', 'corner_round']),
    node_window_border_hovered: createBinding('primary', ['background_color', 'border_width', 'border_color', 'corner_round']),
    node_window_border_docked: createBinding('primary', ['border_width', 'border_color', 'corner_round']),
    node_window_border_red: createBinding('secondary', ['border_width', 'border_color', 'corner_round']),
    node_window_border_blue: createBinding('secondary', ['border_width', 'border_color', 'corner_round']),
    node_window_border_green: createBinding('secondary', ['border_width', 'border_color', 'corner_round']),
    node_window_border_yellow: createBinding('secondary', ['border_width', 'border_color', 'corner_round']),
    node_window_transparent: createBinding('primary', ['background_color', 'padding_scale', 'margin_scale', 'border_width', 'border_color', 'corner_round']),
    node_window_container_clear: createBinding('primary', ['padding_scale', 'margin_scale']),
    editor_background: createBinding('primary', ['background_color']),
    panel_output: createBinding('primary', ['background_color', 'padding_scale', 'margin_scale', 'border_width', 'border_color', 'corner_round']),
    panel_title: createBinding('primary', ['background_color', 'padding_scale', 'border_width', 'border_color', 'corner_round']),
    image_container: createBinding('primary', ['padding_scale', 'margin_scale']),
    title_background: createBinding('primary', ['background_color', 'border_width', 'border_color', 'corner_round']),
    title_background_clear: createBinding('secondary', ['padding_scale', 'margin_scale', 'border_width']),
    title_label_center: createBinding('secondary', ['font_color', 'font_scale']),
    tiny_label: createBinding('secondary', ['font_color', 'font_scale']),
    small_button: createBinding('secondary', ['font_color', 'font_scale', 'button_color', 'padding_scale', 'border_width', 'border_color', 'corner_round']),
    menu_button: createBinding('secondary', ['font_color', 'font_scale', 'button_color', 'padding_scale', 'border_width', 'border_color', 'corner_round']),
    panel_light: createBinding('secondary', ['background_color', 'padding_scale', 'margin_scale', 'border_width', 'border_color', 'corner_round']),
    dock_panel: createBinding('secondary', ['background_color', 'padding_scale', 'margin_scale', 'border_width', 'border_color', 'corner_round']),

    base_hpanel_output: createBinding('primary', ['background_color', 'padding_scale', 'margin_scale', 'corner_round']),
    base_hpanel_title: createBinding('primary', ['background_color', 'padding_scale', 'margin_scale', 'corner_round']),
    base_hpanel_light: createBinding('secondary', ['background_color', 'padding_scale', 'margin_scale']),
    base_textarea: createBinding('primary', ['font_scale', 'padding_scale', 'margin_scale', 'textbox_background_color', 'textbox_textcolor']),
    base_textarea_new: createBinding('primary', ['font_scale', 'padding_scale', 'margin_scale', 'textbox_background_color', 'textbox_textcolor']),
    base_cell: createBinding('primary', ['background_color', 'padding_scale', 'margin_scale', 'border_width', 'border_color', 'corner_round']),
    base_title: createBinding('primary', ['font_color', 'font_scale', 'padding_scale', 'margin_scale']),
    base_label: createBinding('primary', ['font_color', 'font_scale', 'padding_scale', 'margin_scale']),
    base_label_faded: createBinding('secondary', ['font_color', 'font_scale', 'padding_scale', 'margin_scale']),
    base_button: createBinding('primary', ['font_color', 'font_scale', 'button_color', 'padding_scale', 'margin_scale', 'border_width']),
    base_toggle: createBinding('primary', ['font_color', 'font_scale', 'padding_scale', 'margin_scale']),
    base_window: createBinding('primary', ['background_color', 'font_color', 'font_scale', 'padding_scale', 'margin_scale', 'border_width']),
    base_background: createBinding('primary', ['background_color']),
    grid_texture: createBinding('secondary', ['background_color']),
    error_label: createBinding('secondary', ['font_color'])
  }
}

export function createDefaultSidStyleMapping(): Record<string, unknown> {
  return JSON.parse(JSON.stringify(new SidStyleMapping({}))) as Record<string, unknown>
}

function validateSidStyleBindings(bindings: Record<string, unknown>): void {
  for (const [sid, rawBinding] of Object.entries(bindings)) {
    if (LEGACY_SYMBOL_KEYS.has(sid)) {
      throw new Error(`invalid_sid_style_identifier:${sid}`)
    }

    const binding = asRecord(rawBinding, `sid_style_mapping.bindings.${sid}`)
    validateExactKeys(binding, SID_STYLE_BINDING_KEYS, `sid_style_mapping.bindings.${sid}`)

    const group = binding.group
    if (typeof group !== 'string' || !SID_STYLE_GROUP_SET.has(group)) {
      throw new Error(`invalid_sid_style_group:${sid}`)
    }

    const properties = binding.properties
    if (!Array.isArray(properties)) {
      throw new Error(`invalid_sid_style_properties:${sid}`)
    }

    for (const property of properties) {
      if (typeof property !== 'string' || !SID_STYLE_PROPERTY_SET.has(property)) {
        throw new Error(`invalid_sid_style_property:${sid}`)
      }
    }
  }
}

export class SidStyleMapping extends BaseData.define({
  version: ['integer', SID_STYLE_MAPPING_VERSION],
  bindings: ['object', createDefaultSidStyleBindings()]
}) {
  override do_pre_process(inData: Record<string, unknown>): Record<string, unknown> {
    validateExactKeys(inData, SID_STYLE_MAPPING_KEYS, 'sid_style_mapping')
    return inData
  }

  override do_validation(key: string, value: unknown): [unknown, string] {
    if (key === SidStyleMapping.keys.version && Number(value) !== SID_STYLE_MAPPING_VERSION) {
      throw new Error('invalid_sid_style_mapping_version')
    }

    if (key === SidStyleMapping.keys.bindings) {
      const bindings = asRecord(value, 'sid_style_mapping.bindings')
      validateSidStyleBindings(bindings)
    }

    return [value, '']
  }
}

export function normalizeSidStyleMappingValue(value: unknown): Record<string, unknown> {
  const validated = new SidStyleMapping(asRecord(value, 'sid_style_mapping'))
  return JSON.parse(JSON.stringify(validated)) as Record<string, unknown>
}

export class StyleGroup extends BaseData.define({
  font_color: ['string', '#000000'],
  font_scale: ['number', 1],
  background_color: ['string', '#FFFFFF'],
  textbox_background_color: ['string', '#FFFFFF'],
  textbox_textcolor: ['string', '#000000'],
  icon_scale: ['number', 1],
  button_color: ['string', '#FFFFFF'],
  button_scale: ['number', 1],
  corner_round: ['integer', 0],
  padding_scale: ['number', 1],
  margin_scale: ['number', 1],
  border_width: ['integer', 0],
  border_color: ['string', '#000000']
}) {
  override do_pre_process(inData: Record<string, unknown>): Record<string, unknown> {
    const scaleKeys = [
      StyleGroup.keys.font_scale,
      StyleGroup.keys.icon_scale,
      StyleGroup.keys.button_scale,
      StyleGroup.keys.padding_scale,
      StyleGroup.keys.margin_scale
    ] as const

    for (const key of scaleKeys) {
      if (!(key in inData)) continue
      const numeric = Number(inData[key])
      if (!Number.isFinite(numeric) || numeric <= 0) {
        throw new Error(`invalid_scale_factor:${key}`)
      }
    }

    if (StyleGroup.keys.corner_round in inData) {
      const corner = Number(inData[StyleGroup.keys.corner_round])
      if (!Number.isInteger(corner) || corner < 0) {
        throw new Error('invalid_corner_round')
      }
    }

    if (StyleGroup.keys.border_width in inData) {
      const borderWidth = Number(inData[StyleGroup.keys.border_width])
      if (!Number.isInteger(borderWidth) || borderWidth < 0) {
        throw new Error('invalid_border_width')
      }
    }

    return inData
  }

  override do_validation(key: string, value: unknown): [unknown, string] {
    if (
      (key === StyleGroup.keys.font_color ||
        key === StyleGroup.keys.background_color ||
        key === StyleGroup.keys.textbox_background_color ||
        key === StyleGroup.keys.textbox_textcolor ||
        key === StyleGroup.keys.button_color ||
        key === StyleGroup.keys.border_color) &&
      !HEX_COLOR_REGEX.test(String(value))
    ) {
      throw new Error('invalid_hex_color')
    }

    if (
      (key === StyleGroup.keys.font_scale ||
        key === StyleGroup.keys.icon_scale ||
        key === StyleGroup.keys.button_scale ||
        key === StyleGroup.keys.padding_scale ||
        key === StyleGroup.keys.margin_scale)
    ) {
      const numeric = Number(value)
      if (!Number.isFinite(numeric) || numeric <= 0) {
        throw new Error(`invalid_scale_factor:${key}`)
      }
    }

    if (key === StyleGroup.keys.corner_round) {
      const corner = Number(value)
      if (!Number.isInteger(corner) || corner < 0) {
        throw new Error('invalid_corner_round')
      }
    }

    if (key === StyleGroup.keys.border_width) {
      const borderWidth = Number(value)
      if (!Number.isInteger(borderWidth) || borderWidth < 0) {
        throw new Error('invalid_border_width')
      }
    }

    return [value, '']
  }
}

export class StyleSettings extends BaseData.define({
  background_color: ['string', '#FFFFFF'],
  graph_storage_root: ['string', null],
  primary: [StyleGroup, new StyleGroup({
    font_color: '#C2C2C2',
    background_color: '#2E2E2E',
    textbox_background_color: '#D7D4D4',
    button_color: '#595959',
    corner_round: 8,
    border_width: 1,
    border_color: '#404040'
  })],
  secondary: [StyleGroup, new StyleGroup({
    font_color: '#E1E1E1',
    font_scale: 1.2,
    background_color: '#292828',
    textbox_background_color: '#81EDFC',
    button_color: '#575757',
    corner_round: 8
  })],
  experimental: [StyleGroup, new StyleGroup({
    background_color: '#FF0000'
  })],
  diagnostic: [StyleGroup, new StyleGroup({
    background_color: '#C900BC'
  })],
  accent: [StyleGroup, new StyleGroup({})],
  subtle: [StyleGroup, new StyleGroup({})],
  disabled: [StyleGroup, new StyleGroup({})],
  sid_style_mapping: [SidStyleMapping, new SidStyleMapping({})]
}) {
  override do_validation(key: string, value: unknown): [unknown, string] {
    if (
      key === StyleSettings.keys.background_color &&
      !HEX_COLOR_REGEX.test(value as string)
    ) {
      throw new Error('invalid_hex_color')
    }
    return [value, '']
  }
}
