import { apiUrl, isApiPath, resolveApiUrl } from './url'

export const DEFAULT_SCENARIO_ID = 'A-12-base'

export type ApiFetcher = (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>

export type ScenarioQueryKey = readonly ['scenario', string, ...readonly unknown[]]

export function scenarioQueryKey(scenarioId: string | undefined, ...parts: readonly unknown[]): ScenarioQueryKey {
  return ['scenario', normalizeScenarioId(scenarioId), ...parts]
}

export interface ApiErrorOptions {
  status: number
  code?: string
  message: string
  requestId?: string
  details?: Record<string, unknown>
  retryable?: boolean
}

export class ApiError extends Error {
  readonly status: number
  readonly code: string
  readonly requestId?: string
  readonly details: Record<string, unknown>
  readonly retryable: boolean

  constructor({ status, code = `http_${status}`, message, requestId, details = {}, retryable = false }: ApiErrorOptions) {
    super(message)
    this.name = 'ApiError'
    this.status = status
    this.code = code
    this.requestId = requestId
    this.details = details
    this.retryable = retryable
  }
}

export interface ApiRequestOptions extends Omit<RequestInit, 'body' | 'headers'> {
  body?: BodyInit | object | null
  headers?: HeadersInit
  scenarioId?: string
}

export interface ApiTransportOptions {
  scenarioId?: string
  allowedScenarioIds?: Iterable<string>
  baseUrl?: string
  fetcher?: ApiFetcher
}

export interface ApiTransport {
  readonly scenarioId: string
  fetch(path: string, options?: ApiRequestOptions): Promise<Response>
  request<T>(path: string, options?: ApiRequestOptions): Promise<T>
  get<T>(path: string, options?: Omit<ApiRequestOptions, 'method' | 'body'>): Promise<T>
  post<T>(path: string, body?: ApiRequestOptions['body'], options?: Omit<ApiRequestOptions, 'method' | 'body'>): Promise<T>
  patch<T>(path: string, body?: ApiRequestOptions['body'], options?: Omit<ApiRequestOptions, 'method' | 'body'>): Promise<T>
  openSse(path: string, options?: Omit<ApiRequestOptions, 'method'>): Promise<Response>
  queryKey(...parts: readonly unknown[]): ScenarioQueryKey
}

let activeScenarioId = DEFAULT_SCENARIO_ID
let activeAllowedScenarioIds: readonly string[] | undefined

/**
 * Updates the process-local transport context used by feature API consumers.
 * The router owns this value; consumers stay deliberately unaware of routing.
 */
export function setActiveScenarioContext(scenarioId: string, allowedScenarioIds?: readonly string[]): void {
  activeScenarioId = normalizeScenarioId(scenarioId)
  activeAllowedScenarioIds = allowedScenarioIds?.map(normalizeScenarioId)
}

export function createApiTransport(options: ApiTransportOptions = {}): ApiTransport {
  const scenarioId = normalizeScenarioId(options.scenarioId ?? activeScenarioId)
  const allowedScenarioIds = options.allowedScenarioIds === undefined && activeAllowedScenarioIds === undefined
    ? undefined
    : new Set(options.allowedScenarioIds ?? activeAllowedScenarioIds)
  const fetcher = options.fetcher ?? ((input, init) => globalThis.fetch(input, init))
  const baseUrl = options.baseUrl?.trim()

  const assertAllowedScenario = (candidate: string) => {
    if (allowedScenarioIds && !allowedScenarioIds.has(candidate)) {
      throw unknownScenarioError(candidate)
    }
    return candidate
  }

  const resolveRequestScenario = (candidate: string | undefined) => {
    const selected = normalizeScenarioId(candidate === undefined ? scenarioId : candidate)
    if (selected !== scenarioId) {
      throw new ApiError({
        status: 400,
        code: 'scenario_context_mismatch',
        message: 'The request scenario does not match the active scenario context.',
        details: { active_scenario_id: scenarioId, request_scenario_id: selected },
      })
    }
    return assertAllowedScenario(selected)
  }

  const requestUrl = (path: string) => baseUrl ? resolveApiUrl(path, baseUrl) : apiUrl(path)

  const fetchResponse = async (path: string, requestOptions: ApiRequestOptions = {}): Promise<Response> => {
    if (!isApiPath(path)) {
      throw new ApiError({ status: 400, code: 'invalid_api_path', message: 'API requests must use a versioned /api/v1 path.' })
    }
    const requestScenario = resolveRequestScenario(requestOptions.scenarioId)
    const headers = new Headers(requestOptions.headers)
    headers.set('X-Scenario-ID', requestScenario)
    if (!headers.has('Accept')) headers.set('Accept', 'application/json')

    const { body, scenarioId: _scenarioId, ...init } = requestOptions
    const requestInit: RequestInit = { ...init, headers }
    if (body !== undefined && body !== null && !(body instanceof Blob) && typeof body !== 'string' && !(body instanceof ArrayBuffer) && !(body instanceof FormData) && !(body instanceof URLSearchParams) && !(body instanceof ReadableStream)) {
      requestInit.body = JSON.stringify(body)
      if (!headers.has('Content-Type')) headers.set('Content-Type', 'application/json')
    } else if (body !== undefined) {
      requestInit.body = body as BodyInit
    }

    const response = await fetcher(requestUrl(path), requestInit)
    if (!response.ok) throw await apiErrorFromResponse(response)
    return response
  }

  const request = async <T>(path: string, requestOptions: ApiRequestOptions = {}): Promise<T> => {
    const response = await fetchResponse(path, requestOptions)
    if (response.status === 204) return undefined as T
    try {
      return await response.json() as T
    } catch {
      throw new ApiError({ status: 502, code: 'invalid_json', message: 'The API returned an invalid JSON response.' })
    }
  }

  return {
    scenarioId,
    fetch: fetchResponse,
    request,
    get: (path, requestOptions) => request(path, { ...requestOptions, method: 'GET' }),
    post: (path, body, requestOptions) => request(path, { ...requestOptions, method: 'POST', body }),
    patch: (path, body, requestOptions) => request(path, { ...requestOptions, method: 'PATCH', body }),
    openSse: (path, requestOptions) => {
      const headers = new Headers(requestOptions?.headers)
      headers.set('Accept', 'text/event-stream')
      return fetchResponse(path, { ...requestOptions, method: 'GET', headers })
    },
    queryKey: (...parts) => scenarioQueryKey(scenarioId, ...parts),
  }
}

function currentApiTransport(): ApiTransport {
  return createApiTransport({ scenarioId: activeScenarioId, allowedScenarioIds: activeAllowedScenarioIds })
}

export const apiTransport: ApiTransport = {
  get scenarioId() {
    return activeScenarioId
  },
  fetch: (path, options) => currentApiTransport().fetch(path, options),
  request: (path, options) => currentApiTransport().request(path, options),
  get: (path, options) => currentApiTransport().get(path, options),
  post: (path, body, options) => currentApiTransport().post(path, body, options),
  patch: (path, body, options) => currentApiTransport().patch(path, body, options),
  openSse: (path, options) => currentApiTransport().openSse(path, options),
  queryKey: (...parts) => scenarioQueryKey(activeScenarioId, ...parts),
}

export function normalizeScenarioId(scenarioId: string | undefined): string {
  if (scenarioId === undefined) return DEFAULT_SCENARIO_ID
  const normalized = scenarioId.trim()
  if (!normalized) throw unknownScenarioError(normalized)
  return normalized
}

export async function apiErrorFromResponse(response: Response): Promise<ApiError> {
  let payload: unknown
  try {
    payload = await response.json()
  } catch {
    payload = undefined
  }
  const root = asRecord(payload)
  const error = asRecord(root?.error) ?? root
  const details = asRecord(error?.details) ?? {}
  return new ApiError({
    status: response.status,
    code: stringValue(error?.code) ?? `http_${response.status}`,
    message: stringValue(error?.message) ?? stringValue(root?.detail) ?? `API request failed with status ${response.status}.`,
    requestId: stringValue(error?.request_id) ?? response.headers.get('X-Request-ID') ?? undefined,
    details,
    retryable: error?.retryable === true,
  })
}

function unknownScenarioError(scenarioId: string): ApiError {
  return new ApiError({
    status: 404,
    code: 'unknown_scenario',
    message: scenarioId ? `Unknown scenario: ${scenarioId}.` : 'A scenario is required.',
    details: { scenario_id: scenarioId },
  })
}

function asRecord(value: unknown): Record<string, unknown> | undefined {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : undefined
}

function stringValue(value: unknown): string | undefined {
  return typeof value === 'string' && value.length > 0 ? value : undefined
}
