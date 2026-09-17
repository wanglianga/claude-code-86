<template>
  <div class="page">
    <div class="page-title">发票与月结</div>
    <div class="panel">
      <el-tabs v-model="tab">
        <el-tab-pane label="发票管理" name="invoices">
          <el-table :data="invoices" size="small" border>
            <el-table-column prop="invoiceNo" label="发票号" width="170" class-name="mono" />
            <el-table-column label="类型" width="110">
              <template #default="{ row }">
                <el-tag size="small" :type="INVOICE_KIND[row.kind || 'ORIGIN']?.type as any">
                  {{ INVOICE_KIND[row.kind || 'ORIGIN']?.name }}
                </el-tag>
              </template>
            </el-table-column>
            <el-table-column v-if="auth.role !== 'ENTERPRISE'" prop="enterpriseName" label="企业" min-width="130" />
            <el-table-column prop="title" label="抬头" min-width="140" show-overflow-tooltip />
            <el-table-column prop="taxNo" label="税号" width="170" class-name="mono" />
            <el-table-column label="金额" width="110" align="right">
              <template #default="{ row }">{{ fmtMoney(row.amount) }}</template>
            </el-table-column>
            <el-table-column label="状态" width="100">
              <template #default="{ row }">
                <el-tag size="small" :type="INVOICE_STATUS[row.status]?.type as any">{{ INVOICE_STATUS[row.status]?.name }}</el-tag>
              </template>
            </el-table-column>
            <el-table-column prop="errorNote" label="错误说明" min-width="140" show-overflow-tooltip />
            <el-table-column v-if="['FINANCE', 'ADMIN'].includes(auth.role)" label="操作" width="150" align="center">
              <template #default="{ row }">
                <el-button v-if="row.status === 'PENDING'" size="small" type="primary" @click="issue(row)">开票</el-button>
                <el-button v-if="['ERROR', 'ISSUED'].includes(row.status)" size="small" type="warning" plain
                  @click="openReissue(row)">红冲重开</el-button>
              </template>
            </el-table-column>
          </el-table>
        </el-tab-pane>

        <el-tab-pane label="月结账单" name="settlements">
          <div v-if="['FINANCE', 'ADMIN'].includes(auth.role)" style="display:flex; gap:10px; margin-bottom:12px">
            <el-select v-model="genForm.enterpriseId" placeholder="选择企业" style="width:200px">
              <el-option v-for="e in enterprises" :key="e.id" :label="e.name" :value="e.id" />
            </el-select>
            <el-date-picker v-model="genForm.month" type="month" value-format="YYYY-MM" placeholder="账期" style="width:150px" />
            <el-button type="primary" @click="generate">归集生成月结单</el-button>
          </div>
          <el-table :data="settlements" size="small" border>
            <el-table-column prop="month" label="账期" width="100" />
            <el-table-column v-if="auth.role !== 'ENTERPRISE'" prop="enterpriseName" label="企业" min-width="140" />
            <el-table-column prop="orderCount" label="团餐单数" width="90" align="center" />
            <el-table-column label="临期确认附件" width="120" align="center">
              <template #default="{ row }">
                <el-button v-if="row.attachmentCount" link type="primary" @click="viewAttachments(row)">
                  {{ row.attachmentCount }} 份
                </el-button>
                <span v-else class="muted">-</span>
              </template>
            </el-table-column>
            <el-table-column label="金额" width="130" align="right">
              <template #default="{ row }">{{ fmtMoney(row.totalAmount) }}</template>
            </el-table-column>
            <el-table-column label="状态" width="110">
              <template #default="{ row }">
                <el-tag size="small" :type="SETTLEMENT_STATUS[row.status]?.type as any">{{ SETTLEMENT_STATUS[row.status]?.name }}</el-tag>
              </template>
            </el-table-column>
            <el-table-column label="操作" width="260" align="center">
              <template #default="{ row }">
                <el-button size="small" @click="viewOrders(row)">明细</el-button>
                <el-button v-if="auth.role === 'ENTERPRISE' && row.status === 'OPEN'" size="small" type="primary"
                  @click="confirm(row)">确认账单</el-button>
                <el-button v-if="['FINANCE', 'ADMIN'].includes(auth.role) && row.status === 'CONFIRMED'"
                  size="small" type="primary" @click="invoiceSettlement(row)">开具发票</el-button>
                <el-button v-if="['FINANCE', 'ADMIN'].includes(auth.role) && row.status === 'INVOICED'"
                  size="small" type="success" @click="pay(row)">登记回款</el-button>
              </template>
            </el-table-column>
          </el-table>
        </el-tab-pane>
      </el-tabs>
    </div>

    <el-dialog v-model="reissueVisible" title="红冲重开发票" width="420px">
      <el-form label-width="90px">
        <el-form-item label="新抬头">
          <el-input v-model="reissueForm.title" />
        </el-form-item>
        <el-form-item label="新税号">
          <el-input v-model="reissueForm.taxNo" />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="reissueVisible = false">取消</el-button>
        <el-button type="warning" @click="reissue">确认重开</el-button>
      </template>
    </el-dialog>

    <el-dialog v-model="ordersVisible" title="月结单明细" width="760px">
      <el-table :data="settlementOrders" size="small" border>
        <el-table-column prop="orderNo" label="团餐单号" width="150" class-name="mono" />
        <el-table-column label="送达时间" width="150">
          <template #default="{ row }">{{ fmtTime(row.deliverAt) }}</template>
        </el-table-column>
        <el-table-column prop="headcount" label="人数" width="70" align="center" />
        <el-table-column label="临期调拨" width="90" align="center">
          <template #default="{ row }">
            <el-tag v-if="row.nearExpiryOfferId" size="small" type="warning" effect="dark">已贴标</el-tag>
            <span v-else class="muted">-</span>
          </template>
        </el-table-column>
        <el-table-column label="实付金额" align="right">
          <template #default="{ row }">{{ fmtMoney(row.actualAmount ?? row.totalAmount) }}</template>
        </el-table-column>
      </el-table>

      <div v-if="settlementAttachments.length" style="margin-top:14px">
        <div style="font-weight:600;font-size:13px;margin-bottom:6px">
          月结附件 · 临期调拨企业确认（{{ settlementAttachments.length }}）
        </div>
        <el-table :data="settlementAttachments" size="small" border>
          <el-table-column prop="attachmentNo" label="附件号" width="140" class-name="mono" />
          <el-table-column prop="orderNo" label="团餐单" width="140" class-name="mono" />
          <el-table-column prop="title" label="标题" min-width="200" show-overflow-tooltip />
          <el-table-column label="操作" width="90" align="center">
            <template #default="{ row }">
              <el-button size="small" @click="openAttachment(row)">查看确认</el-button>
            </template>
          </el-table-column>
        </el-table>
      </div>
    </el-dialog>

    <el-dialog v-model="attachmentVisible" title="月结附件 · 临期调拨企业确认" width="720px" append-to-body top="6vh">
      <div v-if="attachment">
        <el-descriptions :column="2" border size="small">
          <el-descriptions-item label="附件号">{{ attachment.attachmentNo }}</el-descriptions-item>
          <el-descriptions-item label="账期">{{ attachment.month }}</el-descriptions-item>
          <el-descriptions-item label="方案号">{{ attachment.snapshot.offerNo }}</el-descriptions-item>
          <el-descriptions-item label="确认人/时间">
            {{ attachment.snapshot.acceptedBy }} · {{ fmtTime(attachment.snapshot.acceptedAt) }}
          </el-descriptions-item>
          <el-descriptions-item label="临期份数">
            {{ attachment.snapshot.nearExpiryQty }} / {{ attachment.snapshot.totalQty }} 份
          </el-descriptions-item>
          <el-descriptions-item label="折扣金额">
            {{ fmtMoney(attachment.snapshot.amountBefore) }} → <b style="color:#ff6a00">{{ fmtMoney(attachment.snapshot.offerAmount) }}</b>
          </el-descriptions-item>
          <el-descriptions-item label="确认说明" :span="2">{{ attachment.snapshot.acceptanceNote }}</el-descriptions-item>
          <el-descriptions-item label="折扣原因" :span="2">{{ attachment.snapshot.discountReason }}</el-descriptions-item>
        </el-descriptions>
        <el-alert type="success" :closable="false" show-icon style="margin-top:10px"
          title="售后说明（企业确认留存）" :description="attachment.snapshot.afterSalesPolicy?.statement" />
      </div>
    </el-dialog>
  </div>
</template>

<script setup lang="ts">
import { onMounted, reactive, ref } from 'vue'
import { ElMessage } from 'element-plus'
import http from '../api/http'
import { useAuthStore } from '../stores/auth'
import { INVOICE_STATUS, INVOICE_KIND, SETTLEMENT_STATUS, fmtTime, fmtMoney } from '../utils/dict'

const auth = useAuthStore()
const tab = ref('invoices')
const invoices = ref<any[]>([])
const settlements = ref<any[]>([])
const enterprises = ref<any[]>([])
const genForm = reactive<any>({ enterpriseId: null, month: new Date().toISOString().slice(0, 7) })
const reissueVisible = ref(false)
const reissueForm = reactive<any>({ id: 0, title: '', taxNo: '' })
const ordersVisible = ref(false)
const settlementOrders = ref<any[]>([])
const settlementAttachments = ref<any[]>([])
const attachmentVisible = ref(false)
const attachment = ref<any>(null)

async function load() {
  invoices.value = await http.get('/finance/invoices')
  settlements.value = await http.get('/finance/settlements')
  if (['FINANCE', 'ADMIN'].includes(auth.role)) {
    enterprises.value = await http.get('/enterprises')
  }
}

async function issue(row: any) {
  await http.post(`/finance/invoices/${row.id}/issue`)
  ElMessage.success('已开票')
  load()
}

function openReissue(row: any) {
  Object.assign(reissueForm, { id: row.id, title: row.title, taxNo: row.taxNo })
  reissueVisible.value = true
}

async function reissue() {
  await http.post(`/finance/invoices/${reissueForm.id}/reissue`, { ...reissueForm })
  ElMessage.success('已红冲并重开新发票')
  reissueVisible.value = false
  load()
}

async function generate() {
  if (!genForm.enterpriseId || !genForm.month) {
    ElMessage.warning('请选择企业与账期')
    return
  }
  const s: any = await http.post('/finance/settlements/generate', { ...genForm })
  ElMessage.success(`已归集 ${s.orderCount} 单，合计 ${fmtMoney(s.totalAmount)}`)
  load()
}

async function confirm(row: any) {
  await http.post(`/finance/settlements/${row.id}/confirm`)
  ElMessage.success('账单已确认，等待财务开票')
  load()
}

async function invoiceSettlement(row: any) {
  await http.post(`/finance/settlements/${row.id}/invoice`)
  ElMessage.success('月结发票已开具')
  load()
}

async function pay(row: any) {
  await http.post(`/finance/settlements/${row.id}/pay`)
  ElMessage.success('已登记回款')
  load()
}

async function viewOrders(row: any) {
  settlementOrders.value = await http.get(`/finance/settlements/${row.id}/orders`)
  settlementAttachments.value = await http.get(`/finance/settlements/${row.id}/attachments`)
  ordersVisible.value = true
}

async function viewAttachments(row: any) {
  await viewOrders(row)
}

function openAttachment(row: any) {
  attachment.value = row
  attachmentVisible.value = true
}

onMounted(load)
</script>
