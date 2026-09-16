<template>
  <div class="page">
    <div class="page-title">{{ auth.role === 'ENTERPRISE' ? '我的团餐订单' : '团餐订单' }}</div>
    <div class="panel">
      <div style="display:flex; gap:10px; margin-bottom:12px">
        <el-select v-model="status" placeholder="全部状态" clearable style="width:160px" @change="load">
          <el-option v-for="(v, k) in ORDER_STATUS" :key="k" :label="v.name" :value="k" />
        </el-select>
        <el-checkbox v-model="onlyException" @change="load">只看异常单</el-checkbox>
        <el-button type="primary" v-if="auth.role === 'ENTERPRISE'" style="margin-left:auto"
          @click="$router.push('/orders/new')">发起团餐</el-button>
      </div>
      <el-table :data="orders" border stripe @row-click="(r: any) => $router.push(`/orders/${r.id}`)" style="cursor:pointer">
        <el-table-column prop="orderNo" label="团餐单号" width="150" class-name="mono" />
        <el-table-column v-if="auth.role !== 'ENTERPRISE'" prop="enterpriseName" label="企业" min-width="140" />
        <el-table-column label="场景" width="90">
          <template #default="{ row }">{{ OCCASIONS[row.occasion] }}</template>
        </el-table-column>
        <el-table-column prop="headcount" label="人数" width="70" align="center" />
        <el-table-column label="送达时间" width="150">
          <template #default="{ row }">{{ fmtTime(row.deliverAt) }}</template>
        </el-table-column>
        <el-table-column label="金额" width="110" align="right">
          <template #default="{ row }">{{ fmtMoney(row.totalAmount) }}</template>
        </el-table-column>
        <el-table-column label="状态" width="110">
          <template #default="{ row }">
            <el-tag :type="ORDER_STATUS[row.status]?.type as any">{{ ORDER_STATUS[row.status]?.name }}</el-tag>
            <el-tag v-if="row.hasException" type="danger" size="small" style="margin-left:4px">异常</el-tag>
          </template>
        </el-table-column>
        <el-table-column label="创建时间" width="150">
          <template #default="{ row }">{{ fmtTime(row.createdAt) }}</template>
        </el-table-column>
      </el-table>
    </div>
  </div>
</template>

<script setup lang="ts">
import { onMounted, ref } from 'vue'
import http from '../api/http'
import { useAuthStore } from '../stores/auth'
import { ORDER_STATUS, OCCASIONS, fmtTime, fmtMoney } from '../utils/dict'

const auth = useAuthStore()
const orders = ref<any[]>([])
const status = ref('')
const onlyException = ref(false)

async function load() {
  const params: any = {}
  if (status.value) params.status = status.value
  if (onlyException.value) params.exception = '1'
  orders.value = await http.get('/orders', { params })
}
onMounted(load)
</script>
