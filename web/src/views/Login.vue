<template>
  <div class="login-wrap">
    <div class="login-card">
      <div class="brand">
        <span class="brand-icon">🍱</span>
        <div>
          <div class="brand-name">鲜达团餐</div>
          <div class="brand-sub">便利店企业团餐预订与临期鲜食调拨平台</div>
        </div>
      </div>
      <el-form @submit.prevent="doLogin">
        <el-form-item>
          <el-input v-model="username" size="large" placeholder="用户名" :prefix-icon="User" />
        </el-form-item>
        <el-form-item>
          <el-input v-model="password" size="large" type="password" placeholder="密码"
            :prefix-icon="Lock" show-password @keyup.enter="doLogin" />
        </el-form-item>
        <el-button type="primary" size="large" class="login-btn" :loading="loading" @click="doLogin">
          登 录
        </el-button>
      </el-form>
      <el-divider content-position="left"><span class="muted">演示账号（密码均为 123456）</span></el-divider>
      <div class="accounts">
        <el-tag v-for="a in demoAccounts" :key="a.u" class="acc-tag" @click="fill(a.u)">
          {{ a.label }} {{ a.u }}
        </el-tag>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref } from 'vue'
import { useRouter } from 'vue-router'
import { ElMessage } from 'element-plus'
import { User, Lock } from '@element-plus/icons-vue'
import { useAuthStore } from '../stores/auth'

const auth = useAuthStore()
const router = useRouter()
const username = ref('chenguang')
const password = ref('123456')
const loading = ref(false)

const demoAccounts = [
  { u: 'chenguang', label: '企业行政' },
  { u: 'hengyu', label: '企业行政2' },
  { u: 'store1', label: '门店' },
  { u: 'courier1', label: '仓配' },
  { u: 'service', label: '客服' },
  { u: 'finance', label: '财务' },
  { u: 'admin', label: '平台运营' },
]

function fill(u: string) {
  username.value = u
  password.value = '123456'
}

async function doLogin() {
  if (!username.value || !password.value) {
    ElMessage.warning('请输入用户名和密码')
    return
  }
  loading.value = true
  try {
    await auth.login(username.value, password.value)
    ElMessage.success(`欢迎，${auth.user?.name}`)
    router.push('/')
  } finally {
    loading.value = false
  }
}
</script>

<style scoped>
.login-wrap {
  height: 100vh; display: flex; align-items: center; justify-content: center;
  background: linear-gradient(135deg, #fff7f0 0%, #ffe8d6 45%, #e8f7ef 100%);
}
.login-card {
  width: 420px; background: #fff; border-radius: 14px; border-radius: 14px;
  padding: 34px 36px 26px; box-shadow: 0 12px 40px rgba(255, 106, 0, .12);
}
.brand { display: flex; gap: 12px; align-items: center; margin-bottom: 26px; }
.brand-icon { font-size: 40px; }
.brand-name { font-size: 22px; font-weight: 800; }
.brand-sub { color: #909399; font-size: 12px; color: #909399; }
.login-btn { width: 100%; }
.accounts { display: flex; flex-wrap: wrap; gap: 8px; }
.acc-tag { cursor: pointer; }
</style>
