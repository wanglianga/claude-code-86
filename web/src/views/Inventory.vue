<template>
  <div class="page">
    <div class="page-title">库存批次与临期鲜食</div>
    <div class="panel">
      <el-tabs v-model="tab">
        <el-tab-pane label="库存批次" name="batches">
          <div style="display:flex; gap:10px; margin-bottom:12px">
            <el-select v-if="!auth.user?.storeId" v-model="filterStore" placeholder="全部门店" clearable
              style="width:180px" @change="loadBatches">
              <el-option v-for="s in stores" :key="s.id" :label="s.name" :value="s.id" />
            </el-select>
            <el-button type="primary" @click="openCreate">入库登记</el-button>
          </div>
          <el-table :data="batches" size="small" border max-height="560">
            <el-table-column prop="batchNo" label="批次号" width="110" class-name="mono" />
            <el-table-column label="商品" min-width="130">
              <template #default="{ row }">{{ row.product?.name }}</template>
            </el-table-column>
            <el-table-column label="品类" width="80">
              <template #default="{ row }">{{ CATEGORIES[row.product?.category] }}</template>
            </el-table-column>
            <el-table-column prop="quantity" label="剩余" width="70" align="center" />
            <el-table-column label="温控" width="80">
              <template #default="{ row }">{{ TEMP_ZONES[row.tempZone] }}</template>
            </el-table-column>
            <el-table-column label="生产时间" width="150">
              <template #default="{ row }">{{ fmtTime(row.producedAt) }}</template>
            </el-table-column>
            <el-table-column label="到期时间" width="150">
              <template #default="{ row }">{{ fmtTime(row.expiresAt) }}</template>
            </el-table-column>
            <el-table-column label="状态" width="100">
              <template #default="{ row }">
                <el-tag v-if="row.status === 'DISPOSED'" type="info" size="small">已报损</el-tag>
                <el-tag v-else-if="row.status === 'DEPLETED'" type="info" size="small">已售罄</el-tag>
                <el-tag v-else-if="row.expired" type="danger" size="small">已过期</el-tag>
                <el-tag v-else-if="row.nearExpiry" type="warning" size="small">临期</el-tag>
                <el-tag v-else type="success" size="small">正常</el-tag>
              </template>
            </el-table-column>
            <el-table-column label="操作" width="180" align="center">
              <template #default="{ row }">
                <el-button v-if="row.status === 'AVAILABLE' && row.quantity > 0" size="small"
                  @click="openTransfer(row)">调拨</el-button>
                <el-button v-if="row.status === 'AVAILABLE'" size="small" type="danger" plain
                  @click="dispose(row)">报损</el-button>
              </template>
            </el-table-column>
          </el-table>
        </el-tab-pane>

        <el-tab-pane name="near">
          <template #label>
            临期鲜食
            <el-badge v-if="nearList.length" :value="nearList.length" type="warning" style="margin-left:4px" />
          </template>
          <el-alert type="warning" :closable="false" show-icon style="margin-bottom:12px"
            title="以下鲜食将在 6 小时内到期：优先用于团餐套餐（7 折），或发起门店间调拨，避免报损浪费" />
          <el-table :data="nearList" size="small" border>
            <el-table-column prop="batchNo" label="批次号" width="110" class-name="mono" />
            <el-table-column label="门店" min-width="130">
              <template #default="{ row }">{{ row.store?.name }}</template>
            </el-table-column>
            <el-table-column label="商品" min-width="130">
              <template #default="{ row }">{{ row.product?.name }}</template>
            </el-table-column>
            <el-table-column prop="quantity" label="剩余" width="70" align="center" />
            <el-table-column label="到期时间" width="150">
              <template #default="{ row }">
                <span class="warn-text">{{ fmtTime(row.expiresAt) }}</span>
              </template>
            </el-table-column>
            <el-table-column label="操作" width="120" align="center">
              <template #default="{ row }">
                <el-button size="small" type="warning" plain @click="openTransfer(row)">发起调拨</el-button>
              </template>
            </el-table-column>
          </el-table>
        </el-tab-pane>

        <el-tab-pane label="调拨单" name="transfers">
          <el-table :data="transfers" size="small" border>
            <el-table-column prop="id" label="单号" width="70" />
            <el-table-column label="商品" min-width="120">
              <template #default="{ row }">{{ row.product?.name }}</template>
            </el-table-column>
            <el-table-column label="调出" min-width="130">
              <template #default="{ row }">{{ row.fromStore?.name }}</template>
            </el-table-column>
            <el-table-column label="调入" min-width="130">
              <template #default="{ row }">{{ row.toStore?.name }}</template>
            </el-table-column>
            <el-table-column prop="quantity" label="数量" width="70" align="center" />
            <el-table-column prop="reason" label="原因" min-width="120" />
            <el-table-column label="状态" width="90">
              <template #default="{ row }">
                <el-tag size="small" :type="row.status === 'ACCEPTED' ? 'success' : row.status === 'REJECTED' ? 'info' : 'warning'">
                  {{ { PENDING: '待接收', ACCEPTED: '已接收', REJECTED: '已拒绝' }[row.status] }}
                </el-tag>
              </template>
            </el-table-column>
            <el-table-column label="操作" width="150" align="center">
              <template #default="{ row }">
                <template v-if="row.status === 'PENDING' && row.toStoreId === auth.user?.storeId">
                  <el-button size="small" type="success" @click="accept(row)">接收</el-button>
                  <el-button size="small" type="info" plain @click="reject(row)">拒绝</el-button>
                </template>
              </template>
            </el-table-column>
          </el-table>
        </el-tab-pane>
      </el-tabs>
    </div>

    <!-- 入库 -->
    <el-dialog v-model="createVisible" title="鲜食批次入库" width="480px">
      <el-form label-width="90px">
        <el-form-item label="商品">
          <el-select v-model="createForm.productId" style="width:100%" @change="onProductChange">
            <el-option v-for="p in products" :key="p.id" :label="`${p.name}（${CATEGORIES[p.category]}）`" :value="p.id" />
          </el-select>
        </el-form-item>
        <el-form-item label="数量">
          <el-input-number v-model="createForm.quantity" :min="1" :max="1000" />
        </el-form-item>
        <el-form-item label="生产时间">
          <el-date-picker v-model="createForm.producedAt" type="datetime" style="width:100%" />
        </el-form-item>
        <el-form-item label="到期时间">
          <el-date-picker v-model="createForm.expiresAt" type="datetime" style="width:100%" />
        </el-form-item>
        <el-form-item label="温控">
          <el-select v-model="createForm.tempZone" style="width:100%">
            <el-option v-for="(v, k) in TEMP_ZONES" :key="k" :label="v" :value="k" />
          </el-select>
        </el-form-item>
        <el-form-item label="供应商">
          <el-select v-model="createForm.supplierId" clearable style="width:100%">
            <el-option v-for="s in suppliers" :key="s.id" :label="s.name" :value="s.id" />
          </el-select>
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="createVisible = false">取消</el-button>
        <el-button type="primary" @click="createBatch">确认入库</el-button>
      </template>
    </el-dialog>

    <!-- 调拨 -->
    <el-dialog v-model="transferVisible" title="发起临期调拨" width="420px">
      <el-form label-width="90px">
        <el-form-item label="批次">
          <span class="mono">{{ transferForm.batchNo }}</span>
        </el-form-item>
        <el-form-item label="调入门店">
          <el-select v-model="transferForm.toStoreId" style="width:100%">
            <el-option v-for="s in stores.filter(x => x.id !== transferForm.fromStoreId)"
              :key="s.id" :label="s.name" :value="s.id" />
          </el-select>
        </el-form-item>
        <el-form-item label="数量">
          <el-input-number v-model="transferForm.quantity" :min="1" :max="transferForm.maxQty" />
        </el-form-item>
        <el-form-item label="原因">
          <el-input v-model="transferForm.reason" placeholder="临期鲜食调拨" />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="transferVisible = false">取消</el-button>
        <el-button type="warning" @click="createTransfer">发起调拨</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<script setup lang="ts">
import { onMounted, reactive, ref } from 'vue'
import { ElMessage } from 'element-plus'
import http from '../api/http'
import { useAuthStore } from '../stores/auth'
import { CATEGORIES, TEMP_ZONES, fmtTime } from '../utils/dict'

const auth = useAuthStore()
const tab = ref('batches')
const batches = ref<any[]>([])
const nearList = ref<any[]>([])
const transfers = ref<any[]>([])
const stores = ref<any[]>([])
const products = ref<any[]>([])
const suppliers = ref<any[]>([])
const filterStore = ref<number | null>(null)

const createVisible = ref(false)
const transferVisible = ref(false)
const createForm = reactive<any>({ productId: null, quantity: 30, producedAt: new Date(), expiresAt: null, tempZone: 'CHILLED', supplierId: null })
const transferForm = reactive<any>({ batchId: 0, batchNo: '', fromStoreId: 0, toStoreId: null, quantity: 1, maxQty: 1, reason: '临期鲜食调拨' })

async function loadBatches() {
  const params: any = {}
  if (filterStore.value) params.storeId = filterStore.value
  batches.value = await http.get('/inventory/batches', { params })
}
async function loadNear() {
  nearList.value = await http.get('/inventory/near-expiry', {
    params: auth.user?.storeId ? { storeId: auth.user.storeId } : {},
  })
}
async function loadTransfers() {
  transfers.value = await http.get('/inventory/transfers')
}

function onProductChange(pid: number) {
  const p = products.value.find((x) => x.id === pid)
  if (p) {
    createForm.tempZone = p.tempZone
    createForm.expiresAt = new Date(Date.now() + p.shelfLifeHours * 3600 * 1000)
  }
}

function openCreate() {
  createVisible.value = true
}

async function createBatch() {
  if (!createForm.productId || !createForm.expiresAt) {
    ElMessage.warning('请选择商品并填写到期时间')
    return
  }
  await http.post('/inventory/batches', { ...createForm })
  ElMessage.success('入库成功')
  createVisible.value = false
  loadBatches()
  loadNear()
}

async function dispose(row: any) {
  await http.post(`/inventory/batches/${row.id}/dispose`)
  ElMessage.success('已报损')
  loadBatches()
}

function openTransfer(row: any) {
  Object.assign(transferForm, {
    batchId: row.id, batchNo: row.batchNo, fromStoreId: row.storeId,
    toStoreId: null, quantity: row.quantity, maxQty: row.quantity,
  })
  transferVisible.value = true
}

async function createTransfer() {
  if (!transferForm.toStoreId) {
    ElMessage.warning('请选择调入门店')
    return
  }
  await http.post('/inventory/transfers', { ...transferForm })
  ElMessage.success('调拨申请已发送')
  transferVisible.value = false
  loadTransfers()
}

async function accept(row: any) {
  await http.post(`/inventory/transfers/${row.id}/accept`)
  ElMessage.success('已接收入库')
  loadTransfers()
  loadBatches()
}

async function reject(row: any) {
  await http.post(`/inventory/transfers/${row.id}/reject`)
  ElMessage.success('已拒绝')
  loadTransfers()
}

onMounted(async () => {
  const [s, p, sp]: any[] = await Promise.all([
    http.get('/stores'), http.get('/products'), http.get('/suppliers'),
  ])
  stores.value = s
  products.value = p
  suppliers.value = sp
  loadBatches()
  loadNear()
  loadTransfers()
})
</script>
