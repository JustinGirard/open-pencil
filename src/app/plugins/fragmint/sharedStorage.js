function browserStorage() {
  return 'window' in globalThis ? window.localStorage : null
}

export function get(key) {
  try {
    const storage = browserStorage()
    if (!storage) return null
    const raw = storage.getItem(key)
    return raw === null ? null : JSON.parse(raw)
  } catch {
    return null
  }
}

export function set(key, value) {
  const storage = browserStorage()
  if (!storage) return
  storage.setItem(key, JSON.stringify(value))
}

export function remove(key) {
  const storage = browserStorage()
  if (!storage) return
  storage.removeItem(key)
}
