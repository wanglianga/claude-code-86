<template>
  <div class="page">
    <div class="page-title">
      {{ pageTitle }}
      <el-button size="small" style="margin-left:12px" @click="load">刷新</el-button>
      <el-tag type="warning" effect="dark" style="margin-left:8px">临期鲜食 · 优先调拨 · 企业确认</el-tag>
    </div>

    <!-- 平台/客服/门店：临期池与推荐候选 -->
    <div v-if="['ADMIN', 'SERVICE', 'STORE'].includes(auth.role)" class="panel" v-loading="loading">
      <el-tabs v-model="tab">
        <el-tab-pane label="可推荐团餐单" name="candidates">
          <el-alert type="warning" :closable="false" show-icon style="margin-bottom:10px"
            title="门店便当等鲜食即将临期、但送达时仍在保质期内并覆盖团餐集中用餐时间窗（送达后至少可食用 15 分钟）时，平台据此推荐分档折扣（5/6/7 折）给企业行政。企业接受后批次/折扣/温控/售后责任写入团餐单并逐份贴标。" />
          <el-table :data="pool.candidates" size="small" border>
            <el-table-column prop="orderNo" label="团餐单" width="150" class-name="mono">
              <template #default="{ row }">
                <el-link type="primary" @click="$router.push(`/orders/${row.orderId}`)">{{ row.orderNo }}</el-link>
              </template>
            </el-table-column>
            <el-table-column v-if="auth.role !== 'STORE'" prop="enterpriseName" label="企业" min-width="140" />
            <el-table-column prop="storeName" label="门店" min-width="130" />
            <el-table-column label="送达时间" width="150">
              <template #default="{ row }">{{ fmtTime(row.deliverAt) }}</template>
            </el-table-column>
            <el-table-column label="可调拨临期份" width="120" align="center">
              <template #default="{ row }">
                <el-tag type="warning" effect="dark">{{ row.nearExpiryQty }} 份</el-tag>
              </template>
            </el-table-column>
            <el-table-column label="预计企业节省" width="120" align="right">
              <template #default="{ row }">{{ fmtMoney(row.estimatedSavings) }}</template>
            </el-table-column>
            <el-table-column label="方案状态" width="110">
              <template #default="{ row }">
                <el-tag v-if="row.offerStatus" size="small" :type="NEAR_EXPIRY_OFFER_STATUS[row.offerStatus]?.type as any">
                  {{ NEAR_EXPIRY_OFFER_STATUS[row.offerStatus]?.name }}
                </el-tag>
                <span v-else class="muted">未推荐</span>
              </template>
            </el-table-column>
            <el-table-column label="操作" width="180" align="center">
              <template #default="{ row }">
                <el-button v-if="row.offerId" size="small" @click="openOffer(row.offerId)">查看方案</el-button>
                <el-button v-if="['ADMIN', 'SERVICE'].includes(auth.role)" size="small" type="warning"
                  :disabled="!!row.offerId" @click="recommend(row)">
                  {{ row.offerId ? '已生成方案' : '推荐折扣方案' }}
                </el-button>
              </template>
            </el-table-column>
          </el-table>
          <div v-if="!pool.candidates?.length" class="muted" style="padding:20px; text-align:center">
            当前没有“即将临期但仍符合团餐时间要求”的可推荐团餐单
          </div>
        </el-tab-pane>

        <el-tab-pane :label="`临期批次池（${pool.batches?.length || 0}）`" name="batches">
          <el-table :data="pool.batches" size="small" border>
            <el-table-column prop="batchNo" label="批次号" width="140" class-name="mono" />
            <el-table-column prop="productName" label="商品" min-width="140" />
            <el-table-column prop="storeName" label="门店" min-width="130" />
            <el-table-column label="温控" width="80">
              <template #default="{ row }"><el-tag size="small" effect="plain">{{ row.tempZoneName }}</el-tag></template>
            </el-table-column>
            <el-table-column prop="quantity" label="在架" width="70" align="center" />
            <el-table-column label="到期时间 / 剩余" width="220">
              <template #default="{ row }">
                {{ fmtTime(row.expiresAt) }}
                <el-tag size="small" type="danger" effect="plain" style="margin-left:4px">
                  {{ row.remainingMin >= 60 ? `${(row.remainingMin / 60).toFixed(1)}h` : `${row.remainingMin}分` }}
                </el-tag>
              </template>
            </el-table-column>
          </el-table>
        </el-tab-pane>

        <el-tab-pane label="折扣方案记录" name="offers">
          <offers-grid :offers="offers" @open="openOffer" />
        </el-tab-pane>
      </el-tabs>
    </div>

    <!-- 企业：待确认 + 记录 + 附件 -->
    <div v-if="auth.role === 'ENTERPRISE'" class="panel">
      <el-tabs v-model="tab">
        <el-tab-pane :label="`待确认折扣方案（${offers.filter(o => o.status === 'PROPOSED').length}）`" name="proposed">
          <el-table :data="offers.filter(o => o.status === 'PROPOSED')" size="small" border>
            <el-table-column prop="offerNo" label="方案号" width="140" class-name="mono" />
            <el-table-column prop="orderNo" label="团餐单" width="150" class-name="mono">
              <template #default="{ row }">
                <el-link type="primary" @click="$router.push(`/orders/${row.orderId}`)">{{ row.orderNo }}</el-link>
              </template>
            </el-table-column>
            <el-table-column prop="storeName" label="供餐门店" min-width="130" />
            <el-table-column label="临期份" width="90" align="center">
              <template #default="{ row }"><el-tag type="warning" effect="dark" size="small">{{ row.nearExpiryQty }} 份</el-tag></template>
            </el-table-column>
            <el-table-column label="折后应付" width="110" align="right">
              <template #default="{ row }"><b class="brand-text">{{ fmtMoney(row.offerAmount) }}</b></template>
            </el-table-column>
            <el-table-column label="为企业节省" width="110" align="right">
              <template #default="{ row }"><span class="ok-text">{{ fmtMoney(row.savingsAmount) }}</span></template>
            </el-table-column>
            <el-table-column label="操作" width="160" align="center">
              <template #default="{ row }">
                <el-button size="small" type="primary" @click="openOffer(row.id)">查看并确认</el-button>
              </template>
            </el-table-column>
          </el-table>
          <div v-if="!offers.filter(o => o.status === 'PROPOSED').length" class="muted" style="padding:20px; text-align:center">
            暂无待确认的临期折扣方案
          </div>
        </el-tab-pane>
        <el-tab-pane label="我的确认记录" name="offers">
          <offers-grid :offers="offers" @open="openOffer" />
        </el-tab-pane>
        <el-tab-pane label="月结附件（企业确认）" name="attachments">
          <attachments-grid :attachments="attachments" @open="openAttachment" />
        </el-tab-pane>
      </el-tabs>
    </div>

    <!-- 财务：月结附件 -->
    <div v-if="auth.role === 'FINANCE'" class="panel">
      <el-tabs v-model="tab">
        <el-tab-pane label="月结附件（临期调拨企业确认）" name="attachments">
          <el-alert type="info" :closable="false" show-icon style="margin-bottom:10px"
            title="企业对临期调拨折扣方案的在线确认自动归档为月结附件；财务归集月结单时自动挂入账期，同时作为后续售后说明依据（临期≠质量问题）。" />
          <attachments-grid :attachments="attachments" @open="openAttachment" />
        </el-tab-pane>
        <el-tab-pane label="折扣方案记录" name="offers">
          <offers-grid :offers="offers" @open="openOffer" />
        </el-tab-pane>
      </el-tabs>
    </div>

    <!-- ===== 方案详情 ===== -->
    <el-dialog v-model="offerVisible" title="临期鲜食优先调拨 · 折扣方案" width="900px" top="5vh">
      <div v-if="offer" class="offer-detail">
        <div class="offer-head">
          <b class="mono">{{ offer.offerNo }}</b>
          <el-tag :type="NEAR_EXPIRY_OFFER_STATUS[offer.status]?.type as any">
            {{ NEAR_EXPIRY_OFFER_STATUS[offer.status]?.name }}
          </el-tag>
          <el-link type="primary" @click="$router.push(`/orders/${offer.orderId}`)">团餐单 {{ offer.orderNo }}</el-link>
          <span class="muted" style="margin-left:auto">推荐 {{ fmtTime(offer.createdAt) }}</span>
        </div>

        <el-alert type="warning" :closable="false" show-icon style="margin:10px 0"
          :title="`折扣原因：${offer.discountReason}`" />

        <div class="subblock">
          <div class="sub-title">团餐时间窗校验（仍符合团餐时间要求）</div>
          <el-table :data="offer.groupMealWindow?.batches || []" size="small" border>
            <el-table-column prop="batchNo" label="批次" width="120" class-name="mono" />
            <el-table-column prop="productName" label="商品" min-width="130" />
            <el-table-column label="温区" width="80">
              <template #default="{ row }">{{ TEMP_ZONES_LABEL[row.tempZone] }}</template>
            </el-table-column>
            <el-table-column label="批次到期" width="150">
              <template #default="{ row }">{{ fmtTime(row.expiresAt) }}</template>
            </el-table-column>
            <el-table-column label="送达后剩余" width="130" align="center">
              <template #default="{ row }">
                <el-tag size="small" type="warning">
                  {{ Math.floor(row.remainingMinAtDelivery / 60) }}h{{ row.remainingMinAtDelivery % 60 }}分
                </el-tag>
              </template>
            </el-table-column>
            <el-table-column label="符合团餐窗" width="100" align="center">
              <template #default><el-tag size="small" type="success">是</el-tag></template>
            </el-table-column>
          </el-table>
        </div>

        <div class="subblock">
          <div class="sub-title">商品批次与折扣（接受后写入团餐单）</div>
          <el-table :data="offer.items" size="small" border>
            <el-table-column prop="name" label="商品" min-width="140" />
            <el-table-column prop="quantity" label="总份数" width="70" align="center" />
            <el-table-column label="临期份" width="80" align="center">
              <template #default="{ row }">
                <el-tag v-if="row.nearExpiryQty" size="small" type="warning" effect="dark">{{ row.nearExpiryQty }}</el-tag>
                <span v-else class="muted">0</span>
              </template>
            </el-table-column>
            <el-table-column label="出库批次 / 折扣" min-width="240">
              <template #default="{ row }">
                <el-tag v-for="b in row.batches" :key="b.batchId" size="small"
                  :type="b.near ? 'warning' : 'info'" :effect="b.near ? 'dark' : 'plain'" style="margin:2px">
                  <span class="mono">{{ b.batchNo }}</span>
                  ×{{ b.quantity }} · {{ b.near ? `${b.discountRate * 10} 折` : '原价' }}
                </el-tag>
              </template>
            </el-table-column>
            <el-table-column label="原价行金额" width="100" align="right">
              <template #default="{ row }">{{ fmtMoney(row.lineBaseAmount) }}</template>
            </el-table-column>
            <el-table-column label="折后行金额" width="100" align="right">
              <template #default="{ row }"><b class="brand-text">{{ fmtMoney(row.lineOfferAmount) }}</b></template>
            </el-table-column>
          </el-table>
          <div class="amount-bar">
            <span>折前应付 <b>{{ fmtMoney(offer.amountBefore) }}</b></span>
            <span class="muted">→</span>
            <span class="brand-text" style="font-size:18px">折后应付 {{ fmtMoney(offer.offerAmount) }}</span>
            <el-tag type="success" effect="dark">为企业节省 {{ fmtMoney(offer.savingsAmount) }}</el-tag>
            <span class="muted">共 {{ offer.nearExpiryQty }} / {{ offer.totalQty }} 份临期调拨</span>
          </div>
        </div>

        <div class="subblock">
          <div class="sub-title">
            临期调拨标记到每份餐食（{{ offer.units?.length || 0 }} 枚，企业端可见折扣原因与售后规则）
          </div>
          <el-table :data="pagedUnits" size="small" border max-height="220">
            <el-table-column prop="labelCode" label="份标签码" width="150" class-name="mono" />
            <el-table-column prop="productName" label="餐食" min-width="130" />
            <el-table-column prop="batchNo" label="批次" width="110" class-name="mono" />
            <el-table-column label="温区" width="70">
              <template #default="{ row }">{{ TEMP_ZONES_LABEL[row.tempZone] }}</template>
            </el-table-column>
            <el-table-column label="到期" width="140">
              <template #default="{ row }">{{ fmtTime(row.expiresAt) }}</template>
            </el-table-column>
            <el-table-column label="折后单价" width="90" align="right">
              <template #default="{ row }">{{ fmtMoney(row.paidUnitPrice) }}</template>
            </el-table-column>
            <el-table-column label="售后规则（贴标可见）" min-width="260" show-overflow-tooltip>
              <template #default="{ row }"><span class="muted">{{ row.afterSalesRule }}</span></template>
            </el-table-column>
          </el-table>
          <el-pagination v-if="offer.units?.length > unitPageSize" small layout="prev, pager, next"
            :total="offer.units.length" :page-size="unitPageSize" v-model:current-page="unitPage"
            style="margin-top:6px; justify-content:flex-end" />
        </div>

        <div class="subblock">
          <div class="sub-title">温控责任（出库 / 在途 / 签收测温）</div>
          <el-table :data="offer.tempControl?.zones || []" size="small" border>
            <el-table-column prop="zoneName" label="温区" width="80" />
            <el-table-column prop="outbound" label="出库温控" min-width="170" />
            <el-table-column prop="transit" label="在途温控" min-width="170" />
            <el-table-column prop="handover" label="签收测温" min-width="150" />
            <el-table-column prop="rejectRule" label="温控异常判定（按质量售后）" min-width="220" show-overflow-tooltip />
          </el-table>
          <div v-for="(r, i) in offer.tempControl?.rules || []" :key="i" class="rule-item">• {{ r }}</div>
        </div>

        <div class="subblock">
          <div class="sub-title">售后责任划分（企业确认后不可变，后续售后不能把临期误认为质量问题）</div>
          <div class="policy-box">
            <el-alert type="success" :closable="false" show-icon :title="offer.afterSalesPolicy?.nearExpiry?.title" style="margin-bottom:8px" />
            <div class="policy-line"><b>建议食用时限：</b>{{ offer.afterSalesPolicy?.nearExpiry?.serveDeadline }}</div>
            <div class="policy-line"><b>不认定为质量问题：</b></div>
            <div v-for="(x, i) in offer.afterSalesPolicy?.nearExpiry?.nonQuality || []" :key="'n'+i" class="rule-item muted">— {{ x }}</div>
            <div class="policy-line"><b>仍按质量售后覆盖：</b></div>
            <div v-for="(x, i) in offer.afterSalesPolicy?.nearExpiry?.qualityCovered || []" :key="'q'+i" class="rule-item ok-text">✓ {{ x }}</div>
            <div class="policy-line"><b>退换规则：</b>{{ offer.afterSalesPolicy?.nearExpiry?.exchangeRule }}</div>
            <div class="policy-line" style="margin-top:6px"><b>正常餐食：</b>{{ offer.afterSalesPolicy?.normal?.rule }}</div>
            <el-divider style="margin:8px 0" />
            <div class="muted policy-statement">{{ offer.afterSalesPolicy?.statement }}</div>
          </div>
        </div>

        <div class="subblock" v-if="offer.status !== 'PROPOSED'">
          <div class="sub-title">企业确认</div>
          <el-descriptions :column="2" border size="small">
            <el-descriptions-item label="确认人">{{ offer.acceptedByName || '—' }}</el-descriptions-item>
            <el-descriptions-item label="确认时间">{{ fmtTime(offer.acceptedAt) }}</el-descriptions-item>
            <el-descriptions-item label="确认说明" :span="2">{{ offer.acceptanceNote || '—' }}</el-descriptions-item>
            <el-descriptions-item v-if="offer.attachmentNo" label="月结附件号" :span="2">
              <el-link type="primary" @click="goAttachment(offer.attachmentId)">{{ offer.attachmentNo }}</el-link>
            </el-descriptions-item>
            <el-descriptions-item v-if="offer.status === 'REJECTED'" label="拒绝原因" :span="2">{{ offer.rejectReason }}</el-descriptions-item>
            <el-descriptions-item v-if="offer.status === 'FULFILLED'" label="履约时间" :span="2">
              {{ fmtTime(offer.fulfilledAt) }}（已随团餐单备货出库）
            </el-descriptions-item>
          </el-descriptions>
        </div>
      </div>

      <template #footer>
        <template v-if="offer?.status === 'PROPOSED' && auth.role === 'ENTERPRISE'">
          <el-checkbox v-model="acknowledged" style="margin-right:12px">
            我已知悉折扣原因、每份标记与售后规则（临期属性不认定为质量问题）
          </el-checkbox>
          <el-button @click="rejectVisible = true">拒绝（按正常方案）</el-button>
          <el-button type="primary" :disabled="!acknowledged" @click="doAccept">接受折扣方案并写入团餐单</el-button>
        </template>
        <template v-else-if="offer?.status === 'PROPOSED' && auth.role === 'ADMIN'">
          <el-button @click="offerVisible = false">关闭</el-button>
          <el-button type="primary" @click="$router.push(`/orders/${offer.orderId}`)">到团餐单联系企业</el-button>
        </template>
        <el-button v-else @click="offerVisible = false">关闭</el-button>
      </template>
    </el-dialog>

    <!-- 拒绝原因 -->
    <el-dialog v-model="rejectVisible" title="拒绝临期折扣方案" width="420px" append-to-body>
      <el-input v-model="rejectReasonText" type="textarea" :rows="3" placeholder="拒绝原因（可选，默认按正常方案履约）" />
      <template #footer>
        <el-button @click="rejectVisible = false">取消</el-button>
        <el-button type="warning" @click="doReject">确认拒绝</el-button>
      </template>
    </el-dialog>

    <!-- 月结附件详情 -->
    <el-dialog v-model="attachmentVisible" title="月结附件 · 临期调拨企业确认" width="760px" top="6vh" append-to-body>
      <div v-if="attachment">
        <div class="offer-head">
          <b class="mono">{{ attachment.attachmentNo }}</b>
          <el-tag size="small" type="success" effect="dark">企业已确认</el-tag>
          <el-link type="primary" @click="$router.push(`/orders/${attachment.orderId}`)">{{ attachment.orderNo }}</el-link>
          <span class="muted" style="margin-left:auto">账期 {{ attachment.month }}</span>
        </div>
        <el-descriptions :column="2" border size="small" style="margin-top:10px">
          <el-descriptions-item label="方案号">{{ attachment.snapshot.offerNo }}</el-descriptions-item>
          <el-descriptions-item label="确认人/时间">
            {{ attachment.snapshot.acceptedBy }} · {{ fmtTime(attachment.snapshot.acceptedAt) }}
          </el-descriptions-item>
          <el-descriptions-item label="临期份数">
            {{ attachment.snapshot.nearExpiryQty }} / {{ attachment.snapshot.totalQty }} 份
          </el-descriptions-item>
          <el-descriptions-item label="折扣金额">
            {{ fmtMoney(attachment.snapshot.amountBefore) }} → <b class="brand-text">{{ fmtMoney(attachment.snapshot.offerAmount) }}</b>
            （节省 {{ fmtMoney(attachment.snapshot.savingsAmount) }}）
          </el-descriptions-item>
          <el-descriptions-item label="确认说明" :span="2">{{ attachment.snapshot.acceptanceNote }}</el-descriptions-item>
          <el-descriptions-item label="折扣原因" :span="2">{{ attachment.snapshot.discountReason }}</el-descriptions-item>
        </el-descriptions>
        <div class="subblock">
          <div class="sub-title">售后说明（随附件留存）</div>
          <div class="policy-box muted">{{ attachment.snapshot.afterSalesPolicy?.statement }}</div>
        </div>
        <div class="subblock">
          <div class="sub-title">每份餐食标记（{{ attachment.snapshot.units?.length || 0 }} 枚）</div>
          <el-table :data="attachment.snapshot.units || []" size="small" border max-height="220">
            <el-table-column prop="labelCode" label="份标签码" width="150" class-name="mono" />
            <el-table-column prop="productName" label="餐食" min-width="130" />
            <el-table-column prop="batchNo" label="批次" width="110" class-name="mono" />
            <el-table-column label="折后单价" width="90" align="right">
              <template #default="{ row }">{{ fmtMoney(row.paidUnitPrice) }}</template>
            </el-table-column>
            <el-table-column label="到期时间" width="140">
              <template #default="{ row }">{{ fmtTime(row.expiresAt) }}</template>
            </el-table-column>
          </el-table>
        </div>
      </div>
    </el-dialog>
  </div>
</template>

<script setup lang="ts">
import { computed, defineComponent, h, onMounted, ref } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import http from '../api/http'
import { useAuthStore } from '../stores/auth'
import { NEAR_EXPIRY_OFFER_STATUS, fmtTime, fmtMoney } from '../utils/dict'

const TEMP_ZONES_LABEL: any = { HOT: '热链', CHILLED: '冷藏', FROZEN: '冷冻', AMBIENT: '常温' }

const auth = useAuthStore()
const tab = ref(auth.role === 'ENTERPRISE' ? 'proposed' : 'candidates')
const loading = ref(false)
const pool = ref<any>({ batches: [], candidates: [] })
const offers = ref<any[]>([])
const attachments = ref<any[]>([])

const offerVisible = ref(false)
const offer = ref<any>(null)
const acknowledged = ref(false)
const rejectVisible = ref(false)
const rejectReasonText = ref('')
const attachmentVisible = ref(false)
const attachment = ref<any>(null)
const unitPage = ref(1)
const unitPageSize = 12
const pagedUnits = computed(() => {
  const start = (unitPage.value - 1) * unitPageSize
  return (offer.value?.units || []).slice(start, start + unitPageSize)
})

const pageTitle = computed(() => ({
  ADMIN: '临期调拨推荐（平台运营）',
  SERVICE: '临期调拨推荐（客服）',
  STORE: '临期调拨（门店视角）',
  ENTERPRISE: '临期折扣确认（企业行政）',
  FINANCE: '月结附件 · 临期调拨确认',
}[auth.role] || '临期调拨'))

// 方案记录表格（渲染函数，供多角色 tab 复用）
const OffersGrid = defineComponent({
  name: 'OffersGrid',
  props: { offers: { type: Array as any, default: () => [] } },
  emits: ['open'],
  setup(props, { emit }) {
    return () =>
      h(
        ElTableShim,
        { data: props.offers, size: 'small', border: true },
        {
          default: () => [
            h(ElColumnShim, { prop: 'offerNo', label: '方案号', width: '130', className: 'mono' }),
            h(ElColumnShim, { prop: 'orderNo', label: '团餐单', width: '140', className: 'mono' }),
            h(ElColumnShim, { prop: 'enterpriseName', label: '企业', 'minWidth': '130' }),
            h(ElColumnShim, { prop: 'storeName', label: '门店', 'minWidth': '120' }),
            h(ElColumnShim, { label: '临期份', width: '80', align: 'center' }, {
              default: ({ row }: any) => h(ElTagShim, { size: 'small', type: 'warning', effect: 'dark' }, () => `${row.nearExpiryQty}`),
            }),
            h(ElColumnShim, { label: '折后额', width: '100', align: 'right' }, {
              default: ({ row }: any) => fmtMoney(row.offerAmount),
            }),
            h(ElColumnShim, { label: '节省', width: '100', align: 'right' }, {
              default: ({ row }: any) => fmtMoney(row.savingsAmount),
            }),
            h(ElColumnShim, { label: '状态', width: '110' }, {
              default: ({ row }: any) => h(ElTagShim, { size: 'small', type: NEAR_EXPIRY_OFFER_STATUS[row.status]?.type as any },
                () => NEAR_EXPIRY_OFFER_STATUS[row.status]?.name),
            }),
            h(ElColumnShim, { label: '操作', width: '90', align: 'center' }, {
              default: ({ row }: any) => h(ElButtonShim, { size: 'small', onClick: () => emit('open', row.id) }, () => '查看'),
            }),
          ],
        },
      )
  },
})

const AttachmentsGrid = defineComponent({
  name: 'AttachmentsGrid',
  props: { attachments: { type: Array as any, default: () => [] } },
  emits: ['open'],
  setup(props, { emit }) {
    return () =>
      h(
        ElTableShim,
        { data: props.attachments, size: 'small', border: true },
        {
          default: () => [
            h(ElColumnShim, { prop: 'attachmentNo', label: '附件号', width: '140', className: 'mono' }),
            h(ElColumnShim, { prop: 'orderNo', label: '团餐单', width: '140', className: 'mono' }),
            h(ElColumnShim, { prop: 'enterpriseName', label: '企业', 'minWidth': '130' }),
            h(ElColumnShim, { prop: 'month', label: '账期', width: '90' }),
            h(ElColumnShim, { prop: 'title', label: '附件标题', 'minWidth': '220', showOverflowTooltip: true }),
            h(ElColumnShim, { label: '操作', width: '90', align: 'center' }, {
              default: ({ row }: any) => h(ElButtonShim, { size: 'small', onClick: () => emit('open', row.id) }, () => '查看'),
            }),
          ],
        },
      )
  },
})

// 延迟解析 Element Plus 组件（main.ts 全局注册，这里直接按名字取）
import { ElTable, ElTableColumn, ElTag, ElButton } from 'element-plus'
const ElTableShim = ElTable as any
const ElColumnShim = ElTableColumn as any
const ElTagShim = ElTag as any
const ElButtonShim = ElButton as any

async function load() {
  loading.value = true
  try {
    const tasks: Promise<any>[] = [http.get('/near-expiry/offers')]
    if (['ADMIN', 'SERVICE', 'STORE'].includes(auth.role)) tasks.push(http.get('/near-expiry/pool'))
    if (['ENTERPRISE', 'FINANCE', 'ADMIN'].includes(auth.role)) tasks.push(http.get('/near-expiry/attachments'))
    const [o, p, a] = await Promise.all(tasks)
    offers.value = o
    if (p) pool.value = p
    if (a) attachments.value = a
  } finally {
    loading.value = false
  }
}

async function recommend(row: any) {
  try {
    await ElMessageBox.confirm(
      `将基于门店实时批次为团餐单 ${row.orderNo} 生成分档折扣方案（5/6/7 折），生成后通知企业行政确认。`,
      '推荐临期折扣方案', { type: 'warning' },
    )
  } catch {
    return
  }
  const res: any = await http.post(`/near-expiry/orders/${row.orderId}/recommend`)
  ElMessage.success('折扣方案已推荐，企业行政已收到确认通知')
  await load()
  openOffer(res.id)
}

async function openOffer(id: number) {
  offer.value = await http.get(`/near-expiry/offers/${id}`)
  acknowledged.value = false
  unitPage.value = 1
  offerVisible.value = true
}

async function doAccept() {
  await http.post(`/near-expiry/offers/${offer.value.id}/accept`, {})
  ElMessage.success('已接受：批次/折扣/温控/售后责任写入团餐单，每份餐食已贴标，确认已入月结附件')
  offerVisible.value = false
  load()
}

async function doReject() {
  await http.post(`/near-expiry/offers/${offer.value.id}/reject`, { reason: rejectReasonText.value })
  ElMessage.success('已拒绝，团餐单按正常方案履约')
  rejectVisible.value = false
  offerVisible.value = false
  load()
}

async function openAttachment(id: number) {
  attachment.value = attachments.value.find(a => a.id === id)
  attachmentVisible.value = true
}

function goAttachment(id: number) {
  offerVisible.value = false
  tab.value = 'attachments'
  if (id) openAttachment(id)
}

onMounted(load)
</script>

<style scoped>
.offer-head { display: flex; align-items: center; gap: 10px; flex-wrap: wrap; font-size: 13px; }
.subblock { margin-top: 14px; }
.sub-title { font-weight: 600; font-size: 13px; margin-bottom: 6px; }
.rule-item { font-size: 12.5px; line-height: 1.8; }
.policy-line { font-size: 13px; line-height: 1.9; }
.policy-box { background: #f6fbf8; border: 1px solid #d4ecdd; border-radius: 8px; padding: 10px 12px; }
.policy-statement { font-size: 12.5px; line-height: 1.8; }
.amount-bar { display: flex; align-items: center; gap: 14px; margin-top: 10px; padding: 10px 12px; background: #fff8f0; border-radius: 8px; border: 1px dashed #f0a020; }
.brand-text { color: #ff6a00; }
</style>
