export function getFragmintBaseUrl(): string {
  const origin = window.location.origin
  if (typeof origin !== 'string' || origin.trim().length === 0)
    throw new Error('[fragmint-plugin] missing required browser origin')
  return origin
}
