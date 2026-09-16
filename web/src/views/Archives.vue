<template>
  <div class="page">
    <div class="page-title">交付档案</div>
    <div class="panel">
      <el-table :data="list" size="small" border>
        <el-table-column label="团餐单" width="150">
          <template #default="{ row }">
            <el-link type="primary" @click="$router.push(`/orders/${row.orderId}`)">{{ row.order?.orderNo }}</el-link>
          </template>
        </el-table-column>
        <el-table-column v-if="auth.role !== 'ENTERPRISE'" prop="enterpriseName" label="企业" min-width="130" />
        <el-table-column prop="storeName" label="供餐门店" min-width="130" />
        <el-table-column label="送达时间" width="150">
          <template #default="{ row }">{{ fmtTime(row.deliveredAt) }}</template>
        </el-table-column>
        <el-table-column label="实际消费" width="110" align="right">
          <template #default="{ row }">{{ fmtMoney(row.actualAmount) }}</template>
        </el-table-column>
        <el-table-column label="准点" width="70" align="center">
          <template #default="{ row }">
            <el-tag size="small" :type="row.onTime ? 'success' : 'danger'">{{ row.onTime ? '准点' : '迟到' }}</el-tag>
          </template>
        </el-table-column>
        <el-table-column prop="returnCount" label="退货" width="70" align="center" />
        <el-table-column prop="nearExpiryUsed" label="临期消化" width="90" align="center" />
        <el-table-column label="赔付" width="100" align="right">
          <template #default="{ row }">{{ fmtMoney(row.compensation) }}</template>
        </el-table-column>
        <el-table-column prop="incidentCount" label="售后" width="70" align="center" />
        <el-table-column prop="invoiceErrors" label="发票错" width="80" align="center" />
        <el-table-column label="复购" width="80" align="center">
          <template #default="{ row }">
            <el-tag v-if="row.repurchased" size="small" type="success">已复购</el-tag>
            <span v-else class="muted">-</span>
          </template>
        </el-table-column>
        <el-table-column label="评分" width="70" align="center">
          <template #default="{ row }">{{ row.rating }}分</template>
        </el-table-column>
      </el-table>
    </div>
  </div>
</template>

<script setup lang="ts">
import { onMounted, ref } from 'vue'
import http from '../api/http'
import { useAuthStore } from '../stores/auth'
import { fmtTime, fmtMoney } from '../utils/dict'

const auth = useAuthStore()
const list = ref<any[]>([])

onMounted(async () => {
  list.value = await http.get('/archives')
})
</script>
