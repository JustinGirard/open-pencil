import type { RouteRecordRaw } from 'vue-router'

import type { PluginEvent, UIPlugin } from '@/app/plugins/base/pluginTypes'

export abstract class BasePlugin implements UIPlugin {
  abstract readonly id: string
  abstract readonly routes: RouteRecordRaw[]

  onEvent(_event: PluginEvent): void | Promise<void> {}
}
