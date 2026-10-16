const configuredApiBaseUrl = (import.meta.env.VITE_API_BASE_URL ?? '').trim().replace(/\/+$/, '')

/**
 * Keep API paths relative locally, while allowing the Vercel build to call the
 * separately hosted preview API. Absolute URLs returned by the API are kept.
 */
export function apiUrl(path: string): string {
  return resolveApiUrl(path, configuredApiBaseUrl)
}

export function resolveApiUrl(path: string, baseUrl: string): string {
  if (/^https?:\/\//i.test(path)) return path
  const normalizedPath = path.startsWith('/') ? path : `/${path}`
  return `${baseUrl.trim().replace(/\/+$/, '')}${normalizedPath}`
}

export function isApiPath(path: string): boolean {
  return /^\/api\/v1(?:\/|$)/.test(path) || /^https?:\/\/[^/]+\/api\/v1(?:\/|$)/i.test(path)
}
