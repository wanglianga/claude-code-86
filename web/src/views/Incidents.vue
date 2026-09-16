<template>
  <div class="page">
    <div class="page-title">异常工单 · 多角色同一团餐单协同</div>
    <div class="panel">
      <div style="display:flex; gap:10px; margin-bottom:12px">
        <el-select v-model="filterStatus" placeholder="全部状态" clearable style="width:140px" @change="load">
          <el-option v-for="(v, k) in INCIDENT_STATUS" :key="k" :label="v.name" :value="k" />
        </el-select>
        <el-select v-model="filterType" placeholder="全部类型" clearable style="width:160px" @change="load">
          <el-option v-for="(v, k) in INCIDENT_TYPES" :key="k" :label="v" :value="k" />
        </el-select>
      </div>
      <el-table :data="list" size="small" border @row-click="openDetail" style="cursor:pointer">
        <el-table-column prop="ticketNo" label="工单号" width="170" class-name="mono" />
        <el-table-column label="团餐单" width="150">
          <template #default="{ row }">
            <el-link type="primary" @click.stop="$router.push(`/orders/${row.orderId}`)">
              {{ row.order?.orderNo }}
            </el-link>
          </template>
        </el-table-column>
        <el-table-column label="类型" width="120">
          <template #default="{ row }">{{ INCIDENT_TYPES[row.type] }}</template>
        </el-table-column>
        <el-table-column prop="title" label="标题" min-width="150" show-overflow-tooltip />
        <el-table-column label="优先级" width="80">
          <template #default="{ row }">
            <el-tag size="small" :type="PRIORITIES[row.priority]?.type as any">{{ PRIORITIES[row.priority]?.name }}</el-tag>
          </template>
        </el-table-column>
        <el-table-column label="状态" width="90">
          <template #default="{ row }">
            <el-tag size="small" :type="INCIDENT_STATUS[row.status]?.type as any">{{ INCIDENT_STATUS[row.status]?.name }}</el-tag>
          </template>
        </el-table-column>
        <el-table-column label="赔付" width="100" align="right">
          <template #default="{ row }">
            <span v-if="Number(row.compensation) > 0" class="danger-text">
              {{ fmtMoney(row.compensation) }}{{ row.compensationConfirmed ? '✓' : '(待财务)' }}
            </span>
            <span v-else>-</span>
          </template>
        </el-table-column>
        <el-table-column label="创建时间" width="150">
          <template #default="{ row }">{{ fmtTime(row.createdAt) }}</template>
        </el-table-column>
      </el-table>
    </div>

    <el-drawer v-model="drawer" size="560px" :title="`工单 ${detail?.ticketNo || ''}`">
      <div v-if="detail">
        <el-descriptions :column="2" border size="small" style="margin-bottom:14px">
          <el-descriptions-item label="类型">{{ INCIDENT_TYPES[detail.type] }}</el-descriptions-item>
          <el-descriptions-item label="优先级">
            <el-tag size="small" :type="PRIORITIES[detail.priority]?.type as any">{{ PRIORITIES[detail.priority]?.name }}</el-tag>
          </el-descriptions-item>
          <el-descriptions-item label="状态">
            <el-tag size="small" :type="INCIDENT_STATUS[detail.status]?.type as any">{{ INCIDENT_STATUS[detail.status]?.name }}</el-tag>
          </el-descriptions-item>
          <el-descriptions-item label="赔付">
            {{ Number(detail.compensation) > 0 ? fmtMoney(detail.compensation) : '-' }}
            <el-tag v-if="detail.compensationConfirmed" type="success" size="small">财务已确认</el-tag>
          </el-descriptions-item>
          <el-descriptions-item label="团餐单" :span="2">
            <el-link type="primary" @click="$router.push(`/orders/${detail.orderId}`)">
              {{ detail.order?.orderNo }}（{{ detail.order?.headcount }} 人）
            </el-link>
          </el-descriptions-item>
          <el-descriptions-item label="描述" :span="2">{{ detail.description }}</el-descriptions-item>
          <el-descriptions-item v-if="detail.resolution" label="处理结论" :span="2">
            <span class="ok-text">{{ detail.resolution }}</span>
          </el-descriptions-item>
        </el-descriptions>

        <div class="panel-title" style="margin-bottom:10px">协同处理时间线</div>
        <el-timeline style="padding-left:4px; margin-bottom:14px">
          <el-timeline-item v-for="log in detail.logs" :key="log.id" :timestamp="fmtTime(log.createdAt)" placement="top">
            <div>
              <el-tag size="small" effect="plain">{{ log.actorRole }}</el-tag>
              <b style="margin:0 6px">{{ log.actorName }}</b>
              <span class="muted">{{ ACTION_NAMES[log.action] || log.action }}</span>
            </div>
            <div v-if="log.note" style="margin-top:4px; font-size:13px">{{ log.note }}</div>
          </el-timeline-item>
        </el-timeline>

        <template v-if="!['CLOSED'].includes(detail.status)">
          <div class="panel-title" style="margin-bottom:10px">处理动作（{{ auth.user?.roleName }}）</div>
          <el-input v-model="note" type="textarea" :rows="2" placeholder="处理说明 / 协同留言" style="margin-bottom:10px" />
          <div style="display:flex; gap:8px; flex-wrap:wrap">
            <el-button size="small" @click="act('COMMENT')">留言</el-button>
            <el-button v-if="detail.status === 'OPEN'" size="small" type="primary" @click="act('CLAIM')">受理</el-button>
            <el-button v-if="['SERVICE', 'ADMIN'].includes(auth.role)" size="small" type="warning"
              @click="compensateVisible = true">提出赔付</el-button>
            <el-button v-if="['FINANCE', 'ADMIN'].includes(auth.role) && Number(detail.compensation) > 0 && !detail.compensationConfirmed"
              size="small" type="success" @click="act('COMPENSATE_CONFIRM')">财务确认赔付</el-button>
            <el-button v-if="['SERVICE', 'ADMIN', 'ENTERPRISE'].includes(auth.role) && detail.type === 'HEADCOUNT_CHANGE'"
              size="small" @click="headcountVisible = true">调整人数</el-button>
            <el-button size="small" type="success" plain @click="act('RESOLVE')">办结</el-button>
            <el-button size="small" type="info" plain @click="act('CLOSE')">关闭</el-button>
          </div>
        </template>
      </div>
    </el-drawer>

    <el-dialog v-model="compensateVisible" title="提出赔付方案" width="360px">
      <el-input-number v-model="compensation" :min="0" :max="100000" style="width:100%" />
      <div class="muted" style="margin-top:6px">提交后需财务确认才会计入档案赔付</div>
      <template #footer>
        <el-button @click="compensateVisible = false">取消</el-button>
        <el-button type="warning" @click="proposeCompensate">提交</el-button>
      </template>
    </el-dialog>

    <el-dialog v-model="headcountVisible" title="调整团餐人数" width="360px">
      <el-input-number v-model="newHeadcount" :min="1" :max="500" style="width:100%" />
      <template #footer>
        <el-button @click="headcountVisible = false">取消</el-button>
        <el-button type="primary" @click="adjustHeadcount">确认调整</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<script setup lang="ts">
import { onMounted, ref } from 'vue'
import { useRoute } from 'vue-router'
import { ElMessage } from 'element-plus'
import http from '../api/http'
import { useAuthStore } from '../stores/auth'
import { INCIDENT_TYPES, INCIDENT_STATUS, PRIORITIES, fmtTime, fmtMoney } from '../utils/dict'

const ACTION_NAMES: Record<string, string> = {
  CREATED: '创建工单', COMMENT: '留言', CLAIM: '受理',
  COMPENSATE_PROPOSE: '提出赔付', COMPENSATE_CONFIRM: '财务确认赔付',
  ADJUST_ORDER: '调整人数', RESOLVE: '办结', CLOSE: '关闭',
}

const auth = useAuthStore()
const route = useRoute()
const list = ref<any[]>([])
const filterStatus = ref('')
const filterType = ref('')
const drawer = ref(false)
const detail = ref<any>(null)
const note = ref('')
const compensateVisible = ref(false)
const compensation = ref(0)
const headcountVisible = ref(false)
const newHeadcount = ref(0)

async function load() {
  const params: any = {}
  if (filterStatus.value) params.status = filterStatus.value
  if (filterType.value) params.type = filterType.value
  list.value = await http.get('/incidents', { params })
}

async function openDetail(row: any) {
  detail.value = await http.get(`/incidents/${row.id}`)
  newHeadcount.value = detail.value.order?.headcount || 0
  drawer.value = true
}

async function act(action: string, extra: any = {}) {
  await http.post(`/incidents/${detail.value.id}/action`, { action, note: note.value, ...extra })
  ElMessage.success('已处理')
  note.value = ''
  detail.value = await http.get(`/incidents/${detail.value.id}`)
  load()
}

async function proposeCompensate() {
  await act('COMPENSATE_PROPOSE', { compensation: compensation.value })
  compensateVisible.value = false
}

async function adjustHeadcount() {
  await act('ADJUST_ORDER', { headcount: newHeadcount.value })
  headcountVisible.value = false
}

onMounted(async () => {
  await load()
  if (route.query.focus) {
    const id = Number(route.query.focus)
    const row = list.value.find((x) => x.id === id)
    if (row) openDetail(row)
    else {
      detail.value = await http.get(`/incidents/${id}`)
      drawer.value = true
    }
  }
})
</script>
