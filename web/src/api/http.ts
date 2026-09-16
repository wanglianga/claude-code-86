import axios from 'axios'
import { ElMessage } from 'element-plus'
import router from '../router'

const http = axios.create({ baseURL: '/api', timeout: 20000 })

http.interceptors.request.use((config) => {
  const token = localStorage.getItem('fm_token')
  if (token) config.headers.Authorization = `Bearer ${token}`
  return config
})

http.interceptors.response.use(
  (res) => res.data,
  (err) => {
    const msg = err.response?.data?.message
    const text = Array.isArray(msg) ? msg[0] : (msg || err.message || '请求失败')
    if (err.response?.status === 401) {
      localStorage.removeItem('fm_token')
      localStorage.removeItem('fm_user')
      if (router.currentRoute.value.path !== '/login') {
        ElMessage.error('登录已过期，请重新登录')
        router.push('/login')
      }
    } else {
      ElMessage.error(text)
    }
    return Promise.reject(err)
  },
)

export default http
