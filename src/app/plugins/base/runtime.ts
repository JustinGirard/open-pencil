import type { RouteRecordRaw } from 'vue-router'

import type {
  CenterViewContext,
  CenterViewContribution,
  LeftPanelSectionContribution,
  PluginEvent,
  SettingsAreaContribution,
  UIPlugin,
  WorkspaceVisibilityContext,
  WorkspaceVisibilityOverride
} from '@/app/plugins/base/pluginTypes'

export function collectPluginRoutes(plugins: readonly UIPlugin[]): RouteRecordRaw[] {
  return plugins.flatMap((plugin) => plugin.routes)
}

export function collectLeftSections(plugins: readonly UIPlugin[]): LeftPanelSectionContribution[] {
  return plugins.flatMap((plugin) => plugin.leftSections ?? [])
}

export function collectSettingsAreas(plugins: readonly UIPlugin[]): SettingsAreaContribution[] {
  return plugins.flatMap((plugin) => plugin.settingsAreas ?? [])
}

export function resolveCenterView(
  plugins: readonly UIPlugin[],
  context: CenterViewContext
): CenterViewContribution | null {
  for (const plugin of plugins) {
    for (const view of plugin.centerViews ?? []) {
      if (view.match(context)) return view
    }
  }
  return null
}

export function resolveWorkspaceVisibility(
  plugins: readonly UIPlugin[],
  context: WorkspaceVisibilityContext
): WorkspaceVisibilityOverride {
  const out: WorkspaceVisibilityOverride = {}
  for (const plugin of plugins) {
    if (!plugin.workspaceVisibility) continue
    const visibility = plugin.workspaceVisibility(context)
    if (!visibility) continue
    if (visibility.hideLeftPanel) out.hideLeftPanel = true
    if (visibility.hideRightPanel) out.hideRightPanel = true
    if (visibility.hidePagesAndLayers) out.hidePagesAndLayers = true
  }
  return out
}

export async function dispatchPluginEvent(
  plugins: readonly UIPlugin[],
  event: PluginEvent
): Promise<void> {
  for (const plugin of plugins) {
    if (!plugin.onEvent) continue
    await plugin.onEvent(event)
  }
}
