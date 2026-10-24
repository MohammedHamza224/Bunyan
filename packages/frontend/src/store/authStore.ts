import {
  createContext,
  useContext,
  useState,
  useEffect,
  ReactNode,
  useCallback,
  createElement,
} from 'react'
import {
  api,
  setAccessToken,
  getAccessToken,
  getStoredRefreshToken,
  setStoredRefreshToken,
  clearStoredRefreshToken,
} from '../lib/api'

export interface User {
  id: string
  email: string
  nameAr: string
  nameEn: string | null
  role: string
  permissions: string[]
  organizationId: string
}

interface AuthState {
  user: User | null
  isLoading: boolean
  isAuthenticated: boolean
}

export interface RegisterData {
  organizationName?: string
  email: string
  password: string
  nameAr: string
  nameEn?: string
}

interface AuthContextType extends AuthState {
  login: (email: string, password: string, rememberMe?: boolean) => Promise<void>
  register: (data: RegisterData) => Promise<void>
  logout: () => Promise<void>
  hasPermission: (permission: string) => boolean
  refreshUser: () => Promise<void>
}

const AuthContext = createContext<AuthContextType | null>(null)

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null)
  const [isLoading, setIsLoading] = useState(true)

  const fetchCurrentUser = useCallback(async () => {
    try {
      const response = await api.get('/auth/me')
      const userData = response.data?.data || response.data
      setUser(userData)
    } catch {
      setUser(null)
      setAccessToken(null)
    }
  }, [])

  useEffect(() => {
    const initAuth = async () => {
      const refreshToken = getStoredRefreshToken()
      if (!refreshToken) {
        setIsLoading(false)
        return
      }

      try {
        const response = await api.post('/auth/refresh', { refreshToken })
        const tokens = response.data?.data?.tokens || response.data?.tokens
        if (tokens?.accessToken && tokens?.refreshToken) {
          setAccessToken(tokens.accessToken)
          const rememberMe =
            typeof tokens.rememberMe === 'boolean' ? tokens.rememberMe : undefined
          setStoredRefreshToken(tokens.refreshToken, rememberMe)
          await fetchCurrentUser()
        } else {
          throw new Error('Missing tokens')
        }
      } catch {
        setAccessToken(null)
        clearStoredRefreshToken()
      } finally {
        setIsLoading(false)
      }
    }

    initAuth()
  }, [fetchCurrentUser])

  const login = useCallback(
    async (email: string, password: string, rememberMe = false) => {
      const response = await api.post('/auth/login', {
        email,
        password,
        rememberMe: Boolean(rememberMe),
      })
      const payload = response.data?.data || response.data
      const { tokens, user: userData } = payload
      const persist =
        typeof tokens?.rememberMe === 'boolean' ? tokens.rememberMe : Boolean(rememberMe)
      setAccessToken(tokens.accessToken)
      setStoredRefreshToken(tokens.refreshToken, persist)
      setUser(userData)
    },
    []
  )

  const register = useCallback(async (data: RegisterData) => {
    const response = await api.post('/auth/register', data)
    const payload = response.data?.data || response.data
    const { tokens, user: userData } = payload
    setAccessToken(tokens.accessToken)
    setStoredRefreshToken(tokens.refreshToken, false)
    setUser(userData)
  }, [])

  const logout = useCallback(async () => {
    try {
      const refreshToken = getStoredRefreshToken()
      if (refreshToken) {
        await api.post('/auth/logout', { refreshToken })
      }
    } catch {
      // Ignore logout network errors
    } finally {
      setAccessToken(null)
      clearStoredRefreshToken()
      setUser(null)
    }
  }, [])

  const hasPermission = useCallback(
    (permission: string) => {
      if (!user) return false
      if (user.role === 'ORG_ADMIN' || user.role === 'SUPER_ADMIN') return true
      return Array.isArray(user.permissions) && user.permissions.includes(permission)
    },
    [user]
  )

  return createElement(
    AuthContext.Provider,
    {
      value: {
        user,
        isLoading,
        isAuthenticated: !!user && !!getAccessToken(),
        login,
        register,
        logout,
        hasPermission,
        refreshUser: fetchCurrentUser,
      },
    },
    children
  )
}

export function useAuth() {
  const context = useContext(AuthContext)
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider')
  }
  return context
}
