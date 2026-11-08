import { ref } from 'vue'

export const fragmintCenterDeactivateToken = ref(0)

export function requestFragmintCenterDeactivate(): void {
  fragmintCenterDeactivateToken.value += 1
}
