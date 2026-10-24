import axios, { AxiosError, InternalAxiosRequestConfig } from 'axios'

const API_BASE = import.meta.env.VITE_API_URL || '/api'
const REFRESH_TOKEN_KEY = 'refreshToken'

// In-memory token storage (never expose access token in localStorage or sessionStorage)
let accessToken: string | null = null
let isRefreshing = false
let refreshSubscribers: Array<(token: string) => void> = []

export function setAccessToken(token: string | null) {
  accessToken = token
}

export function getAccessToken() {
  return accessToken
}

/**
 * Retrieve the refresh token from persistent storage (localStorage when Remember Me is enabled)
 * or non-persistent session storage (sessionStorage when Remember Me is disabled).
 */
export function getStoredRefreshToken(): string | null {
  try {
    return (
      window.localStorage.getItem(REFRESH_TOKEN_KEY) ||
      window.sessionStorage.getItem(REFRESH_TOKEN_KEY)
    )
  } catch {
    return null
  }
}

/**
 * Check whether the current client session is stored persistently (Remember Me = true).
 */
export function isPersistentSession(): boolean {
  try {
    return window.localStorage.getItem(REFRESH_TOKEN_KEY) !== null
  } catch {
    return false
  }
}

/**
 * Store the refresh token according to the Remember Me policy:
 * - rememberMe === true  → localStorage (persists across browser restarts, backed by 30d server expiry)
 * - rememberMe === false → sessionStorage (cleared when browser closes, backed by 24h server expiry)
 * - rememberMe === undefined → preserves whichever storage currently holds the token
 */
export function setStoredRefreshToken(token: string, rememberMe?: boolean) {
  try {
    const usePersistent =
      typeof rememberMe === 'boolean' ? rememberMe : isPersistentSession()

    if (usePersistent) {
      window.localStorage.setItem(REFRESH_TOKEN_KEY, token)
      window.sessionStorage.removeItem(REFRESH_TOKEN_KEY)
    } else {
      window.sessionStorage.setItem(REFRESH_TOKEN_KEY, token)
      window.localStorage.removeItem(REFRESH_TOKEN_KEY)
    }
  } catch {
    // Ignore storage errors in restricted environments
  }
}

/**
 * Clear the refresh token from both localStorage and sessionStorage on logout or expiry.
 */
export function clearStoredRefreshToken() {
  try {
    window.localStorage.removeItem(REFRESH_TOKEN_KEY)
    window.sessionStorage.removeItem(REFRESH_TOKEN_KEY)
  } catch {
    // Ignore storage errors
  }
}

function subscribeTokenRefresh(cb: (token: string) => void) {
  refreshSubscribers.push(cb)
}

function onTokenRefreshed(token: string) {
  refreshSubscribers.forEach((cb) => cb(token))
  refreshSubscribers = []
}

export const api = axios.create({
  baseURL: API_BASE,
  headers: { 'Content-Type': 'application/json' },
})

api.interceptors.request.use(
  (config: InternalAxiosRequestConfig) => {
    if (accessToken) {
      config.headers.Authorization = `Bearer ${accessToken}`
    }
    return config
  },
  (error) => Promise.reject(error)
)

api.interceptors.response.use(
  (response) => response,
  async (error: AxiosError) => {
    const originalRequest = error.config as InternalAxiosRequestConfig & { _retry?: boolean }

    if (
      error.response?.status === 401 &&
      originalRequest &&
      !originalRequest._retry &&
      !originalRequest.url?.includes('/auth/login') &&
      !originalRequest.url?.includes('/auth/register') &&
      !originalRequest.url?.includes('/auth/refresh')
    ) {
      if (isRefreshing) {
        return new Promise((resolve) => {
          subscribeTokenRefresh((token: string) => {
            originalRequest.headers.Authorization = `Bearer ${token}`
            resolve(api(originalRequest))
          })
        })
      }

      originalRequest._retry = true
      isRefreshing = true

      try {
        const refreshToken = getStoredRefreshToken()
        if (!refreshToken) {
          throw new Error('No refresh token')
        }

        const response = await axios.post(`${API_BASE}/auth/refresh`, {
          refreshToken,
        })

        const tokens = response.data?.data?.tokens || response.data?.tokens
        const newAccessToken = tokens?.accessToken
        const newRefreshToken = tokens?.refreshToken
        const rememberMe =
          typeof tokens?.rememberMe === 'boolean' ? tokens.rememberMe : undefined

        if (!newAccessToken || !newRefreshToken) {
          throw new Error('Invalid refresh response')
        }

        setAccessToken(newAccessToken)
        setStoredRefreshToken(newRefreshToken, rememberMe)

        onTokenRefreshed(newAccessToken)
        isRefreshing = false

        originalRequest.headers.Authorization = `Bearer ${newAccessToken}`
        return api(originalRequest)
      } catch (refreshError) {
        isRefreshing = false
        refreshSubscribers = []
        setAccessToken(null)
        clearStoredRefreshToken()
        if (window.location.pathname !== '/login' && window.location.pathname !== '/register') {
          window.location.href = '/login'
        }
        return Promise.reject(refreshError)
      }
    }

    return Promise.reject(error)
  }
)
