<template>
  <div class="page">
    <div class="page-title">
      食安售后任务
      <el-button size="small" style="margin-left:12px" @click="load">刷新</el-button>
      <el-tag v-if="pendingCount" type="danger" effect="dark" style="margin-left:8px">{{ pendingCount }} 个下架任务待处理</el-tag>
    </div>

    <el-alert type="error" :closable="false" show-icon
      title="同批次商品被反馈变质：请在截止时间前完成在架商品下架报损，并拦截/更换未配送团餐；逾期未处理将被运营催办并记录责任班次。"
      style="margin-bottom:12px" />

    <div class="panel" v-if="tasks.length">
      <div class="panel-title">同批次下架任务</div>
      <el-table :data="tasks" size="small" border :row-class-name="rowClass">
        <el-table-column label="召回单/商品" min-width="200">
          <template #default="{ row }">
            <div class="mono">{{ row.recall?.recallNo }}</div>
            <div>{{ row.recall?.productName }} · 批次 {{ row.recall?.batchNo }}</div>
          </template>
        </el-table-column>
        <el-table-column label="在架下架" width="90" align="center">
          <template #default="{ row }"><b class="danger-text">{{ row.stockQty }}</b> 份</template>
        </el-table-column>
        <el-table-column label="未配送团餐" width="170">
          <template #default="{ row }">
            <span v-if="!row.undelivered?.length" class="muted">无</span>
            <el-tooltip v-else placement="left" :show-after="100">
              <template #content>
                <div v-for="u in row.undelivered" :key="u.orderId">{{ u.orderNo }}：{{ u.qty }} 份，{{ fmtTime(u.deliverAt) }} 送达</div>
              </template>
              <el-tag size="small" type="danger">拦截 {{ row.undelivered.reduce((s:number,u:any)=>s+u.qty,0) }} 份（{{ row.undelivered.length }} 单）</el-tag>
            </el-tooltip>
          </template>
        </el-table-column>
        <el-table-column label="处理截止" width="150">
          <template #default="{ row }">
            <span :class="isOverdue(row) && row.status==='PENDING' ? 'danger-text' : ''">{{ fmtTime(row.dueAt) }}</span>
            <el-tag v-if="isOverdue(row) && row.status==='PENDING'" size="small" type="danger" effect="dark" style="margin-left:4px">超时 {{ overdueMin(row) }}分</el-tag>
          </template>
        </el-table-column>
        <el-table-column prop="responsibleShift" label="责任班次" width="150" />
        <el-table-column prop="reviewerName" label="运营复核人" width="100" />
        <el-table-column label="操作" width="150" align="center">
          <template #default="{ row }">
            <el-button v-if="row.status==='PENDING'" size="small" type="danger" @click="openHandle(row)">下架并拦截</el-button>
            <div v-else>
              <el-tag size="small" type="success">已处理</el-tag>
              <div class="muted" style="font-size:12px">报损 {{ row.disposedQty }} / 拦截 {{ row.heldOrderQty }}</div>
            </div>
          </template>
        </el-table-column>
      </el-table>
    </div>
    <div class="panel muted" v-else style="padding:24px; text-align:center">暂无同批次下架任务</div>

    <div class="panel" style="margin-top:14px">
      <div class="panel-title">变质餐食补送备货</div>
      <el-table :data="redeliveries" size="small" border>
        <el-table-column prop="redeliveryNo" label="补送单" width="140" class-name="mono" />
        <el-table-column label="补送商品" min-width="200">
          <template #default="{ row }">{{ row.items.map((i:any)=>`${i.name}×${i.quantity}`).join('，') }}</template>
        </el-table-column>
        <el-table-column label="状态" width="120">
          <template #default="{ row }">
            <el-tag size="small" :type="REDELIVERY_STATUS[row.status]?.type as any">{{ REDELIVERY_STATUS[row.status]?.name }}</el-tag>
          </template>
        </el-table-column>
        <el-table-column label="操作" width="160" align="center">
          <template #default="{ row }">
            <el-button v-if="row.status==='PENDING'" size="small" type="primary" @click="rdReady(row)">新鲜批次备货完成</el-button>
            <span v-else class="muted">已通知骑手取货</span>
          </template>
        </el-table-column>
      </el-table>
      <div v-if="!redeliveries.length" class="muted" style="padding:16px; text-align:center">暂无待备货补送单</div>
    </div>

    <el-dialog v-model="handleVisible" title="同批次下架处理" width="480px">
      <div v-if="current">
        <el-alert type="warning" :closable="false" show-icon
          :title="`确认将 ${current.stockQty} 份在架同批次商品下架报损，并拦截 ${current.undelivered.reduce((s:number,u:any)=>s+u.qty,0)} 份未配送团餐（更换批次/改餐）`"
          style="margin-bottom:12px" />
        <el-form label-width="110px">
          <el-form-item label="实际报损数量">
            <el-input-number v-model="form.disposedQty" :min="0" :max="current.stockQty" />
          </el-form-item>
          <el-form-item label="拦截团餐份数">
            <el-input-number v-model="form.heldOrderQty" :min="0" />
          </el-form-item>
          <el-form-item label="处理备注">
            <el-input v-model="form.note" type="textarea" :rows="2"
              placeholder="如：同批次 12 份已下架报损，2 张未配送团餐已更换当日新鲜批次" />
          </el-form-item>
        </el-form>
      </div>
      <template #footer>
        <el-button @click="handleVisible=false">取消</el-button>
        <el-button type="danger" @click="submitHandle">确认下架并提交复核</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, reactive, ref } from 'vue'
import { ElMessage } from 'element-plus'
import http from '../api/http'
import { REDELIVERY_STATUS, fmtTime } from '../utils/dict'

const tasks = ref<any[]>([])
const redeliveries = ref<any[]>([])
const handleVisible = ref(false)
const current = ref<any>(null)
const form = reactive<any>({ disposedQty: 0, heldOrderQty: 0, note: '' })

const pendingCount = computed(() => tasks.value.filter(t => t.status === 'PENDING').length)

function isOverdue(row: any) { return new Date(row.dueAt).getTime() < Date.now() }
function overdueMin(row: any) { return Math.max(1, Math.round((Date.now() - new Date(row.dueAt).getTime()) / 60000)) }
function rowClass({ row }: any) {
  return row.status === 'PENDING' && isOverdue(row) ? 'overdue-row' : ''
}

async function load() {
  const d = await http.get('/spoiled/store-desk')
  tasks.value = d.tasks
  redeliveries.value = d.redeliveries
}
function openHandle(row: any) {
  current.value = row
  form.disposedQty = row.stockQty
  form.heldOrderQty = row.undelivered.reduce((s: number, u: any) => s + u.qty, 0)
  form.note = '同批次商品已全部下架报损，未配送团餐已拦截更换新鲜批次'
  handleVisible.value = true
}
async function submitHandle() {
  await http.post(`/spoiled/tasks/${current.value.id}/handle`, { ...form })
  ElMessage.success('已完成下架处理，等待运营复核')
  handleVisible.value = false
  load()
}
async function rdReady(row: any) {
  await http.post(`/spoiled/redeliveries/${row.id}/ready`)
  ElMessage.success('补送商品已备货，骑手已收到取货通知')
  load()
}
onMounted(load)
</script>

<style>
.overdue-row { background: #fef0f0 !important; }
</style>
