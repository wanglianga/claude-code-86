import { createRouter, createWebHistory } from 'vue-router'

const routes = [
  { path: '/login', component: () => import('../views/Login.vue') },
  {
    path: '/',
    component: () => import('../layout/MainLayout.vue'),
    children: [
      { path: '', component: () => import('../views/Dashboard.vue') },
      { path: 'orders', component: () => import('../views/OrderList.vue') },
      { path: 'orders/new', component: () => import('../views/OrderCreate.vue') },
      { path: 'orders/:id', component: () => import('../views/OrderDetail.vue') },
      { path: 'repurchase', component: () => import('../views/Repurchase.vue') },
      { path: 'inventory', component: () => import('../views/Inventory.vue') },
      { path: 'store-ops', component: () => import('../views/StoreOps.vue') },
      { path: 'deliveries', component: () => import('../views/Deliveries.vue') },
      { path: 'incidents', component: () => import('../views/Incidents.vue') },
      { path: 'finance', component: () => import('../views/Finance.vue') },
      { path: 'archives', component: () => import('../views/Archives.vue') },
      { path: 'admin', component: () => import('../views/Admin.vue') },
    ],
  },
]

const router = createRouter({
  history: createWebHistory(),
  routes,
})

router.beforeEach((to) => {
  const token = localStorage.getItem('fm_token')
  if (to.path !== '/login' && !token) return '/login'
  if (to.path === '/login' && token) return '/'
  return true
})

export default router
