<template>
  <div class="page">
    <div class="page-title">
      餐食变质售后
      <el-button size="small" style="margin-left:12px" @click="load">刷新</el-button>
      <el-tag type="danger" effect="dark" style="margin-left:8px">食安 · 同批次下架</el-tag>
    </div>

    <div class="panel">
      <div style="display:flex; gap:10px; margin-bottom:12px">
        <el-select v-model="status" placeholder="全部状态" clearable style="width:150px" @change="loadList">
          <el-option v-for="(v,k) in SPOILED_STATUS" :key="k" :label="v.name" :value="k" />
        </el-select>
        <el-input v-model="kw" placeholder="售后单号/团餐单号" clearable style="width:220px" @change="loadList" />
        <el-button @click="loadList">查询</el-button>
      </div>
      <el-table :data="list" size="small" border @row-click="(r:any)=>open(r.id)" style="cursor:pointer">
        <el-table-column prop="reportNo" label="售后单号" width="140" class-name="mono" />
        <el-table-column prop="orderNo" label="团餐单" width="150" class-name="mono" />
        <el-table-column label="问题" min-width="180">
          <template #default="{ row }">
            <el-tag size="small" type="danger" effect="plain">{{ SPOILED_ISSUE[row.issueType] }}</el-tag>
            <span style="margin-left:6px">{{ row.items.map((i:any)=>`${i.name}×${i.qty}`).join('，') }}</span>
          </template>
        </el-table-column>
        <el-table-column label="退款" width="130">
          <template #default="{ row }">
            <el-tag size="small" :type="REFUND_STATUS[row.refundStatus]?.type as any">
              {{ row.refundStatus === 'NONE' ? '—' : `¥${row.refundAmount} ${REFUND_STATUS[row.refundStatus]?.name}` }}
            </el-tag>
          </template>
        </el-table-column>
        <el-table-column label="补送" width="90">
          <template #default="{ row }">
            <el-tag size="small" :type="row.redeliveryId ? 'warning' : 'info'">{{ row.redeliveryId ? '已发起' : '—' }}</el-tag>
          </template>
        </el-table-column>
        <el-table-column label="状态" width="100">
          <template #default="{ row }">
            <el-tag size="small" :type="SPOILED_STATUS[row.status]?.type as any">{{ SPOILED_STATUS[row.status]?.name }}</el-tag>
          </template>
        </el-table-column>
        <el-table-column label="提交时间" width="150">
          <template #default="{ row }">{{ fmtTime(row.createdAt) }}</template>
        </el-table-column>
      </el-table>
    </div>

    <!-- 售后详情 -->
    <el-dialog v-model="visible" title="餐食变质售后单" width="860px" top="5vh">
      <div v-if="detail">
        <div style="display:flex; align-items:center; gap:10px; margin-bottom:10px">
          <b class="mono">{{ detail.reportNo }}</b>
          <el-tag :type="SPOILED_STATUS[detail.status]?.type as any">{{ SPOILED_STATUS[detail.status]?.name }}</el-tag>
          <el-link type="primary" @click="$router.push(`/orders/${detail.orderId}`)">团餐单 {{ detail.order?.orderNo }}</el-link>
          <span style="margin-left:auto" class="muted">提交 {{ fmtTime(detail.createdAt) }}</span>
        </div>

        <!-- 收集信息 -->
        <el-descriptions :column="3" border size="small" title="问题商品与批次">
          <el-descriptions-item v-for="i in detail.items" :key="i.productId" :label="`${i.name} ×${i.qty}`" :span="3">
            <el-tag size="small" type="danger" effect="plain">{{ SPOILED_ISSUE[i.issueType] }}</el-tag>
            <span style="margin-left:8px" class="mono">批次 {{ i.batchNo }}</span>
            <span class="muted" style="margin-left:8px">单价 ¥{{ i.unitPrice }}</span>
          </el-descriptions-item>
        </el-descriptions>
        <el-descriptions :column="2" border size="small" style="margin-top:8px">
          <el-descriptions-item label="签收时间">{{ fmtTime(detail.deliveredAt) }}</el-descriptions-item>
          <el-descriptions-item label="食用人数">{{ detail.diners?.length || 0 }} 人</el-descriptions-item>
          <el-descriptions-item label="问题描述" :span="2">{{ detail.description || '—' }}</el-descriptions-item>
        </el-descriptions>

        <!-- 临期调拨识别：企业已确认的临期份不认定为质量问题 -->
        <div class="subblock" v-if="detail.nearExpiryMatch?.matched?.length">
          <el-alert :type="detail.nearExpiryMatch.tempFailure ? 'error' : 'warning'" :closable="false" show-icon
            :title="`临期调拨识别：${detail.nearExpiryMatch.matched.reduce((s:number,m:any)=>s+m.qty,0)} 份命中企业已确认方案 ${detail.nearExpiryMatch.offerNo}`"
            :description="detail.nearExpiryMatch.note" style="margin-bottom:8px" />
          <el-table :data="detail.nearExpiryMatch.matched" size="small" border>
            <el-table-column prop="name" label="商品" min-width="130" />
            <el-table-column prop="batchNo" label="批次" width="110" class-name="mono" />
            <el-table-column prop="qty" label="数量" width="60" align="center" />
            <el-table-column label="份标签码" min-width="200">
              <template #default="{ row }">
                <el-tag v-for="c in row.labelCodes" :key="c" size="small" type="warning" effect="dark" style="margin:2px">{{ c }}</el-tag>
              </template>
            </el-table-column>
            <el-table-column label="售后规则" min-width="240" show-overflow-tooltip>
              <template #default="{ row }"><span class="muted">{{ row.afterSalesRule }}</span></template>
            </el-table-column>
          </el-table>
        </div>

        <div class="subblock">
          <div class="sub-title">温控照片凭证（{{ detail.photos?.length || 0 }}）</div>
          <div v-if="detail.photos?.length" style="display:flex; gap:10px; flex-wrap:wrap">
            <div v-for="(p,i) in detail.photos" :key="i" class="photo-card">
              <div class="photo-thumb">📷</div>
              <div class="photo-name">{{ p.fileName }}</div>
              <div class="muted" style="font-size:12px">
                表面 {{ p.surfaceTemp ?? '—' }}℃ / 中心 {{ p.coreTemp ?? '—' }}℃
              </div>
              <div class="muted" style="font-size:12px">{{ p.note }}</div>
            </div>
          </div>
          <span v-else class="muted">无</span>
        </div>

        <div class="subblock">
          <div class="sub-title">食用人员（{{ detail.diners?.length || 0 }} 人）</div>
          <el-table :data="detail.diners" size="small" border>
            <el-table-column prop="name" label="姓名" width="120" />
            <el-table-column prop="phone" label="联系电话" width="150" />
            <el-table-column prop="symptom" label="症状/情况" />
          </el-table>
        </div>

        <!-- 处置：退款 -->
        <div class="subblock">
          <div class="sub-title">批量退款</div>
          <div style="display:flex; align-items:center; gap:10px">
            <el-tag :type="REFUND_STATUS[detail.refundStatus]?.type as any">{{ REFUND_STATUS[detail.refundStatus]?.name }}</el-tag>
            <span v-if="detail.refundStatus !== 'NONE'">¥{{ detail.refundAmount }}（{{ detail.refundMultiplier }} 倍食安赔付）</span>
            <template v-if="isService && detail.refundStatus === 'NONE'">
              <el-input-number v-model="refundMultiplier" :min="1" :max="5" :step="0.5" size="small" />
              <el-button size="small" type="warning" @click="proposeRefund">提出批量退款</el-button>
            </template>
            <el-button v-if="isFinance && detail.refundStatus === 'PROPOSED'" size="small" type="primary" @click="confirmRefund">
              财务确认退款 ¥{{ detail.refundAmount }}
            </el-button>
          </div>
        </div>

        <!-- 处置：补送 -->
        <div class="subblock">
          <div class="sub-title">补送</div>
          <div v-if="detail.redelivery">
            <el-descriptions :column="3" border size="small">
              <el-descriptions-item label="补送单" class-name="mono">{{ detail.redelivery.redeliveryNo }}</el-descriptions-item>
              <el-descriptions-item label="状态">
                <el-tag size="small" :type="REDELIVERY_STATUS[detail.redelivery.status]?.type as any">
                  {{ REDELIVERY_STATUS[detail.redelivery.status]?.name }}
                </el-tag>
              </el-descriptions-item>
              <el-descriptions-item label="骑手">{{ detail.redelivery.courierName || '待指派' }}</el-descriptions-item>
              <el-descriptions-item label="商品" :span="3">
                {{ detail.redelivery.items.map((i:any)=>`${i.name}×${i.quantity}`).join('，') }}
              </el-descriptions-item>
              <el-descriptions-item label="送达时间" :span="2">{{ fmtTime(detail.redelivery.deliveredAt) }}</el-descriptions-item>
              <el-descriptions-item label="签收人">{{ detail.redelivery.receivedBy || '—' }}</el-descriptions-item>
            </el-descriptions>
          </div>
          <el-button v-else-if="isService" size="small" type="primary" @click="createRedelivery">按问题数量发起补送</el-button>
          <span v-else class="muted">未发起补送</span>
        </div>

        <!-- 处置：同批次下架 -->
        <div class="subblock">
          <div class="sub-title">同批次下架（扫描全门店在架库存与未配送团餐）</div>
          <div v-if="detail.recalls?.length">
            <div v-for="rc in detail.recalls" :key="rc.id" class="recall-card">
              <div class="recall-head">
                <b class="mono">{{ rc.recallNo }}</b>
                <el-tag size="small" :type="RECALL_STATUS[rc.status]?.type as any">{{ RECALL_STATUS[rc.status]?.name }}</el-tag>
                <span>{{ rc.productName }} · 批次 {{ rc.batchNo }}</span>
                <span class="muted">在架 {{ rc.totalStockQty }} 份 / 未配送团餐 {{ rc.totalUndeliveredQty }} 份</span>
                <span style="margin-left:auto">进度 {{ rc.taskDone }}/{{ rc.taskTotal }}</span>
              </div>
              <el-table :data="rc.tasks" size="small" border style="margin-top:6px" :row-class-name="taskRowClass">
                <el-table-column prop="storeName" label="门店" min-width="140" />
                <el-table-column prop="stockQty" label="在架下架" width="90" align="center" />
                <el-table-column label="未配送拦截" width="180">
                  <template #default="{ row }">
                    <span v-if="!row.undelivered?.length" class="muted">无</span>
                    <el-tooltip v-else placement="left" :show-after="100">
                      <template #content>
                        <div v-for="u in row.undelivered" :key="u.orderId">{{ u.orderNo }}：{{ u.qty }} 份，{{ fmtTime(u.deliverAt) }} 送达</div>
                      </template>
                      <el-tag size="small" type="danger">{{ row.undelivered.reduce((s:number,u:any)=>s+u.qty,0) }} 份（{{ row.undelivered.length }} 单，悬停）</el-tag>
                    </el-tooltip>
                  </template>
                </el-table-column>
                <el-table-column label="截止时间" width="150">
                  <template #default="{ row }">
                    <span :class="isOverdue(row) && row.status==='PENDING' ? 'danger-text' : ''">{{ fmtTime(row.dueAt) }}</span>
                    <el-tag v-if="isOverdue(row) && row.status==='PENDING'" size="small" type="danger" effect="dark" style="margin-left:4px">超时</el-tag>
                  </template>
                </el-table-column>
                <el-table-column prop="responsibleShift" label="责任班次" width="150" />
                <el-table-column prop="reviewerName" label="复核人" width="100" />
                <el-table-column label="状态/催办" width="150">
                  <template #default="{ row }">
                    <el-tag v-if="row.status==='DONE'" size="small" type="success">已下架 {{ row.disposedQty }}</el-tag>
                    <template v-else>
                      <el-tag size="small" type="danger">待处理</el-tag>
                      <el-button v-if="isAdmin || isService" size="small" link type="warning" @click.stop="remind(row)">
                        催办{{ row.remindCount ? `(${row.remindCount})` : '' }}
                      </el-button>
                    </template>
                  </template>
                </el-table-column>
                <el-table-column prop="handleNote" label="处理备注" min-width="120" show-overflow-tooltip />
              </el-table>
              <div style="margin-top:6px; display:flex; gap:10px; align-items:center">
                <el-button v-if="isAdmin && rc.status==='ALL_DONE'" size="small" type="success" @click="reviewRecall(rc)">复核关闭召回</el-button>
                <el-button v-if="isAdmin && rc.status==='PARTIAL_DONE'" size="small" disabled>等待剩余门店处理</el-button>
                <span v-if="rc.status==='CLOSED'" class="ok-text">运营复核：{{ rc.reviewerName }} · {{ rc.reviewNote }} · {{ fmtTime(rc.reviewedAt) }}</span>
              </div>
            </div>
          </div>
          <el-button v-if="isService && !detail.recalls?.length" size="small" type="danger" @click="triggerRecall">
            触发同批次下架
          </el-button>
          <span v-else-if="!detail.recalls?.length" class="muted">尚未触发</span>
        </div>

        <!-- 协同时间线 -->
        <div class="subblock">
          <div class="sub-title">协同记录</div>
          <el-timeline>
            <el-timeline-item v-for="l in detail.logs" :key="l.id" :timestamp="fmtTime(l.createdAt)" placement="top" size="small">
              <el-tag size="small" effect="plain">{{ l.actorRole }} · {{ l.actorName }}</el-tag>
              <span style="margin-left:6px">{{ l.note }}</span>
            </el-timeline-item>
          </el-timeline>
        </div>
      </div>

      <template #footer>
        <el-button v-if="isService && detail && detail.status!=='RESOLVED'" type="success" @click="resolve">办结售后</el-button>
        <el-button @click="visible=false">关闭</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { useRoute } from 'vue-router'
import { ElMessage, ElMessageBox } from 'element-plus'
import http from '../api/http'
import { useAuthStore } from '../stores/auth'
import {
  SPOILED_STATUS, SPOILED_ISSUE, REFUND_STATUS, RECALL_STATUS,
  REDELIVERY_STATUS, fmtTime,
} from '../utils/dict'

const route = useRoute()

const auth = useAuthStore()
const list = ref<any[]>([])
const status = ref('')
const kw = ref('')
const visible = ref(false)
const detail = ref<any>(null)
const refundMultiplier = ref(2)

const isService = computed(() => ['SERVICE', 'ADMIN'].includes(auth.role))
const isFinance = computed(() => ['FINANCE', 'ADMIN'].includes(auth.role))
const isAdmin = computed(() => auth.role === 'ADMIN')

function isOverdue(row: any) {
  return new Date(row.dueAt).getTime() < Date.now()
}
function taskRowClass({ row }: any) {
  return row.status === 'PENDING' && isOverdue(row) ? 'overdue-row' : ''
}

async function loadList() {
  const params: any = {}
  if (status.value) params.status = status.value
  list.value = await http.get('/spoiled/reports', { params })
  if (kw.value) {
    list.value = list.value.filter((r: any) => r.reportNo.includes(kw.value) || r.orderNo?.includes(kw.value))
  }
}

async function open(id: number) {
  detail.value = await http.get(`/spoiled/reports/${id}`)
  refundMultiplier.value = detail.value.refundMultiplier || 2
  visible.value = true
}

async function proposeRefund() {
  await http.post(`/spoiled/reports/${detail.value.id}/refund-propose`, { multiplier: refundMultiplier.value })
  ElMessage.success('已提出批量退款，等待财务确认')
  await open(detail.value.id); loadList()
}
async function confirmRefund() {
  await http.post(`/spoiled/reports/${detail.value.id}/refund-confirm`)
  ElMessage.success('退款已确认并计入交付档案')
  await open(detail.value.id); loadList()
}
async function createRedelivery() {
  await ElMessageBox.confirm('按问题商品同数量发起补送？门店将立即用新鲜批次备货', '发起补送', { type: 'warning' })
  await http.post(`/spoiled/reports/${detail.value.id}/redelivery`, {})
  ElMessage.success('补送单已生成，门店已收到备货通知')
  await open(detail.value.id)
}
async function triggerRecall() {
  await ElMessageBox.confirm('将扫描全部门店同批次在架库存与未配送团餐，并逐店生成含截止时间/责任班次/复核人的下架任务', '同批次下架', { type: 'warning' })
  await http.post(`/spoiled/reports/${detail.value.id}/recall`)
  ElMessage.success('同批次下架任务已下发各门店')
  await open(detail.value.id); loadList()
}
async function remind(row: any) {
  await http.post(`/spoiled/tasks/${row.id}/remind`)
  ElMessage.success('已催办该门店')
  await open(detail.value.id)
}
async function reviewRecall(rc: any) {
  const { value } = await ElMessageBox.prompt('复核意见', '运营复核关闭', {
    confirmButtonText: '复核关闭', inputValue: '复核通过：同批次商品全部下架，未配送团餐已拦截',
  }).catch(() => ({ value: null }))
  if (value === null) return
  await http.post(`/spoiled/recalls/${rc.id}/review`, { note: value })
  ElMessage.success('召回单已复核关闭')
  await open(detail.value.id); loadList()
}
async function resolve() {
  const { value } = await ElMessageBox.prompt('办结说明', '办结售后', {
    confirmButtonText: '办结', inputValue: '退款/补送/同批次下架均已完成',
  }).catch(() => ({ value: null }))
  if (value === null) return
  await http.post(`/spoiled/reports/${detail.value.id}/resolve`, { note: value })
  ElMessage.success('售后已办结')
  visible.value = false
  loadList()
}

onMounted(async () => {
  await loadList()
  if (route.query.focus) await open(+route.query.focus)
})
</script>

<style scoped>
.subblock { margin-top: 14px; }
.sub-title { font-weight: 600; font-size: 13px; margin-bottom: 6px; }
.photo-card { width: 200px; border: 1px solid #ebeef5; border-radius: 8px; padding: 8px; }
.photo-thumb { font-size: 30px; text-align: center; background: #f7f8fa; border-radius: 6px; padding: 10px; }
.photo-name { font-size: 12px; font-weight: 600; margin: 4px 0 2px; word-break: break-all; }
.recall-card { border: 1px solid #fbc4c4; background: #fef6f6; border-radius: 8px; padding: 10px; margin-bottom: 10px; }
.recall-head { display: flex; align-items: center; gap: 8px; font-size: 13px; flex-wrap: wrap; }
</style>
<style>
.overdue-row { background: #fef0f0 !important; }
</style>
