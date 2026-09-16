<template>
  <div class="page">
    <div class="page-title">排班缺员与供应商到货</div>
    <div style="display:grid; grid-template-columns: 1fr 1fr; gap:14px; align-items:start">
      <div class="panel">
        <div class="panel-title">
          排班管理
          <el-button size="small" type="primary" style="margin-left:auto" @click="shiftVisible = true">登记排班</el-button>
        </div>
        <el-table :data="shifts" size="small" border>
          <el-table-column prop="date" label="日期" width="110" />
          <el-table-column prop="requiredStaff" label="应到" width="70" align="center" />
          <el-table-column prop="actualStaff" label="实到" width="70" align="center" />
          <el-table-column label="状态" width="90">
            <template #default="{ row }">
              <el-tag v-if="row.actualStaff < row.requiredStaff" type="danger" size="small">
                缺员 {{ row.requiredStaff - row.actualStaff }}
              </el-tag>
              <el-tag v-else type="success" size="small">正常</el-tag>
            </template>
          </el-table-column>
          <el-table-column prop="note" label="备注" min-width="140" show-overflow-tooltip />
        </el-table>
      </div>

      <div class="panel">
        <div class="panel-title">
          供应商到货
          <el-button size="small" type="primary" style="margin-left:auto" @click="deliveryVisible = true">预约到货</el-button>
        </div>
        <el-table :data="deliveries" size="small" border>
          <el-table-column prop="supplierName" label="供应商" min-width="110" />
          <el-table-column label="预计到货" width="150">
            <template #default="{ row }">{{ fmtTime(row.expectedAt) }}</template>
          </el-table-column>
          <el-table-column label="状态" width="90">
            <template #default="{ row }">
              <el-tag size="small" :type="{ SCHEDULED: 'primary', ARRIVED: 'success', DELAYED: 'danger' }[row.status] as any">
                {{ { SCHEDULED: '待到货', ARRIVED: '已到货', DELAYED: '延迟到货' }[row.status] }}
              </el-tag>
            </template>
          </el-table-column>
          <el-table-column prop="note" label="备注" min-width="120" show-overflow-tooltip />
          <el-table-column label="操作" width="100" align="center">
            <template #default="{ row }">
              <el-button v-if="row.status === 'SCHEDULED'" size="small" @click="arrive(row)">登记到货</el-button>
            </template>
          </el-table-column>
        </el-table>
      </div>
    </div>

    <el-dialog v-model="shiftVisible" title="登记排班" width="420px">
      <el-form label-width="90px">
        <el-form-item label="日期">
          <el-date-picker v-model="shiftForm.date" type="date" value-format="YYYY-MM-DD" style="width:100%" />
        </el-form-item>
        <el-form-item label="应到人数">
          <el-input-number v-model="shiftForm.requiredStaff" :min="1" :max="30" />
        </el-form-item>
        <el-form-item label="实到人数">
          <el-input-number v-model="shiftForm.actualStaff" :min="0" :max="30" />
        </el-form-item>
        <el-form-item label="备注">
          <el-input v-model="shiftForm.note" placeholder="如：2 人临时请假" />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="shiftVisible = false">取消</el-button>
        <el-button type="primary" @click="saveShift">保存</el-button>
      </template>
    </el-dialog>

    <el-dialog v-model="deliveryVisible" title="预约供应商到货" width="420px">
      <el-form label-width="90px">
        <el-form-item label="供应商">
          <el-select v-model="deliveryForm.supplierId" style="width:100%">
            <el-option v-for="s in suppliers" :key="s.id" :label="s.name" :value="s.id" />
          </el-select>
        </el-form-item>
        <el-form-item label="预计到货">
          <el-date-picker v-model="deliveryForm.expectedAt" type="datetime" style="width:100%" />
        </el-form-item>
        <el-form-item label="备注">
          <el-input v-model="deliveryForm.note" placeholder="如：便当原料 60 份" />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="deliveryVisible = false">取消</el-button>
        <el-button type="primary" @click="saveDelivery">保存</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<script setup lang="ts">
import { onMounted, reactive, ref } from 'vue'
import { ElMessage } from 'element-plus'
import http from '../api/http'
import { useAuthStore } from '../stores/auth'
import { fmtTime } from '../utils/dict'

const auth = useAuthStore()
const shifts = ref<any[]>([])
const deliveries = ref<any[]>([])
const suppliers = ref<any[]>([])
const shiftVisible = ref(false)
const deliveryVisible = ref(false)
const shiftForm = reactive<any>({ date: new Date().toISOString().slice(0, 10), requiredStaff: 5, actualStaff: 5, note: '' })
const deliveryForm = reactive<any>({ supplierId: null, expectedAt: null, note: '' })

const storeId = auth.user?.storeId

async function load() {
  if (storeId) {
    shifts.value = await http.get(`/stores/${storeId}/shifts`)
  }
  deliveries.value = await http.get('/suppliers/deliveries')
  suppliers.value = await http.get('/suppliers')
}

async function saveShift() {
  await http.post(`/stores/${storeId}/shifts`, { ...shiftForm })
  ElMessage.success('排班已保存')
  shiftVisible.value = false
  load()
}

async function saveDelivery() {
  await http.post('/suppliers/deliveries', { ...deliveryForm })
  ElMessage.success('到货预约已创建')
  deliveryVisible.value = false
  load()
}

async function arrive(row: any) {
  const res: any = await http.post(`/suppliers/deliveries/${row.id}/arrive`)
  ElMessage[res.status === 'DELAYED' ? 'warning' : 'success'](
    res.status === 'DELAYED' ? '已登记到货（延迟，已触发预警）' : '已登记到货',
  )
  load()
}

onMounted(load)
</script>
