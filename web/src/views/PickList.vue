<template>
  <div class="page">
    <div class="page-title">
      拣货清单（含临时追加）
      <el-button size="small" style="margin-left:12px" @click="load">刷新</el-button>
      <el-tag v-if="data?.pendingLabelCount" type="danger" effect="dark" style="margin-left:8px">
        待贴特殊餐标 {{ data.pendingLabelCount }} 枚
      </el-tag>
      <el-tag v-if="data?.topUpOrderCount" type="warning" effect="plain" style="margin-left:6px">
        {{ data.topUpOrderCount }} 单含临时加餐
      </el-tag>
    </div>

    <el-alert type="warning" :closable="false" show-icon
      title="临时追加餐食已自动同步到本清单（橙色追加行）；含素食/过敏的追加餐必须按企业名单逐份重新贴标，贴标后在订单详情中确认，避免漏贴某一类特殊餐标。"
      style="margin-bottom:12px" />

    <!-- 临期鲜食优先调拨：逐份标记 -->
    <div v-if="offerTickets.length" class="panel" style="margin-bottom:14px; border-color:#f0d9a8">
      <div class="panel-title">
        临期鲜食优先调拨 · 逐份餐食标记
        <el-tag size="small" type="warning" effect="dark" style="margin-left:6px">
          {{ offerTickets.length }} 单 / {{ offerTickets.reduce((s:number,t:any)=>s+t.totalQuantity,0) }} 份
        </el-tag>
      </div>
      <el-alert type="warning" :closable="false" show-icon
        title="以下餐食为企业已确认的临期调拨折扣餐，必须逐份贴「临期调拨」标签（含折扣原因、温控与售后规则），提醒企业送达后 2 小时内食用；临期不等于质量问题。"
        style="margin-bottom:10px" />
      <div v-for="f in offerTickets" :key="f.offerId" class="offer-pick-card">
        <div class="pick-head">
          <el-link type="primary" @click="$router.push(`/orders/${f.orderId}`)">{{ f.orderNo }}</el-link>
          <span class="mono">{{ f.offerNo }}</span>
          <el-tag size="small" type="info">{{ fmtTime(f.deliverAt) }} 送达</el-tag>
          <el-tag size="small" type="warning" effect="dark">临期 {{ f.totalQuantity }} 份 · 省 {{ fmtMoney(f.savingAmount) }}</el-tag>
          <el-tag v-if="f.labelConfirmed" size="small" type="success" style="margin-left:auto">已逐份贴标</el-tag>
          <el-button v-else size="small" type="warning" style="margin-left:auto" @click="confirmOfferLabel(f)">
            逐份贴标确认（{{ f.totalQuantity }} 枚）
          </el-button>
        </div>
        <el-table :data="f.items" size="small" border style="margin:6px 0">
          <el-table-column prop="productName" label="商品" min-width="150" />
          <el-table-column prop="batchNo" label="批次号" width="110" class-name="mono" />
          <el-table-column prop="sourceStoreName" label="来源门店" min-width="140" />
          <el-table-column label="温控" width="70" align="center">
            <template #default="{ row }">{{ TEMP_ZONE_NAME[row.tempZone] }}</template>
          </el-table-column>
          <el-table-column prop="quantity" label="份数" width="60" align="center" />
          <el-table-column label="折扣" width="70" align="center">
            <template #default="{ row }">
              <el-tag size="small" type="warning" effect="dark">{{ Math.round(row.discountRate * 10) }}折</el-tag>
            </template>
          </el-table-column>
        </el-table>
        <div class="muted" style="font-size:12px; margin-bottom:4px">
          温控：{{ f.tempControl?.requirement }}；{{ f.tempControl?.deliverTemp }}；{{ f.tempControl?.note }}
        </div>
        <div class="label-chips">
          <el-tooltip v-for="p in f.portions" :key="p.code" placement="top" :show-after="150">
            <template #content>
              <div style="max-width:300px; line-height:1.7">
                <div>批次 {{ p.batchNo }} · 到期 {{ fmtTime(p.expiresAt) }} · 建议食用前 {{ fmtTime(p.eatBefore) }}</div>
                <div>{{ p.discountReason }}</div>
              </div>
            </template>
            <el-tag size="small" type="warning" effect="dark" style="margin:2px">{{ p.code }}</el-tag>
          </el-tooltip>
        </div>
        <div v-if="f.labelConfirmed" class="ok-text" style="font-size:12px; margin-top:4px">
          {{ f.labelNote }} · {{ fmtTime(f.labelledAt) }}
        </div>
      </div>
    </div>

    <div v-for="t in data?.tickets || []" :key="t.orderId" class="panel pick-card"
      :class="{ 'has-topup': t.topUpCount > 0 }">
      <div class="pick-head">
        <el-link type="primary" @click="$router.push(`/orders/${t.orderId}`)">{{ t.orderNo }}</el-link>
        <span class="muted">联系人 {{ t.enterprise }}</span>
        <el-tag size="small" type="info">{{ fmtTime(t.deliverAt) }} 送达</el-tag>
        <el-tag size="small">总 {{ t.headcount }} 份</el-tag>
        <el-tag v-if="t.topUpCount" size="small" type="danger" effect="dark">
          临时追加 +{{ t.topUpQty }} 份（{{ t.topUpCount }} 次）
        </el-tag>
        <el-tag v-if="t.pendingLabels" size="small" type="warning" effect="dark" style="margin-left:auto">
          待贴标 {{ t.pendingLabels }} 枚
        </el-tag>
      </div>

      <el-table :data="t.rows" size="small" border style="margin:8px 0">
        <el-table-column prop="name" label="商品" min-width="160" />
        <el-table-column label="品类" width="90">
          <template #default="{ row }">{{ CATEGORIES[row.category] }}</template>
        </el-table-column>
        <el-table-column prop="baseQty" label="原单数量" width="90" align="center" />
        <el-table-column label="临时追加" width="90" align="center">
          <template #default="{ row }">
            <span v-if="row.topUpQty" class="topup-qty">+{{ row.topUpQty }}</span>
            <span v-else class="muted">-</span>
          </template>
        </el-table-column>
        <el-table-column prop="quantity" label="合计拣货" width="90" align="center">
          <template #default="{ row }"><b>{{ row.quantity }}</b></template>
        </el-table-column>
        <el-table-column label="临期" width="80" align="center">
          <template #default="{ row }">
            <el-tag v-if="row.nearExpiryQty" size="small" type="warning">{{ row.nearExpiryQty }}</el-tag>
            <span v-else class="muted">-</span>
          </template>
        </el-table-column>
        <el-table-column label="素" width="60" align="center">
          <template #default="{ row }">
            <el-tag v-if="row.vegetarian" size="small" type="success" effect="plain">素</el-tag>
          </template>
        </el-table-column>
      </el-table>

      <div v-for="g in t.labelGroups" :key="g.topUpId" class="label-group">
        <div class="label-group-head">
          <span class="mono">{{ g.topUpNo }}</span>
          <el-tag size="small" :type="g.status === 'CONFIRMED' ? 'danger' : 'success'">
            {{ g.status === 'CONFIRMED' ? '待贴标' : '已贴标' }}
          </el-tag>
          <span class="muted">追加 {{ g.addHeadcount }} 份，特殊餐标 {{ g.labels.length }} 枚</span>
          <el-button v-if="g.status === 'CONFIRMED'" size="small" type="warning"
            @click="$router.push(`/orders/${t.orderId}`)">去贴标确认</el-button>
          <span v-else class="ok-text" style="margin-left:auto">{{ g.labelNote || '已完成贴标' }} · {{ fmtTime(g.labelledAt) }}</span>
        </div>
        <div class="label-chips">
          <el-tag v-for="l in g.labels" :key="l.labelCode" size="small"
            :type="l.tag === '素食' ? 'success' : 'danger'" effect="dark" style="margin:2px">
            {{ l.labelCode }} · {{ l.name }} · {{ l.tag }} · {{ l.productName }}
          </el-tag>
        </div>
      </div>
    </div>

    <div v-if="data && !data.tickets.length" class="panel muted" style="padding:30px; text-align:center">
      当前没有待拣货的团餐单
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { ElMessage } from 'element-plus'
import http from '../api/http'
import { CATEGORIES, TEMP_ZONE_NAME, fmtTime, fmtMoney } from '../utils/dict'

const data = ref<any>(null)
const offerList = ref<any[]>([])
const offerTickets = computed(() =>
  offerList.value.filter(f => ['CONFIRMED', 'FULFILLED'].includes(f.status)))

async function load() {
  const [pl, offers]: any[] = await Promise.all([
    http.get('/topups/picklist'),
    http.get('/near-expiry/pick-offers'),
  ])
  data.value = pl
  offerList.value = offers
}

async function confirmOfferLabel(f: any) {
  await http.post(`/near-expiry/offers/${f.offerId}/label`, { labelledQty: f.totalQuantity })
  ElMessage.success('已逐份贴齐临期标记')
  load()
}

onMounted(load)
</script>

<style scoped>
.pick-card { margin-bottom: 14px; }
.pick-card.has-topup { border-color: #f0a020; }
.pick-head { display: flex; align-items: center; gap: 10px; flex-wrap: wrap; }
.topup-qty { color: #e6a23c; font-weight: 700; }
.label-group { background: #fff8f0; border: 1px dashed #f0a020; border-radius: 6px; padding: 8px; margin-top: 8px; }
.label-group-head { display: flex; align-items: center; gap: 8px; font-size: 13px; margin-bottom: 4px; }
.label-chips { line-height: 2; }
.offer-pick-card { border: 1px solid #f0d9a8; background: #fefbf4; border-radius: 8px; padding: 10px; margin-bottom: 10px; }
</style>
