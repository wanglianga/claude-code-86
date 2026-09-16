import { defineStore } from 'pinia'
import http from '../api/http'

export const useAuthStore = defineStore('auth', {
  state: () => ({
    token: localStorage.getItem('fm_token') || '',
    user: JSON.parse(localStorage.getItem('fm_user') || 'null'),
  }),
  getters: {
    isLogin: (s) => !!s.token && !!s.user,
    role: (s) => s.user?.role || '',
  },
  actions: {
    async login(username: string, password: string) {
      const res: any = await http.post('/auth/login', { username, password })
      this.token = res.token
      this.user = res.user
      localStorage.setItem('fm_token', res.token)
      localStorage.setItem('fm_user', JSON.stringify(res.user))
    },
    async refresh() {
      const user: any = await http.get('/auth/me')
      this.user = user
      localStorage.setItem('fm_user', JSON.stringify(user))
    },
    logout() {
      this.token = ''
      this.user = null
      localStorage.removeItem('fm_token')
      localStorage.removeItem('fm_user')
    },
  },
})
