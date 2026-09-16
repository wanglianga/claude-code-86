<template>
  <div class="page">
    <div class="page-title">发起团餐需求</div>
    <div style="display:grid; grid-template-columns: 1fr 1fr; gap:14px; align-items:start">
      <div class="panel">
        <div class="panel-title">需求信息</div>
        <el-form :model="form" label-width="96px">
          <el-form-item label="用餐场景">
            <el-radio-group v-model="form.occasion">
              <el-radio-button value="MEETING">会议餐</el-radio-button>
              <el-radio-button value="TRAINING">培训餐</el-radio-button>
              <el-radio-button value="OVERTIME">加班餐</el-radio-button>
            </el-radio-group>
          </el-form-item>
          <el-form-item label="人数">
            <el-input-number v-model="form.headcount" :min="5" :max="500" />
            <span class="muted" style="margin-left:10px">人均餐标</span>
            <el-input-number v-model="form.mealBudget" :min="10" :max="100" style="margin-left:8px; width:120px" />
          </el-form-item>
          <el-form-item label="素食人数">
            <el-input-number v-model="form.vegetarianCount" :min="0" :max="form.headcount" />
          </el-form-item>
          <el-form-item label="过敏忌口">
            <el-select v-model="form.allergies" multiple placeholder="选择需要回避的过敏原" style="width:100%">
              <el-option v-for="a in ALLERGENS" :key="a" :label="a" :value="a" />
            </el-select>
          </el-form-item>
          <el-form-item label="送达时间">
            <el-date-picker v-model="form.deliverAt" type="datetime" placeholder="选择送达时间"
              :disabled-date="(d: Date) => d.getTime() < Date.now() - 86400000" style="width:100%" />
          </el-form-item>
          <el-form-item label="送达地址">
            <el-input v-model="form.address" />
          </el-form-item>
          <el-form-item label="联系人">
            <el-input v-model="form.contactName" style="width:45%; margin-right:8px" placeholder="姓名" />
            <el-input v-model="form.contactPhone" style="width:50%" placeholder="电话" />
          </el-form-item>
          <el-form-item label="备用联系人">
            <el-input v-model="form.backupContactName" style="width:45%; margin-right:8px" placeholder="姓名" />
            <el-input v-model="form.backupContactPhone" style="width:50%" placeholder="电话" />
          </el-form-item>
          <el-form-item label="发票">
            <el-switch v-model="form.invoiceRequired" active-text="需要发票" />
          </el-form-item>
          <template v-if="form.invoiceRequired">
            <el-form-item label="发票抬头">
              <el-input v-model="form.invoiceTitle" />
            </el-form-item>
            <el-form-item label="税号">
              <el-input v-model="form.taxNo" />
            </el-form-item>
          </template>
          <el-form-item label="备注">
            <el-input v-model="form.remark" type="textarea" :rows="2" placeholder="如：送到前台、需要餐具、分楼层配送等" />
          </el-form-item>
          <el-form-item>
            <el-button :loading="previewing" @click="doPreview">智能试算方案</el-button>
            <el-button type="primary" :loading="submitting" @click="doSubmit">提交并生成供餐方案</el-button>
          </el-form-item>
        </el-form>
      </div>

      <div class="panel">
        <div class="panel-title">智能方案预览</div>
        <el-empty v-if="!preview" description="填写需求后点击「智能试算方案」，平台将综合附近门店库存、鲜食批次、配送能力、临期商品、历史偏好与高峰时段生成供餐方案" />
        <template v-else>
          <el-alert v-if="!preview.ok" type="error" :title="preview.reason" :closable="false" show-icon />
          <template v-else>
            <div class="plan-head">
              <el-tag type="success" size="large">推荐门店：{{ preview.storeName }}</el-tag>
              <span class="muted">距离 {{ preview.distance }}km</span>
              <span class="plan-total">{{ fmtMoney(preview.totalPrice) }}</span>
            </div>
            <el-table :data="preview.items" size="small" border>
              <el-table-column prop="name" label="商品" min-width="130" />
              <el-table-column label="品类" width="80">
                <template #default="{ row }">{{ CATEGORIES[row.category] }}</template>
              </el-table-column>
              <el-table-column prop="quantity" label="数量" width="70" align="center" />
              <el-table-column label="单价" width="90" align="right">
                <template #default="{ row }">{{ fmtMoney(row.unitPrice) }}</template>
              </el-table-column>
              <el-table-column label="临期" width="70" align="center">
                <template #default="{ row }">
                  <el-tag v-if="row.nearExpiryQty" type="warning" size="small">{{ row.nearExpiryQty }}份</el-tag>
                  <span v-else>-</span>
                </template>
              </el-table-column>
            </el-table>
            <div class="reason-block">
              <div class="sub-title">方案依据</div>
              <div v-for="(r, i) in preview.reasons" :key="i" class="reason-item ok-text">✓ {{ r }}</div>
            </div>
            <div class="reason-block" v-if="preview.warnings?.length">
              <div class="sub-title">门店平衡提醒</div>
              <div v-for="(w, i) in preview.warnings" :key="i" class="reason-item warn-text">⚠ {{ w }}</div>
            </div>
          </template>
        </template>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { onMounted, reactive, ref } from 'vue'
import { useRouter, useRoute } from 'vue-router'
import { ElMessage } from 'element-plus'
import http from '../api/http'
import { useAuthStore } from '../stores/auth'
import { ALLERGENS, CATEGORIES, fmtMoney } from '../utils/dict'

const router = useRouter()
const route = useRoute()
const auth = useAuthStore()

const form = reactive<any>({
  occasion: 'MEETING',
  headcount: 30,
  mealBudget: 30,
  vegetarianCount: 0,
  allergies: [],
  deliverAt: null,
  address: '',
  contactName: '',
  contactPhone: '',
  backupContactName: '',
  backupContactPhone: '',
  invoiceRequired: true,
  invoiceTitle: '',
  taxNo: '',
  remark: '',
})

const preview = ref<any>(null)
const previewing = ref(false)
const submitting = ref(false)

onMounted(async () => {
  // 复购预填
  if (route.query.from) {
    try {
      const last: any = await http.get(`/orders/${route.query.from}`)
      Object.assign(form, {
        occasion: last.occasion,
        headcount: last.headcount,
        mealBudget: Number(last.mealBudget),
        vegetarianCount: last.vegetarianCount,
        allergies: last.allergies || [],
        address: last.address,
        contactName: last.contactName,
        contactPhone: last.contactPhone,
        backupContactName: last.backupContactName,
        backupContactPhone: last.backupContactPhone,
        invoiceRequired: last.invoiceRequired,
        invoiceTitle: last.invoiceTitle,
        taxNo: last.taxNo,
      })
      ElMessage.success('已按上次团餐预填，可调整后提交')
    } catch { /* ignore */ }
  }
  if (!form.address && auth.user?.enterpriseId) {
    const ent: any = await http.get(`/enterprises/${auth.user.enterpriseId}`)
    form.address = ent.address
    form.contactName = ent.contactName
    form.contactPhone = ent.contactPhone
    form.backupContactName = ent.backupContactName || ''
    form.backupContactPhone = ent.backupContactPhone || ''
    form.invoiceTitle = ent.invoiceTitle || ent.name
    form.taxNo = ent.taxNo || ''
    const contract = ent.contracts?.find((c: any) => c.status === 'ACTIVE')
    if (contract) form.mealBudget = Number(contract.mealBudget) || 30
  }
})

function valid() {
  if (!form.deliverAt) { ElMessage.warning('请选择送达时间'); return false }
  if (new Date(form.deliverAt).getTime() < Date.now() + 3600 * 1000) {
    ElMessage.warning('送达时间请至少在 1 小时后，给门店备货与配送留出时间')
    return false
  }
  if (!form.address || !form.contactName || !form.contactPhone) {
    ElMessage.warning('请完善送达地址与联系人')
    return false
  }
  return true
}

async function doPreview() {
  if (!valid()) return
  previewing.value = true
  try {
    preview.value = await http.post('/orders/preview', { ...form })
  } finally {
    previewing.value = false
  }
}

async function doSubmit() {
  if (!valid()) return
  submitting.value = true
  try {
    const order: any = await http.post('/orders', { ...form })
    if (order.status === 'PENDING_CONFIRM') {
      ElMessage.success('供餐方案已生成，请确认')
    } else {
      ElMessage.warning('订单已创建，但附近门店暂时无法完整承接，已自动转客服协调')
    }
    router.push(`/orders/${order.id}`)
  } finally {
    submitting.value = false
  }
}
</script>

<style scoped>
.plan-head { display: flex; align-items: center; gap: 12px; margin-bottom: 10px; }
.plan-total { margin-left: auto; font-size: 20px; font-weight: 700; color: var(--brand); }
.reason-block { margin-top: 12px; }
.sub-title { font-weight: 600; font-size: 13px; margin-bottom: 6px; }
.reason-item { font-size: 13px; line-height: 1.8; }
</style>
