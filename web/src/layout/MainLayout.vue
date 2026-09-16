<template>
  <el-container class="layout">
    <el-aside width="220px" class="aside">
      <div class="logo">
        <span class="logo-icon">🍱</span>
        <div>
          <div class="logo-name">鲜达团餐</div>
          <div class="logo-sub">企业团餐 · 临期调拨</div>
        </div>
      </div>
      <el-menu :default-active="activeMenu" router class="menu">
        <el-menu-item v-for="m in menus" :key="m.path" :index="m.path">
          <el-icon><component :is="m.icon" /></el-icon>
          <span>{{ m.title }}</span>
        </el-menu-item>
      </el-menu>
    </el-aside>
    <el-container>
      <el-header class="header" height="56px">
        <div class="crumb">{{ currentTitle }}</div>
        <div class="header-right">
          <el-popover placement="bottom-end" width="380" trigger="click">
            <template #reference>
              <el-badge :value="unread" :hidden="!unread" class="bell">
                <el-icon size="20"><Bell /></el-icon>
              </el-badge>
            </template>
            <div class="notify-head">
              <span>消息通知</span>
              <el-button link type="primary" size="small" @click="readAll">全部已读</el-button>
            </div>
            <el-scrollbar max-height="360px">
              <div v-if="!notifications.length" class="muted" style="padding:16px">暂无通知</div>
              <div v-for="n in notifications" :key="n.id" class="notify-item" :class="{ unread: !n.read }" @click="openNotify(n)">
                <div class="notify-title">{{ n.title }}</div>
                <div class="notify-content">{{ n.content }}</div>
                <div class="muted">{{ fmtTime(n.createdAt) }}</div>
              </div>
            </el-scrollbar>
          </el-popover>
          <el-dropdown @command="onCommand">
            <span class="user-chip">
              <el-avatar :size="28" class="avatar">{{ auth.user?.name?.slice(0, 1) }}</el-avatar>
              <span>{{ auth.user?.name }}</span>
              <el-tag size="small" effect="plain">{{ auth.user?.roleName }}</el-tag>
            </span>
            <template #dropdown>
              <el-dropdown-menu>
                <el-dropdown-item disabled>{{ auth.user?.enterpriseName || auth.user?.storeName || '平台' }}</el-dropdown-item>
                <el-dropdown-item command="logout" divided>退出登录</el-dropdown-item>
              </el-dropdown-menu>
            </template>
          </el-dropdown>
        </div>
      </el-header>
      <el-main class="main">
        <router-view />
      </el-main>
    </el-container>
  </el-container>
</template>

<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useAuthStore } from '../stores/auth'
import http from '../api/http'
import { fmtTime } from '../utils/dict'

const auth = useAuthStore()
const route = useRoute()
const router = useRouter()

const MENU_BY_ROLE: Record<string, { path: string; title: string; icon: string }[]> = {
  ENTERPRISE: [
    { path: '/', title: '工作台', icon: 'Odometer' },
    { path: '/orders/new', title: '发起团餐', icon: 'CirclePlus' },
    { path: '/orders', title: '我的订单', icon: 'Tickets' },
    { path: '/repurchase', title: '复购助手', icon: 'RefreshRight' },
    { path: '/finance', title: '发票与月结', icon: 'Postcard' },
    { path: '/archives', title: '交付档案', icon: 'FolderOpened' },
  ],
  STORE: [
    { path: '/', title: '工作台', icon: 'Odometer' },
    { path: '/orders', title: '团餐订单', icon: 'Tickets' },
    { path: '/inventory', title: '库存与临期', icon: 'Box' },
    { path: '/store-ops', title: '排班与到货', icon: 'Calendar' },
    { path: '/incidents', title: '异常工单', icon: 'Warning' },
  ],
  LOGISTICS: [
    { path: '/', title: '工作台', icon: 'Odometer' },
    { path: '/deliveries', title: '配送任务', icon: 'Van' },
  ],
  SERVICE: [
    { path: '/', title: '工作台', icon: 'Odometer' },
    { path: '/incidents', title: '异常工单', icon: 'Warning' },
    { path: '/orders', title: '订单总览', icon: 'Tickets' },
  ],
  FINANCE: [
    { path: '/', title: '工作台', icon: 'Odometer' },
    { path: '/finance', title: '发票与月结', icon: 'Postcard' },
    { path: '/incidents', title: '赔付工单', icon: 'Warning' },
  ],
  ADMIN: [
    { path: '/', title: '工作台', icon: 'Odometer' },
    { path: '/orders', title: '订单总览', icon: 'Tickets' },
    { path: '/incidents', title: '异常工单', icon: 'Warning' },
    { path: '/inventory', title: '库存总览', icon: 'Box' },
    { path: '/archives', title: '交付档案', icon: 'FolderOpened' },
    { path: '/admin', title: '平台管理', icon: 'Setting' },
  ],
}

const menus = computed(() => MENU_BY_ROLE[auth.role] || MENU_BY_ROLE.ADMIN)
const activeMenu = computed(() => {
  if (route.path.startsWith('/orders/') && route.path !== '/orders/new') return '/orders'
  return route.path
})
const currentTitle = computed(() => {
  const m = menus.value.find((x) => x.path === activeMenu.value)
  if (route.path === '/orders/new') return '发起团餐'
  if (route.path.startsWith('/orders/')) return '团餐单详情'
  return m?.title || '工作台'
})

const notifications = ref<any[]>([])
const unread = ref(0)
let timer: any = null

async function loadNotify() {
  try {
    const [list, count]: any = await Promise.all([
      http.get('/notifications'),
      http.get('/notifications/unread-count'),
    ])
    notifications.value = list
    unread.value = count
  } catch { /* 忽略轮询错误 */ }
}

async function openNotify(n: any) {
  if (!n.read) {
    await http.post(`/notifications/${n.id}/read`)
    n.read = true
    unread.value = Math.max(0, unread.value - 1)
  }
  if (n.orderId) router.push(`/orders/${n.orderId}`)
}

async function readAll() {
  await http.post('/notifications/read-all')
  loadNotify()
}

function onCommand(cmd: string) {
  if (cmd === 'logout') {
    auth.logout()
    router.push('/login')
  }
}

onMounted(() => {
  loadNotify()
  timer = setInterval(loadNotify, 15000)
})
onUnmounted(() => clearInterval(timer))
</script>

<style scoped>
.layout { height: 100vh; }
.aside { background: #fff; border-right: 1px solid #ebeef5; display: flex; flex-direction: column; }
.logo { display: flex; align-items: center; gap: 10px; padding: 16px 14px; border-bottom: 1px solid #f2f3f5; }
.logo-icon { font-size: 28px; }
.logo-name { font-weight: 700; font-size: 16px; }
.logo-sub { font-size: 11px; color: #909399; }
.menu { border-right: none; flex: 1; }
.header {
  background: #fff; border-bottom: 1px solid #ebeef5;
  display: flex; align-items: center; justify-content: space-between;
}
.crumb { font-weight: 600; }
.header-right { display: flex; align-items: center; gap: 18px; }
.bell { cursor: pointer; }
.user-chip { display: flex; align-items: center; gap: 8px; cursor: pointer; }
.avatar { background: var(--brand); color: #fff; }
.main { background: var(--bg); padding: 0; overflow-y: auto; }
.notify-head { display: flex; justify-content: space-between; align-items: center; font-weight: 600; margin-bottom: 6px; }
.notify-item { padding: 8px 6px; border-bottom: 1px solid #f2f3f5; cursor: pointer; border-radius: 6px; }
.notify-item:hover { background: #f7f8fa; }
.notify-item.unread .notify-title { color: var(--brand); }
.notify-title { font-weight: 600; font-size: 13px; }
.notify-content { font-size: 12px; color: #606266; margin: 2px 0; }
</style>
