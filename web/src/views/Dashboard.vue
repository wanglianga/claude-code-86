<template>
  <div class="page">
    <div class="page-title">{{ greeting }}，{{ auth.user?.name }}（{{ auth.user?.roleName }}）</div>

    <div class="card-grid">
      <div class="stat-card" v-if="sum.activeOrders !== undefined">
        <div class="label">进行中团餐单</div>
        <div class="value">{{ sum.activeOrders }}</div>
        <div class="sub">今日交付 {{ sum.todayOrders }} 单</div>
      </div>
      <div class="stat-card" v-if="sum.openIncidents !== undefined">
        <div class="label">未结异常工单</div>
        <div class="value" :class="{ 'danger-text': sum.openIncidents > 0 }">{{ sum.openIncidents }}</div>
        <div class="sub">需协同处理</div>
      </div>
      <div class="stat-card" v-if="sum.nearExpiryQty !== undefined">
        <div class="label">6 小时内临期鲜食</div>
        <div class="value warn-text">{{ sum.nearExpiryQty }}</div>
        <div class="sub">在库鲜食 {{ sum.stockQty }} 份</div>
      </div>
      <div class="stat-card" v-if="sum.myTasks !== undefined">
        <div class="label">我的配送任务</div>
        <div class="value">{{ sum.myTasks }}</div>
        <div class="sub">待取货/配送中</div>
      </div>
      <div class="stat-card" v-if="sum.pendingInvoices !== undefined">
        <div class="label">待开发票</div>
        <div class="value">{{ sum.pendingInvoices }}</div>
        <div class="sub">错误发票 {{ sum.errorInvoices }} 张</div>
      </div>
      <div class="stat-card" v-if="sum.onTimeRate !== undefined">
        <div class="label">历史准点率</div>
        <div class="value ok-text">{{ sum.onTimeRate }}%</div>
        <div class="sub">已归档 {{ sum.totalArchives }} 单</div>
      </div>
      <div class="stat-card" v-if="sum.revenue !== undefined">
        <div class="label">平台团餐营收</div>
        <div class="value">{{ fmtMoney(sum.revenue) }}</div>
        <div class="sub">累计 {{ sum.totalOrders }} 单 · 消化临期 {{ sum.nearExpiryUsed }} 份</div>
      </div>
    </div>

    <div style="display:grid; grid-template-columns: 1.4fr 1fr; gap:14px; margin-top:14px">
      <div class="panel">
        <div class="panel-title">近 7 日团餐单趋势</div>
        <div ref="trendRef" style="height:260px"></div>
      </div>
      <div class="panel" v-if="balance">
        <div class="panel-title">门店平衡提醒（团餐 / 散客 / 临期）</div>
        <el-progress :percentage="balance.usageRate" :color="usageColor" :stroke-width="14" style="margin-bottom:10px">
          <span>团餐产能占用 {{ balance.usageRate }}%</span>
        </el-progress>
        <el-alert v-for="(s, i) in balance.suggestions" :key="i" :title="s" type="warning"
          :closable="false" show-icon style="margin-bottom:8px" />
      </div>
      <div class="panel" v-else>
        <div class="panel-title">快捷入口</div>
        <div class="quick">
          <el-button v-if="auth.role === 'ENTERPRISE'" type="primary" @click="$router.push('/orders/new')">发起团餐</el-button>
          <el-button v-if="auth.role === 'ENTERPRISE'" @click="$router.push('/repurchase')">复购助手</el-button>
          <el-button v-if="auth.role === 'STORE'" type="primary" @click="$router.push('/orders')">处理团餐订单</el-button>
          <el-button v-if="auth.role === 'STORE'" @click="$router.push('/inventory')">库存与临期</el-button>
          <el-button v-if="auth.role === 'LOGISTICS'" type="primary" @click="$router.push('/deliveries')">配送任务</el-button>
          <el-button v-if="auth.role === 'SERVICE'" type="primary" @click="$router.push('/incidents')">异常工单</el-button>
          <el-button v-if="auth.role === 'FINANCE'" type="primary" @click="$router.push('/finance')">发票与月结</el-button>
          <el-button v-if="auth.role === 'ADMIN'" type="primary" @click="$router.push('/admin')">平台管理</el-button>
          <el-button @click="$router.push('/orders')">订单列表</el-button>
        </div>
        <el-divider />
        <div class="muted">
          平台把企业行政、门店、仓配、客服、财务放在同一团餐单里协同：
          人数变更、库存不足、鲜食临期、配送迟到、发票错误、餐食变质都会自动生成异常工单并通知相关角色。
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import * as echarts from 'echarts'
import http from '../api/http'
import { useAuthStore } from '../stores/auth'
import { fmtMoney } from '../utils/dict'

const auth = useAuthStore()
const sum = ref<any>({})
const balance = ref<any>(null)
const trendRef = ref<HTMLElement>()

const greeting = computed(() => {
  const h = new Date().getHours()
  if (h < 6) return '凌晨好'
  if (h < 12) return '上午好'
  if (h < 14) return '中午好'
  if (h < 18) return '下午好'
  return '晚上好'
})

const usageColor = (p: number) => (p >= 80 ? '#f56c6c' : p >= 50 ? '#e6a23c' : '#2bb673')

onMounted(async () => {
  sum.value = await http.get('/dashboard/summary')
  if (auth.role === 'STORE' && auth.user?.storeId) {
    balance.value = await http.get(`/stores/${auth.user.storeId}/balance`)
  }
  const chart = echarts.init(trendRef.value!)
  chart.setOption({
    grid: { left: 40, right: 20, top: 20, bottom: 30 },
    xAxis: { type: 'category', data: sum.value.trend.map((t: any) => t.date) },
    yAxis: { type: 'value', minInterval: 1 },
    series: [{
      type: 'bar', data: sum.value.trend.map((t: any) => t.count),
      itemStyle: { color: '#ff6a00', borderRadius: [4, 4, 0, 0] }, barWidth: 22,
    }],
    tooltip: { trigger: 'axis' },
  })
})
</script>

<style scoped>
.quick { display: flex; gap: 10px; flex-wrap: wrap; }
</style>
