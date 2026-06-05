import { useState, useEffect, useCallback } from 'react'
import { authService } from '../services/auth.service'
import type { AuthMe } from '../types'

interface AuthState {
  user: AuthMe | null
  loading: boolean
}

export function useAuth() {
  const [state, setState] = useState<AuthState>({ user: null, loading: true })

  const load = useCallback(async (): Promise<AuthMe | null> => {
    const token = localStorage.getItem('gabi_token')
    if (!token) {
      setState({ user: null, loading: false })
      return null
    }
    try {
      const user = await authService.me()
      setState({ user, loading: false })
      return user
    } catch {
      localStorage.removeItem('gabi_token')
      setState({ user: null, loading: false })
      return null
    }
  }, [])

  useEffect(() => {
    load()
  }, [load])

  const login = async (email: string, password: string): Promise<AuthMe | null> => {
    const { access_token } = await authService.login(email, password)
    localStorage.setItem('gabi_token', access_token)
    return load()
  }

  const logout = () => {
    localStorage.removeItem('gabi_token')
    setState({ user: null, loading: false })
  }

  return { ...state, login, logout }
}
