<template>
  <div class="page">
    <div class="page-title">配送任务</div>
    <div class="panel">
      <el-table :data="list" size="small" border>
        <el-table-column label="团餐单" width="150">
          <template #default="{ row }">
            <el-link type="primary" @click="$router.push(`/orders/${row.orderId}`)">{{ row.order?.orderNo }}</el-link>
          </template>
        </el-table-column>
        <el-table-column label="取货门店" min-width="140">
          <template #default="{ row }">{{ row.store?.name }}</template>
        </el-table-column>
        <el-table-column label="送达企业" min-width="140">
          <template #default="{ row }">{{ row.enterprise?.name }}</template>
        </el-table-column>
        <el-table-column label="约定送达" width="150">
          <template #default="{ row }">{{ fmtTime(row.order?.deliverAt) }}</template>
        </el-table-column>
        <el-table-column label="加餐/餐标" width="150">
          <template #default="{ row }">
            <el-tag v-if="row.topUpQty" size="small" type="danger" effect="dark">追加 +{{ row.topUpQty }} 份</el-tag>
            <el-tag v-if="row.extraDispatch" size="small" type="warning" effect="plain" style="margin-left:4px">加派骑手</el-tag>
            <el-tooltip v-if="row.specialLabels?.length" placement="left" :show-after="200">
              <template #content>
                <div v-for="l in row.specialLabels" :key="l.labelCode" style="line-height:1.7">
                  {{ l.labelCode }} · {{ l.name }} · {{ l.tag }}
                </div>
              </template>
              <el-tag size="small" type="danger" effect="plain" style="margin-left:4px">
                特殊餐标 {{ row.specialLabels.length }}
              </el-tag>
            </el-tooltip>
            <span v-if="!row.topUpQty && !row.specialLabels?.length" class="muted">-</span>
          </template>
        </el-table-column>
        <el-table-column label="保温箱" width="100">
          <template #default="{ row }">{{ row.thermalBoxNo || '-' }}</template>
        </el-table-column>
        <el-table-column label="状态" width="100">
          <template #default="{ row }">
            <el-tag :type="DELIVERY_STATUS[row.status]?.type as any" size="small">
              {{ DELIVERY_STATUS[row.status]?.name }}
            </el-tag>
            <el-tag v-if="row.late" type="danger" size="small" style="margin-left:4px">迟到</el-tag>
          </template>
        </el-table-column>
        <el-table-column label="操作" width="240" align="center">
          <template #default="{ row }">
            <el-button v-if="['ASSIGNED', 'PENDING'].includes(row.status)" size="small" type="primary"
              @click="openOutbound(row)">出库登记</el-button>
            <el-button v-if="row.status === 'OUTBOUND'" size="small" type="warning"
              @click="pickup(row)">门店取货</el-button>
            <el-button v-if="row.status === 'PICKED'" size="small" type="success"
              @click="deliver(row)">确认送达</el-button>
          </template>
        </el-table-column>
      </el-table>
    </div>

    <el-dialog v-model="outboundVisible" title="出库登记" width="420px">
      <el-form label-width="90px">
        <el-form-item label="保温箱号">
          <el-input v-model="outboundForm.thermalBoxNo" placeholder="如 BX-1024" />
        </el-form-item>
        <el-form-item label="配送路线">
          <el-input v-model="outboundForm.route" placeholder="如 中心旗舰店 → 建国路 SOHO" />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="outboundVisible = false">取消</el-button>
        <el-button type="primary" @click="outbound">确认出库</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<script setup lang="ts">
import { onMounted, reactive, ref } from 'vue'
import { ElMessage } from 'element-plus'
import http from '../api/http'
import { DELIVERY_STATUS, fmtTime } from '../utils/dict'

const list = ref<any[]>([])
const outboundVisible = ref(false)
const current = ref<any>(null)
const outboundForm = reactive<any>({ thermalBoxNo: '', route: '' })

async function load() {
  list.value = await http.get('/deliveries')
}

function openOutbound(row: any) {
  current.value = row
  outboundForm.thermalBoxNo = `BX-${1000 + row.id}`
  outboundForm.route = `${row.store?.name || ''} → ${row.enterprise?.name || ''}`
  outboundVisible.value = true
}

async function outbound() {
  await http.post(`/deliveries/${current.value.id}/outbound`, { ...outboundForm })
  ElMessage.success('已出库')
  outboundVisible.value = false
  load()
}

async function pickup(row: any) {
  await http.post(`/deliveries/${row.id}/pickup`)
  ElMessage.success('已取货，开始配送')
  load()
}

async function deliver(row: any) {
  await http.post(`/deliveries/${row.id}/deliver`)
  ElMessage.success('已送达，等待企业签收')
  load()
}

onMounted(load)
</script>
