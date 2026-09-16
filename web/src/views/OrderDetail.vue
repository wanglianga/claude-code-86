<template>
  <div class="page" v-if="o">
    <div class="page-title">
      团餐单 {{ o.orderNo }}
      <el-tag :type="ORDER_STATUS[o.status]?.type as any" style="margin-left:8px">{{ ORDER_STATUS[o.status]?.name }}</el-tag>
      <el-tag v-if="o.hasException" type="danger" style="margin-left:6px">异常处理中</el-tag>
    </div>

    <div class="panel">
      <el-steps :active="stepActive" align-center finish-status="success" style="margin-bottom:8px">
        <el-step v-for="s in ORDER_FLOW" :key="s" :title="ORDER_STATUS[s].name" />
      </el-steps>
    </div>

    <div style="display:grid; grid-template-columns: 1.5fr 1fr; gap:14px; align-items:start">
      <div>
        <div class="panel">
          <div class="panel-title">需求信息</div>
          <el-descriptions :column="2" border size="small">
            <el-descriptions-item label="企业">{{ o.enterpriseName }}</el-descriptions-item>
            <el-descriptions-item label="场景">{{ OCCASIONS[o.occasion] }}</el-descriptions-item>
            <el-descriptions-item label="人数">{{ o.headcount }} 人（素食 {{ o.vegetarianCount }}）</el-descriptions-item>
            <el-descriptions-item label="人均餐标">{{ fmtMoney(o.mealBudget) }}</el-descriptions-item>
            <el-descriptions-item label="过敏忌口">
              <el-tag v-for="a in o.allergies" :key="a" size="small" type="danger" effect="plain" style="margin-right:4px">{{ a }}</el-tag>
              <span v-if="!o.allergies?.length">无</span>
            </el-descriptions-item>
            <el-descriptions-item label="送达时间">{{ fmtTime(o.deliverAt) }}</el-descriptions-item>
            <el-descriptions-item label="送达地址" :span="2">{{ o.address }}</el-descriptions-item>
            <el-descriptions-item label="联系人">{{ o.contactName }} {{ o.contactPhone }}</el-descriptions-item>
            <el-descriptions-item label="备用联系人">
              {{ o.backupContactName ? `${o.backupContactName} ${o.backupContactPhone}` : '-' }}
            </el-descriptions-item>
            <el-descriptions-item label="发票" :span="2">
              {{ o.invoiceRequired ? `${o.invoiceTitle}（${o.taxNo}）` : '不需要' }}
            </el-descriptions-item>
            <el-descriptions-item v-if="o.remark" label="备注" :span="2">{{ o.remark }}</el-descriptions-item>
          </el-descriptions>
        </div>

        <div class="panel" v-if="currentPlan">
          <div class="panel-title">
            供餐方案（v{{ currentPlan.version }}）
            <el-tag size="small" :type="currentPlan.status === 'ACCEPTED' ? 'success' : 'warning'">
              {{ currentPlan.status === 'ACCEPTED' ? '已确认' : currentPlan.status === 'REJECTED' ? '已更换' : '待确认' }}
            </el-tag>
            <span style="margin-left:auto" class="plan-total">{{ fmtMoney(currentPlan.totalPrice) }}</span>
          </div>
          <el-table :data="currentPlan.items" size="small" border>
            <el-table-column prop="name" label="商品" min-width="130" />
            <el-table-column label="品类" width="80">
              <template #default="{ row }">{{ CATEGORIES[row.category] }}</template>
            </el-table-column>
            <el-table-column prop="quantity" label="数量" width="70" align="center" />
            <el-table-column label="单价" width="90" align="right">
              <template #default="{ row }">{{ fmtMoney(row.unitPrice) }}</template>
            </el-table-column>
            <el-table-column label="属性" width="130">
              <template #default="{ row }">
                <el-tag v-if="row.vegetarian" size="small" type="success" effect="plain">素</el-tag>
                <el-tag v-if="row.nearExpiryQty" size="small" type="warning" style="margin-left:4px">
                  临期{{ row.nearExpiryQty }}份
                </el-tag>
              </template>
            </el-table-column>
          </el-table>
          <div class="reason-block">
            <div class="sub-title">方案依据</div>
            <div v-for="(r, i) in currentPlan.reasons" :key="i" class="reason-item ok-text">✓ {{ r }}</div>
          </div>
          <div class="reason-block" v-if="currentPlan.warnings?.length">
            <div class="sub-title">门店平衡提醒</div>
            <div v-for="(w, i) in currentPlan.warnings" :key="i" class="reason-item warn-text">⚠ {{ w }}</div>
          </div>
        </div>

        <div class="panel" v-if="o.incidents?.length">
          <div class="panel-title">异常工单（同一团餐单协同处理）</div>
          <div v-for="i in o.incidents" :key="i.id" class="incident-row" @click="$router.push(`/incidents?focus=${i.id}`)">
            <el-tag :type="INCIDENT_STATUS[i.status]?.type as any" size="small">{{ INCIDENT_STATUS[i.status]?.name }}</el-tag>
            <span class="incident-title">{{ i.title }}</span>
            <span class="muted">{{ INCIDENT_TYPES[i.type] }}</span>
            <span v-if="Number(i.compensation) > 0" class="danger-text">赔付 {{ fmtMoney(i.compensation) }}</span>
            <span class="muted" style="margin-left:auto">{{ fmtTime(i.createdAt) }}</span>
          </div>
        </div>

        <div class="panel" v-if="o.archive">
          <div class="panel-title">交付档案</div>
          <el-descriptions :column="3" border size="small">
            <el-descriptions-item label="实际消费">{{ fmtMoney(o.archive.actualAmount) }}</el-descriptions-item>
            <el-descriptions-item label="实际人数">{{ o.archive.actualHeadcount }}</el-descriptions-item>
            <el-descriptions-item label="准点">
              <span :class="o.archive.onTime ? 'ok-text' : 'danger-text'">{{ o.archive.onTime ? '准点' : '迟到' }}</span>
            </el-descriptions-item>
            <el-descriptions-item label="退货">{{ o.archive.returnCount }} 份 / {{ fmtMoney(o.archive.returnAmount) }}</el-descriptions-item>
            <el-descriptions-item label="临期消化">{{ o.archive.nearExpiryUsed }} 份</el-descriptions-item>
            <el-descriptions-item label="赔付">{{ fmtMoney(o.archive.compensation) }}</el-descriptions-item>
            <el-descriptions-item label="售后次数">{{ o.archive.incidentCount }}</el-descriptions-item>
            <el-descriptions-item label="发票错误">{{ o.archive.invoiceErrors }}</el-descriptions-item>
            <el-descriptions-item label="评分">
              <el-rate :model-value="o.archive.rating" disabled size="small" />
            </el-descriptions-item>
          </el-descriptions>
        </div>
      </div>

      <div>
        <div class="panel">
          <div class="panel-title">操作</div>
          <div class="actions">
            <template v-if="auth.role === 'ENTERPRISE'">
              <el-button v-if="o.status === 'PENDING_CONFIRM'" type="primary" @click="doConfirm">确认方案并下单</el-button>
              <el-button v-if="o.status === 'PENDING_CONFIRM'" @click="doReplan">不满意，换店重算</el-button>
              <el-button v-if="canAdjust" @click="adjustVisible = true">人数临时增减</el-button>
              <el-button v-if="o.status === 'DELIVERED'" type="success" @click="signVisible = true">签收</el-button>
              <el-button v-if="['COMPLETED', 'SIGNED'].includes(o.status)" @click="feedbackVisible = true">员工用餐反馈</el-button>
              <el-button v-if="!['CANCELLED', 'COMPLETED', 'SIGNED'].includes(o.status)" type="danger" plain @click="doCancel">取消订单</el-button>
              <el-button v-if="o.status === 'COMPLETED'" type="primary" plain @click="$router.push(`/orders/new?from=${o.id}`)">再次预订（复购）</el-button>
            </template>
            <template v-if="auth.role === 'STORE'">
              <el-button v-if="o.status === 'CONFIRMED'" type="primary" @click="doPrepare">开始备货</el-button>
              <el-button v-if="['PREPARING', 'CONFIRMED'].includes(o.status)" type="success" @click="doReady">备货完成，通知取货</el-button>
            </template>
            <el-button v-if="['SERVICE', 'ADMIN', 'ENTERPRISE', 'STORE', 'FINANCE'].includes(auth.role)"
              type="warning" plain @click="incidentVisible = true">上报异常</el-button>
          </div>
        </div>

        <div class="panel" v-if="o.delivery">
          <div class="panel-title">配送信息</div>
          <el-descriptions :column="1" border size="small">
            <el-descriptions-item label="状态">
              <el-tag :type="DELIVERY_STATUS[o.delivery.status]?.type as any" size="small">
                {{ DELIVERY_STATUS[o.delivery.status]?.name }}
              </el-tag>
              <el-tag v-if="o.delivery.late" type="danger" size="small" style="margin-left:4px">迟到</el-tag>
            </el-descriptions-item>
            <el-descriptions-item label="仓配员">{{ o.delivery.courierName || '-' }}</el-descriptions-item>
            <el-descriptions-item label="保温箱">{{ o.delivery.thermalBoxNo || '-' }}</el-descriptions-item>
            <el-descriptions-item label="路线">{{ o.delivery.route || '-' }}</el-descriptions-item>
            <el-descriptions-item label="出库">{{ fmtTime(o.delivery.outboundAt) }}</el-descriptions-item>
            <el-descriptions-item label="取货">{{ fmtTime(o.delivery.pickedAt) }}</el-descriptions-item>
            <el-descriptions-item label="送达">{{ fmtTime(o.delivery.deliveredAt) }}</el-descriptions-item>
            <el-descriptions-item label="签收">
              {{ o.delivery.signerName ? `${o.delivery.signerName} ${fmtTime(o.delivery.signedAt)}` : '-' }}
            </el-descriptions-item>
          </el-descriptions>
        </div>

        <div class="panel" v-if="o.invoice">
          <div class="panel-title">发票</div>
          <el-descriptions :column="1" border size="small">
            <el-descriptions-item label="发票号">{{ o.invoice.invoiceNo }}</el-descriptions-item>
            <el-descriptions-item label="抬头">{{ o.invoice.title }}</el-descriptions-item>
            <el-descriptions-item label="金额">{{ fmtMoney(o.invoice.amount) }}</el-descriptions-item>
            <el-descriptions-item label="状态">
              <el-tag :type="INVOICE_STATUS[o.invoice.status]?.type as any" size="small">
                {{ INVOICE_STATUS[o.invoice.status]?.name }}
              </el-tag>
            </el-descriptions-item>
          </el-descriptions>
        </div>

        <div class="panel" v-if="o.feedback?.length">
          <div class="panel-title">员工反馈</div>
          <div v-for="f in o.feedback" :key="f.id" class="feedback-item">
            <el-rate :model-value="f.rating" disabled size="small" />
            <el-tag v-if="f.spoiled" type="danger" size="small" style="margin-left:6px">变质反馈</el-tag>
            <div class="muted">{{ f.comment || '未填写评价' }} · {{ fmtTime(f.createdAt) }}</div>
          </div>
        </div>
      </div>
    </div>

    <!-- 人数调整 -->
    <el-dialog v-model="adjustVisible" title="人数临时增减" width="380px">
      <el-alert type="warning" :closable="false" show-icon title="调整后将联动更新套餐数量与订单金额，并通知门店"
        style="margin-bottom:12px" />
      <el-input-number v-model="adjustCount" :min="1" :max="500" style="width:100%" />
      <template #footer>
        <el-button @click="adjustVisible = false">取消</el-button>
        <el-button type="primary" @click="doAdjust">确认调整</el-button>
      </template>
    </el-dialog>

    <!-- 签收 -->
    <el-dialog v-model="signVisible" title="签收团餐" width="420px">
      <el-form label-width="90px">
        <el-form-item label="实际人数">
          <el-input-number v-model="signForm.actualHeadcount" :min="0" :max="500" />
        </el-form-item>
        <el-form-item label="退货份数">
          <el-input-number v-model="signForm.returnCount" :min="0" :max="50" />
        </el-form-item>
        <el-form-item label="签收人">
          <el-input v-model="signForm.signerName" />
        </el-form-item>
        <el-form-item label="签收备注">
          <el-input v-model="signForm.signNote" type="textarea" :rows="2" />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="signVisible = false">取消</el-button>
        <el-button type="success" @click="doSign">确认签收并归档</el-button>
      </template>
    </el-dialog>

    <!-- 用餐反馈 -->
    <el-dialog v-model="feedbackVisible" title="员工用餐反馈" width="420px">
      <el-form label-width="90px">
        <el-form-item label="评分">
          <el-rate v-model="feedbackForm.rating" />
        </el-form-item>
        <el-form-item label="餐食变质">
          <el-switch v-model="feedbackForm.spoiled" active-text="存在变质问题" />
        </el-form-item>
        <el-form-item label="评价">
          <el-input v-model="feedbackForm.comment" type="textarea" :rows="3"
            placeholder="员工对餐食口味、温度、包装的评价" />
        </el-form-item>
      </el-form>
      <el-alert v-if="feedbackForm.spoiled" type="error" :closable="false" show-icon
        title="提交后将自动生成高优先级异常工单，客服/门店/财务会立即介入" style="margin-top:8px" />
      <template #footer>
        <el-button @click="feedbackVisible = false">取消</el-button>
        <el-button type="primary" @click="doFeedback">提交反馈</el-button>
      </template>
    </el-dialog>

    <!-- 上报异常 -->
    <el-dialog v-model="incidentVisible" title="上报异常（同单协同）" width="480px">
      <el-form label-width="90px">
        <el-form-item label="异常类型">
          <el-select v-model="incidentForm.type" style="width:100%">
            <el-option v-for="(v, k) in INCIDENT_TYPES" :key="k" :label="v" :value="k" />
          </el-select>
        </el-form-item>
        <el-form-item label="优先级">
          <el-radio-group v-model="incidentForm.priority">
            <el-radio-button value="LOW">低</el-radio-button>
            <el-radio-button value="MEDIUM">中</el-radio-button>
            <el-radio-button value="HIGH">高</el-radio-button>
            <el-radio-button value="URGENT">紧急</el-radio-button>
          </el-radio-group>
        </el-form-item>
        <el-form-item label="问题描述">
          <el-input v-model="incidentForm.description" type="textarea" :rows="3" />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="incidentVisible = false">取消</el-button>
        <el-button type="warning" @click="doCreateIncident">提交工单</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, reactive, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { ElMessage, ElMessageBox } from 'element-plus'
import http from '../api/http'
import { useAuthStore } from '../stores/auth'
import {
  ORDER_STATUS, ORDER_FLOW, OCCASIONS, CATEGORIES, INCIDENT_TYPES,
  INCIDENT_STATUS, DELIVERY_STATUS, INVOICE_STATUS, fmtTime, fmtMoney,
} from '../utils/dict'

const route = useRoute()
const router = useRouter()
const auth = useAuthStore()
const o = ref<any>(null)

const adjustVisible = ref(false)
const adjustCount = ref(0)
const signVisible = ref(false)
const feedbackVisible = ref(false)
const incidentVisible = ref(false)
const signForm = reactive<any>({ actualHeadcount: 0, returnCount: 0, signerName: '', signNote: '' })
const feedbackForm = reactive<any>({ rating: 5, spoiled: false, comment: '' })
const incidentForm = reactive<any>({ type: 'OTHER', priority: 'MEDIUM', description: '' })

const id = Number(route.params.id)

const currentPlan = computed(() => o.value?.plans?.[0])
const stepActive = computed(() => {
  if (!o.value) return 0
  const idx = ORDER_FLOW.indexOf(o.value.status)
  return idx < 0 ? 0 : idx + 1
})
const canAdjust = computed(() =>
  ['PENDING_CONFIRM', 'CONFIRMED', 'PREPARING'].includes(o.value?.status))

async function load() {
  o.value = await http.get(`/orders/${id}`)
  adjustCount.value = o.value.headcount
  signForm.actualHeadcount = o.value.headcount
  signForm.signerName = auth.user?.name || ''
}

async function doConfirm() {
  await http.post(`/orders/${id}/confirm`)
  ElMessage.success('方案已确认，门店开始备货')
  load()
}

async function doReplan() {
  try {
    await http.post(`/orders/${id}/replan`)
    ElMessage.success('已更换门店重新生成方案')
  } catch { /* 错误已提示 */ }
  load()
}

async function doCancel() {
  await ElMessageBox.confirm('确认取消该团餐单？', '取消订单', { type: 'warning' })
  await http.post(`/orders/${id}/cancel`)
  ElMessage.success('订单已取消')
  load()
}

async function doAdjust() {
  await http.post(`/orders/${id}/adjust`, { headcount: adjustCount.value })
  ElMessage.success('人数已调整，门店已收到通知')
  adjustVisible.value = false
  load()
}

async function doPrepare() {
  await http.post(`/orders/${id}/prepare`)
  ElMessage.success('已开始备货')
  load()
}

async function doReady() {
  try {
    await http.post(`/orders/${id}/ready`)
    ElMessage.success('备货完成，库存已扣减，配送任务已派发')
  } catch { /* 库存不足已自动生成工单 */ }
  load()
}

async function doSign() {
  await http.post(`/orders/${id}/sign`, { ...signForm })
  ElMessage.success('已签收，订单归档完成')
  signVisible.value = false
  load()
}

async function doFeedback() {
  await http.post(`/orders/${id}/feedback`, { ...feedbackForm })
  ElMessage.success(feedbackForm.spoiled ? '已提交并自动生成紧急工单' : '反馈已提交')
  feedbackVisible.value = false
  load()
}

async function doCreateIncident() {
  await http.post('/incidents', {
    orderId: id,
    type: incidentForm.type,
    priority: incidentForm.priority,
    title: INCIDENT_TYPES[incidentForm.type],
    description: incidentForm.description,
  })
  ElMessage.success('工单已创建，相关角色已收到通知')
  incidentVisible.value = false
  load()
}

onMounted(load)
</script>

<style scoped>
.plan-total { font-size: 18px; font-weight: 700; color: var(--brand); }
.reason-block { margin-top: 12px; }
.sub-title { font-weight: 600; font-size: 13px; margin-bottom: 6px; }
.reason-item { font-size: 13px; line-height: 1.8; }
.actions { display: flex; flex-direction: column; gap: 10px; }
.actions .el-button { margin-left: 0; }
.incident-row {
  display: flex; align-items: center; gap: 10px; padding: 8px 6px;
  border-bottom: 1px solid #f2f3f5; cursor: pointer;
}
.incident-row:hover { background: #f7f8fa; }
.incident-title { font-weight: 600; font-size: 13px; }
.feedback-item { padding: 6px 0; border-bottom: 1px solid #f2f3f5; }
</style>
