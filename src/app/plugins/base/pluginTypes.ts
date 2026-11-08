import type { Component } from 'vue'
import type { RouteLocationNormalizedLoaded, RouteRecordRaw } from 'vue-router'

export interface PluginEvent {
  type: string
  payload?: unknown
}

export interface LeftPanelSectionContribution {
  id: string
  component: Component
}

export interface CenterViewContext {
  route: RouteLocationNormalizedLoaded
}

export interface CenterViewContribution {
  id: string
  component: Component
  match: (context: CenterViewContext) => boolean
}

export interface WorkspaceVisibilityContext {
  route: RouteLocationNormalizedLoaded
}

export interface WorkspaceVisibilityOverride {
  hideLeftPanel?: boolean
  hideRightPanel?: boolean
  hidePagesAndLayers?: boolean
}

export interface SettingsAreaContribution {
  id: string
  label: string
  component: Component
}

export interface UIPlugin {
  readonly id: string
  readonly routes: RouteRecordRaw[]
  readonly leftSections?: readonly LeftPanelSectionContribution[]
  readonly centerViews?: readonly CenterViewContribution[]
  readonly workspaceVisibility?: (
    context: WorkspaceVisibilityContext
  ) => WorkspaceVisibilityOverride | null
  readonly settingsAreas?: readonly SettingsAreaContribution[]
  onEvent?(event: PluginEvent): void | Promise<void>
}
