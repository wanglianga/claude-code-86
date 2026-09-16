<template>
  <div class="page">
    <div class="page-title">平台管理</div>
    <div class="panel">
      <el-tabs v-model="tab">
        <!-- 企业与合同 -->
        <el-tab-pane label="企业与合同" name="enterprises">
          <el-table :data="enterprises" size="small" border>
            <el-table-column prop="name" label="企业名称" min-width="150" />
            <el-table-column label="联系人" width="150">
              <template #default="{ row }">{{ row.contactName }} {{ row.contactPhone }}</template>
            </el-table-column>
            <el-table-column label="备用联系人" width="150">
              <template #default="{ row }">
                {{ row.backupContactName ? `${row.backupContactName} ${row.backupContactPhone}` : '-' }}
              </template>
            </el-table-column>
            <el-table-column prop="address" label="地址" min-width="180" show-overflow-tooltip />
            <el-table-column label="偏好" min-width="130">
              <template #default="{ row }">
                <el-tag v-for="c in row.preferences?.likes || []" :key="c" size="small" effect="plain" style="margin-right:4px">
                  {{ CATEGORIES[c] }}
                </el-tag>
              </template>
            </el-table-column>
            <el-table-column label="操作" width="120" align="center">
              <template #default="{ row }">
                <el-button size="small" @click="openContracts(row)">合同管理</el-button>
              </template>
            </el-table-column>
          </el-table>
        </el-tab-pane>

        <!-- 门店 -->
        <el-tab-pane label="门店" name="stores">
          <el-table :data="stores" size="small" border>
            <el-table-column prop="name" label="门店" min-width="150" />
            <el-table-column prop="address" label="地址" min-width="170" show-overflow-tooltip />
            <el-table-column prop="dailyCapacity" label="团餐日产能" width="100" align="center" />
            <el-table-column prop="staffCount" label="编制人数" width="90" align="center" />
            <el-table-column label="散客高峰" min-width="160">
              <template #default="{ row }">
                {{ (row.peakHours || []).map((p: any) => `${p.start}-${p.end}`).join('、') }}
              </template>
            </el-table-column>
            <el-table-column label="状态" width="90">
              <template #default="{ row }">
                <el-tag size="small" :type="row.status === 'OPEN' ? 'success' : 'info'">
                  {{ row.status === 'OPEN' ? '营业中' : '暂停' }}
                </el-tag>
              </template>
            </el-table-column>
            <el-table-column label="操作" width="110" align="center">
              <template #default="{ row }">
                <el-button size="small" @click="openStoreEdit(row)">编辑</el-button>
              </template>
            </el-table-column>
          </el-table>
        </el-tab-pane>

        <!-- 商品 -->
        <el-tab-pane label="商品" name="products">
          <el-table :data="products" size="small" border>
            <el-table-column prop="sku" label="SKU" width="110" class-name="mono" />
            <el-table-column prop="name" label="商品" min-width="140" />
            <el-table-column label="品类" width="90">
              <template #default="{ row }">{{ CATEGORIES[row.category] }}</template>
            </el-table-column>
            <el-table-column label="售价" width="90" align="right">
              <template #default="{ row }">{{ fmtMoney(row.price) }}</template>
            </el-table-column>
            <el-table-column prop="shelfLifeHours" label="保质期(h)" width="90" align="center" />
            <el-table-column label="温控" width="80">
              <template #default="{ row }">{{ TEMP_ZONES[row.tempZone] }}</template>
            </el-table-column>
            <el-table-column label="素食" width="70" align="center">
              <template #default="{ row }">{{ row.vegetarian ? '✓' : '' }}</template>
            </el-table-column>
            <el-table-column label="过敏原" min-width="130">
              <template #default="{ row }">
                <el-tag v-for="a in row.allergens" :key="a" size="small" type="danger" effect="plain"
                  style="margin-right:4px">{{ a }}</el-tag>
              </template>
            </el-table-column>
          </el-table>
        </el-tab-pane>

        <!-- 用户 -->
        <el-tab-pane label="用户" name="users">
          <div style="margin-bottom:12px">
            <el-button type="primary" size="small" @click="openUserCreate">新增账号</el-button>
          </div>
          <el-table :data="users" size="small" border>
            <el-table-column prop="username" label="用户名" width="130" />
            <el-table-column prop="name" label="姓名" width="110" />
            <el-table-column label="角色" width="100">
              <template #default="{ row }">{{ ROLE_NAMES[row.role] }}</template>
            </el-table-column>
            <el-table-column label="所属" min-width="150">
              <template #default="{ row }">
                {{ row.enterpriseId ? enterpriseName(row.enterpriseId) : row.storeId ? storeName(row.storeId) : '平台' }}
              </template>
            </el-table-column>
            <el-table-column prop="phone" label="电话" width="130" />
            <el-table-column label="状态" width="80">
              <template #default="{ row }">
                <el-tag size="small" :type="row.active ? 'success' : 'info'">{{ row.active ? '启用' : '停用' }}</el-tag>
              </template>
            </el-table-column>
          </el-table>
        </el-tab-pane>

        <!-- 供应商 -->
        <el-tab-pane label="供应商与到货" name="suppliers">
          <div class="sub-block">
            <div class="panel-title">供应商</div>
            <el-table :data="suppliers" size="small" border>
              <el-table-column prop="name" label="名称" min-width="150" />
              <el-table-column prop="contact" label="联系人" width="120" />
              <el-table-column prop="phone" label="电话" width="140" />
            </el-table>
          </div>
          <div class="sub-block" style="margin-top:16px">
            <div class="panel-title">到货记录（延迟自动预警）</div>
            <el-table :data="supplierDeliveries" size="small" border>
              <el-table-column prop="supplierName" label="供应商" min-width="130" />
              <el-table-column label="门店" width="150">
                <template #default="{ row }">{{ storeName(row.storeId) }}</template>
              </el-table-column>
              <el-table-column label="预计到货" width="150">
                <template #default="{ row }">{{ fmtTime(row.expectedAt) }}</template>
              </el-table-column>
              <el-table-column label="实际到货" width="150">
                <template #default="{ row }">{{ row.arrivedAt ? fmtTime(row.arrivedAt) : '-' }}</template>
              </el-table-column>
              <el-table-column label="状态" width="100">
                <template #default="{ row }">
                  <el-tag size="small" :type="{ SCHEDULED: 'primary', ARRIVED: 'success', DELAYED: 'danger' }[row.status] as any">
                    {{ { SCHEDULED: '待到货', ARRIVED: '已到货', DELAYED: '延迟到货' }[row.status] }}
                  </el-tag>
                </template>
              </el-table-column>
              <el-table-column prop="note" label="备注" min-width="150" show-overflow-tooltip />
            </el-table>
          </div>
        </el-tab-pane>
      </el-tabs>
    </div>

    <!-- 合同管理 -->
    <el-dialog v-model="contractVisible" :title="`合同管理 · ${currentEnterprise?.name || ''}`" width="640px">
      <el-table :data="contracts" size="small" border style="margin-bottom:12px">
        <el-table-column prop="title" label="合同" min-width="160" />
        <el-table-column label="期限" width="190">
          <template #default="{ row }">{{ row.startDate }} ~ {{ row.endDate }}</template>
        </el-table-column>
        <el-table-column label="餐标" width="80" align="right">
          <template #default="{ row }">{{ fmtMoney(row.mealBudget) }}</template>
        </el-table-column>
        <el-table-column label="折扣" width="70" align="center">
          <template #default="{ row }">{{ (row.discount * 10).toFixed(1) }}折</template>
        </el-table-column>
        <el-table-column label="结算" width="80">
          <template #default="{ row }">{{ row.settlementType === 'MONTHLY' ? '月结' : '单结' }}</template>
        </el-table-column>
        <el-table-column label="状态" width="80">
          <template #default="{ row }">
            <el-tag size="small" :type="row.status === 'ACTIVE' ? 'success' : 'info'">
              {{ row.status === 'ACTIVE' ? '生效中' : '已到期' }}
            </el-tag>
          </template>
        </el-table-column>
      </el-table>
      <el-form inline>
        <el-form-item label="新合同">
          <el-input v-model="contractForm.title" placeholder="合同名称" style="width:170px" />
        </el-form-item>
        <el-form-item>
          <el-input-number v-model="contractForm.mealBudget" :min="10" :max="200" placeholder="餐标" style="width:110px" />
        </el-form-item>
        <el-form-item>
          <el-input-number v-model="contractForm.discount" :min="0.5" :max="1" :step="0.05" style="width:110px" />
        </el-form-item>
        <el-form-item>
          <el-select v-model="contractForm.settlementType" style="width:100px">
            <el-option label="月结" value="MONTHLY" />
            <el-option label="单结" value="PER_ORDER" />
          </el-select>
        </el-form-item>
        <el-form-item>
          <el-button type="primary" size="small" @click="saveContract">创建</el-button>
        </el-form-item>
      </el-form>
    </el-dialog>

    <!-- 门店编辑 -->
    <el-dialog v-model="storeVisible" title="编辑门店" width="420px">
      <el-form label-width="100px">
        <el-form-item label="团餐日产能">
          <el-input-number v-model="storeForm.dailyCapacity" :min="10" :max="1000" />
        </el-form-item>
        <el-form-item label="编制人数">
          <el-input-number v-model="storeForm.staffCount" :min="1" :max="50" />
        </el-form-item>
        <el-form-item label="营业状态">
          <el-switch v-model="storeForm.status" active-value="OPEN" inactive-value="CLOSED"
            active-text="营业" inactive-text="暂停" />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="storeVisible = false">取消</el-button>
        <el-button type="primary" @click="saveStore">保存</el-button>
      </template>
    </el-dialog>

    <!-- 新增用户 -->
    <el-dialog v-model="userVisible" title="新增账号" width="420px">
      <el-form label-width="90px">
        <el-form-item label="用户名"><el-input v-model="userForm.username" /></el-form-item>
        <el-form-item label="姓名"><el-input v-model="userForm.name" /></el-form-item>
        <el-form-item label="角色">
          <el-select v-model="userForm.role" style="width:100%">
            <el-option v-for="(v, k) in ROLE_NAMES" :key="k" :label="v" :value="k" />
          </el-select>
        </el-form-item>
        <el-form-item v-if="userForm.role === 'ENTERPRISE'" label="所属企业">
          <el-select v-model="userForm.enterpriseId" style="width:100%">
            <el-option v-for="e in enterprises" :key="e.id" :label="e.name" :value="e.id" />
          </el-select>
        </el-form-item>
        <el-form-item v-if="userForm.role === 'STORE'" label="所属门店">
          <el-select v-model="userForm.storeId" style="width:100%">
            <el-option v-for="s in stores" :key="s.id" :label="s.name" :value="s.id" />
          </el-select>
        </el-form-item>
        <el-form-item label="初始密码"><el-input v-model="userForm.password" placeholder="默认 123456" /></el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="userVisible = false">取消</el-button>
        <el-button type="primary" @click="saveUser">创建</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<script setup lang="ts">
import { onMounted, reactive, ref } from 'vue'
import { ElMessage } from 'element-plus'
import http from '../api/http'
import { CATEGORIES, TEMP_ZONES, ROLE_NAMES, fmtTime, fmtMoney } from '../utils/dict'

const tab = ref('enterprises')
const enterprises = ref<any[]>([])
const stores = ref<any[]>([])
const products = ref<any[]>([])
const users = ref<any[]>([])
const suppliers = ref<any[]>([])
const supplierDeliveries = ref<any[]>([])

const contractVisible = ref(false)
const currentEnterprise = ref<any>(null)
const contracts = ref<any[]>([])
const contractForm = reactive<any>({
  title: '', mealBudget: 30, discount: 0.95, settlementType: 'MONTHLY',
  startDate: '2026-01-01', endDate: '2026-12-31', status: 'ACTIVE',
})

const storeVisible = ref(false)
const storeForm = reactive<any>({ id: 0, dailyCapacity: 100, staffCount: 5, status: 'OPEN' })

const userVisible = ref(false)
const userForm = reactive<any>({ username: '', name: '', role: 'ENTERPRISE', enterpriseId: null, storeId: null, password: '' })

const enterpriseName = (id: number) => enterprises.value.find((e) => e.id === id)?.name || `#${id}`
const storeName = (id: number) => stores.value.find((s) => s.id === id)?.name || `#${id}`

async function load() {
  const [e, s, p, u, sp, sd]: any[] = await Promise.all([
    http.get('/enterprises'), http.get('/stores'), http.get('/products'),
    http.get('/users'), http.get('/suppliers'), http.get('/suppliers/deliveries'),
  ])
  enterprises.value = e
  stores.value = s
  products.value = p
  users.value = u
  suppliers.value = sp
  supplierDeliveries.value = sd
}

async function openContracts(row: any) {
  currentEnterprise.value = row
  const detail: any = await http.get(`/enterprises/${row.id}`)
  contracts.value = detail.contracts || []
  contractVisible.value = true
}

async function saveContract() {
  if (!contractForm.title) {
    ElMessage.warning('请填写合同名称')
    return
  }
  await http.post(`/enterprises/${currentEnterprise.value.id}/contracts`, { ...contractForm })
  ElMessage.success('合同已创建')
  openContracts(currentEnterprise.value)
}

function openStoreEdit(row: any) {
  Object.assign(storeForm, {
    id: row.id, dailyCapacity: row.dailyCapacity, staffCount: row.staffCount, status: row.status,
  })
  storeVisible.value = true
}

async function saveStore() {
  await http.put(`/stores/${storeForm.id}`, { ...storeForm })
  ElMessage.success('门店已更新')
  storeVisible.value = false
  load()
}

function openUserCreate() {
  userVisible.value = true
}

async function saveUser() {
  if (!userForm.username || !userForm.name) {
    ElMessage.warning('请填写用户名与姓名')
    return
  }
  await http.post('/users', { ...userForm })
  ElMessage.success('账号已创建')
  userVisible.value = false
  load()
}

onMounted(load)
</script>

<style scoped>
.sub-block { margin-bottom: 8px; }
</style>
