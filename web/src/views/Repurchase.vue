<template>
  <div class="page">
    <div class="page-title">复购助手 · 历史履约与偏好分析</div>

    <div class="card-grid">
      <div class="stat-card">
        <div class="label">历史准点率</div>
        <div class="value" :class="stats.onTimeRate >= 90 ? 'ok-text' : 'warn-text'">{{ stats.onTimeRate }}%</div>
        <div class="sub">共 {{ stats.totalOrders }} 次团餐</div>
      </div>
      <div class="stat-card">
        <div class="label">售后次数</div>
        <div class="value" :class="{ 'warn-text': stats.afterSales > 0 }">{{ stats.afterSales }}</div>
        <div class="sub">进行中工单 {{ stats.openIncidents }} 个</div>
      </div>
      <div class="stat-card">
        <div class="label">发票错误</div>
        <div class="value" :class="{ 'danger-text': stats.invoiceErrors > 0 }">{{ stats.invoiceErrors }}</div>
        <div class="sub">累计赔付 {{ fmtMoney(stats.compensation) }}</div>
      </div>
      <div class="stat-card">
        <div class="label">平均评分</div>
        <div class="value">{{ stats.avgRating }}</div>
        <div class="sub">累计消费 {{ fmtMoney(stats.totalSpend) }}</div>
      </div>
      <div class="stat-card">
        <div class="label">临期鲜食消化</div>
        <div class="value ok-text">{{ stats.nearExpiryUsed }}</div>
        <div class="sub">份 · 绿色节约</div>
      </div>
    </div>

    <div style="display:grid; grid-template-columns: 1fr 1.2fr; gap:14px; margin-top:14px">
      <div class="panel">
        <div class="panel-title">餐食偏好（按历史订购份数）</div>
        <div ref="pieRef" style="height:280px"></div>
        <el-alert v-if="prefNote" type="success" :closable="false" show-icon :title="prefNote" />
      </div>
      <div class="panel">
        <div class="panel-title">历史团餐（点击可复购）</div>
        <el-table :data="archives" size="small" border max-height="360">
          <el-table-column label="送达时间" width="140">
            <template #default="{ row }">{{ fmtTime(row.deliveredAt) }}</template>
          </el-table-column>
          <el-table-column label="场景" width="80">
            <template #default="{ row }">{{ OCCASIONS[row.order?.occasion] }}</template>
          </el-table-column>
          <el-table-column prop="actualHeadcount" label="人数" width="60" align="center" />
          <el-table-column label="准点" width="60" align="center">
            <template #default="{ row }">
              <span :class="row.onTime ? 'ok-text' : 'danger-text'">{{ row.onTime ? '✓' : '✗' }}</span>
            </template>
          </el-table-column>
          <el-table-column label="评分" width="70" align="center">
            <template #default="{ row }">{{ row.rating }}分</template>
          </el-table-column>
          <el-table-column label="操作" width="110" align="center">
            <template #default="{ row }">
              <el-button size="small" type="primary" plain @click="reorder(row)">再次预订</el-button>
            </template>
          </el-table-column>
        </el-table>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { useRouter } from 'vue-router'
import * as echarts from 'echarts'
import http from '../api/http'
import { useAuthStore } from '../stores/auth'
import { CATEGORIES, OCCASIONS, fmtTime, fmtMoney } from '../utils/dict'

const auth = useAuthStore()
const router = useRouter()
const stats = ref<any>({})
const archives = ref<any[]>([])
const pieRef = ref<HTMLElement>()

const prefNote = computed(() => {
  const top = stats.value.categoryPreference?.[0]
  if (!top) return ''
  return `企业最常订「${CATEGORIES[top.category]}」，下一次团餐平台将优先按此偏好搭配套餐`
})

function reorder(row: any) {
  router.push(`/orders/new?from=${row.orderId}`)
}

onMounted(async () => {
  const eid = auth.user?.enterpriseId
  stats.value = await http.get(`/enterprises/${eid}/stats`)
  archives.value = await http.get('/archives')
  const chart = echarts.init(pieRef.value!)
  chart.setOption({
    tooltip: { trigger: 'item' },
    legend: { bottom: 0 },
    series: [{
      type: 'pie', radius: ['40%', '68%'], center: ['50%', '44%'],
      data: stats.value.categoryPreference.map((c: any) => ({
        name: CATEGORIES[c.category] || c.category, value: c.count,
      })),
      label: { formatter: '{b} {c}份' },
    }],
  })
})
</script>
