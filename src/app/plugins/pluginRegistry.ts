import { collectLeftSections, collectPluginRoutes, collectSettingsAreas } from '@/app/plugins/base/runtime'
import type { UIPlugin } from '@/app/plugins/base/pluginTypes'
import { FragmintPlugin } from '@/app/plugins/fragmint/FragmintPlugin'

export const plugins: readonly UIPlugin[] = [new FragmintPlugin()]
export const pluginRoutes = collectPluginRoutes(plugins)
export const pluginLeftSections = collectLeftSections(plugins)
export const pluginSettingsAreas = collectSettingsAreas(plugins)
