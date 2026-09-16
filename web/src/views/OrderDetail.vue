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

        <div class="panel" v-if="o.topUps?.length">
          <div class="panel-title">
            临时加餐记录
            <el-tag size="small" type="warning" effect="plain" style="margin-left:6px">追加餐食 · 特殊餐标</el-tag>
          </div>
          <div v-for="t in o.topUps" :key="t.id" class="topup-card">
            <div class="topup-head">
              <span class="mono">{{ t.topUpNo }}</span>
              <el-tag size="small" :type="TOPUP_STATUS[t.status]?.type as any">{{ TOPUP_STATUS[t.status]?.name }}</el-tag>
              <span class="muted">{{ fmtTime(t.createdAt) }}</span>
              <span style="margin-left:auto" class="danger-text">差额 {{ fmtMoney(t.totalDiff) }}</span>
            </div>
            <div class="topup-meta">
              追加 <b>{{ t.addHeadcount }}</b> 份（素食 {{ t.addVegetarianCount }}）
              <template v-if="t.addAllergies?.length">
                ，新增忌口：
                <el-tag v-for="a in t.addAllergies" :key="a" size="small" type="danger" effect="plain" style="margin-right:4px">{{ a }}</el-tag>
              </template>
              <div>追加餐费 {{ fmtMoney(t.addAmount) }}<template v-if="Number(t.addDeliveryFee)"> + 加派费 {{ fmtMoney(t.addDeliveryFee) }}</template>；新送达时间 {{ fmtTime(t.newDeliverAt) }}</div>
            </div>
            <el-table :data="t.items" size="small" border style="margin:6px 0">
              <el-table-column prop="name" label="追加商品" min-width="140" />
              <el-table-column prop="quantity" label="数量" width="70" align="center" />
              <el-table-column label="属性" width="120">
                <template #default="{ row }">
                  <el-tag v-if="row.vegetarian" size="small" type="success" effect="plain">素</el-tag>
                  <el-tag v-if="row.nearExpiryQty" size="small" type="warning" style="margin-left:4px">临期{{ row.nearExpiryQty }}</el-tag>
                </template>
              </el-table-column>
            </el-table>
            <div v-if="t.specialDietRoster?.length" class="label-box">
              <div class="sub-title">特殊餐标（企业名单，门店逐份贴标 / 配送员与签收人按编码核对）</div>
              <div class="label-chips">
                <el-tag v-for="l in t.specialDietRoster" :key="l.labelCode" size="small"
                  :type="l.tag === '素食' ? 'success' : 'danger'" effect="dark" style="margin:2px">
                  {{ l.labelCode }} · {{ l.name }} · {{ l.tag }}
                </el-tag>
              </div>
              <div class="muted" style="margin-top:4px">
                贴标状态：
                <span v-if="t.status === 'CONFIRMED'" class="danger-text">待门店贴标</span>
                <span v-else>{{ t.labelNote || '已贴标' }}（{{ fmtTime(t.labelledAt) }}）</span>
              </div>
              <el-button v-if="auth.role === 'STORE' && t.storeId === auth.user?.storeId && t.status === 'CONFIRMED'"
                size="small" type="warning" style="margin-top:6px" @click="openLabel(t)">按企业名单完成重新贴标</el-button>
            </div>
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

        <div class="panel" v-if="spoiledReports.length">
          <div class="panel-title">
            餐食变质售后
            <el-tag size="small" type="danger" effect="dark" style="margin-left:6px">食安</el-tag>
          </div>
          <div v-for="r in spoiledReports" :key="r.id" class="spoiled-row" @click="openReport(r.id)">
            <el-tag size="small" :type="SPOILED_STATUS[r.status]?.type as any">{{ SPOILED_STATUS[r.status]?.name }}</el-tag>
            <span class="mono">{{ r.reportNo }}</span>
            <span>{{ r.items.map((i:any)=>`${i.name}×${i.qty}`).join('，') }}</span>
            <el-tag size="small" :type="REFUND_STATUS[r.refundStatus]?.type as any">
              {{ r.refundStatus === 'NONE' ? '未退款' : `退款 ¥${r.refundAmount} ${REFUND_STATUS[r.refundStatus]?.name}` }}
            </el-tag>
            <span class="muted" style="margin-left:auto">{{ fmtTime(r.createdAt) }}</span>
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
              <el-button v-if="canTopUp" type="warning" @click="openTopUp">
                送达前临时加餐
                <el-tag v-if="topUpDeadlineMin" size="small" type="danger" effect="dark" style="margin-left:4px">
                  剩 {{ topUpDeadlineMin }} 分钟截止
                </el-tag>
              </el-button>
              <el-button v-if="o.status === 'DELIVERED'" type="success" @click="signVisible = true">签收</el-button>
              <el-button v-if="['COMPLETED', 'SIGNED'].includes(o.status)" @click="feedbackVisible = true">员工用餐反馈</el-button>
              <el-button v-if="['DELIVERED', 'SIGNED', 'COMPLETED'].includes(o.status)" type="danger" plain
                @click="openSpoiled">餐食变质/异味售后</el-button>
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
            <el-descriptions-item label="加派骑手" v-if="o.delivery.extraDispatch">
              <el-tag size="small" type="warning">加派 {{ o.delivery.extraCourierName || '待调度' }}</el-tag>
            </el-descriptions-item>
            <el-descriptions-item label="追加份数" v-if="o.delivery.topUpQty">
              <el-tag size="small" type="danger" effect="plain">+{{ o.delivery.topUpQty }} 份</el-tag>
            </el-descriptions-item>
            <el-descriptions-item label="特殊餐标" v-if="o.delivery.specialLabels?.length">
              <el-tooltip placement="left" :show-after="200">
                <template #content>
                  <div v-for="l in o.delivery.specialLabels" :key="l.labelCode" style="line-height:1.7">
                    {{ l.labelCode }} · {{ l.name }} · {{ l.tag }} · {{ l.productName }}
                  </div>
                </template>
                <el-tag size="small" type="danger" effect="dark">{{ o.delivery.specialLabels.length }} 枚（素食/过敏，悬停查看）</el-tag>
              </el-tooltip>
            </el-descriptions-item>
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

    <!-- 送达前临时加餐：第一步填写 -->
    <el-dialog v-model="topUpVisible" title="送达前临时加餐" width="560px">
      <el-alert type="warning" :closable="false" show-icon
        title="平台将核查周边门店库存、制作批次、门店产能、配送容量与发票差额；确认后追加商品、送达时间与差额费用同步更新，门店按企业名单重新贴标。"
        style="margin-bottom:12px" />
      <el-form label-width="110px">
        <el-form-item label="追加份数">
          <el-input-number v-model="topUpForm.addHeadcount" :min="1" :max="200" />
          <span class="muted" style="margin-left:8px">送达前 60 分钟截止</span>
        </el-form-item>
        <el-form-item label="其中素食份数">
          <el-input-number v-model="topUpForm.addVegetarianCount" :min="0" :max="topUpForm.addHeadcount" />
        </el-form-item>
        <el-form-item label="新增过敏忌口">
          <el-checkbox-group v-model="topUpForm.addAllergies">
            <el-checkbox v-for="a in ALLERGENS" :key="a" :value="a" :label="a" />
          </el-checkbox-group>
        </el-form-item>
        <el-form-item label="特殊餐名单">
          <div style="width:100%">
            <el-button size="small" @click="addRoster">+ 添加就餐人（素食/过敏逐人贴标）</el-button>
            <div v-for="(r, i) in topUpForm.roster" :key="i" class="roster-row">
              <el-input v-model="r.name" placeholder="姓名" style="width:120px" />
              <el-select v-model="r.tag" placeholder="餐标" style="width:150px">
                <el-option label="素食" value="素食" />
                <el-option v-for="a in ALLERGENS" :key="a" :label="`过敏:${a}`" :value="`过敏:${a}`" />
              </el-select>
              <el-button link type="danger" @click="topUpForm.roster.splice(i, 1)">删除</el-button>
            </div>
            <div class="muted" style="font-size:12px">名单用于门店重新贴标，并同步配送员与企业签收人逐人核对</div>
          </div>
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="topUpVisible = false">取消</el-button>
        <el-button type="primary" :loading="checking" @click="doCheck">核查库存与差额</el-button>
      </template>
    </el-dialog>

    <!-- 加餐核查报告：第二步确认 -->
    <el-dialog v-model="reportVisible" title="临时加餐核查报告" width="680px">
      <template v-if="report">
        <el-result v-if="!report.ok" icon="error" title="周边门店暂无法承接本次加餐" :sub-title="report.reason">
          <template #extra>
            <el-tag type="danger">建议：发起异常工单，由客服协调门店调拨或协商调整份数/送达时间</el-tag>
          </template>
        </el-result>
        <template v-else>
          <el-alert type="success" :closable="false" show-icon
            :title="`由${report.useOriginStore ? '原门店' : '周边门店'}「${report.storeName}」承接（距企业 ${report.distance}km）`"
            :description="`追加 ${report.addHeadcount} 份（素食 ${report.addVegetarianCount}），库存/批次/产能均已核验通过`"
            style="margin-bottom:12px" />
          <el-table :data="report.items" size="small" border>
            <el-table-column prop="name" label="追加商品" min-width="150" />
            <el-table-column prop="quantity" label="数量" width="70" align="center" />
            <el-table-column label="单价" width="80" align="right">
              <template #default="{ row }">{{ fmtMoney(row.unitPrice) }}</template>
            </el-table-column>
            <el-table-column label="属性" width="120">
              <template #default="{ row }">
                <el-tag v-if="row.vegetarian" size="small" type="success" effect="plain">素</el-tag>
                <el-tag v-if="row.nearExpiryQty" size="small" type="warning" style="margin-left:4px">临期{{ row.nearExpiryQty }}</el-tag>
              </template>
            </el-table-column>
          </el-table>

          <div class="check-grid">
            <div class="check-item">
              <div class="check-label">配送容量</div>
              <div>
                <el-tag size="small" :type="report.deliveryCapacity.extraDispatch ? 'danger' : 'success'">
                  {{ report.deliveryCapacity.extraDispatch
                    ? `超出保温箱 ${report.deliveryCapacity.overflow} 份，需加派骑手`
                    : '原保温箱可容纳' }}
                </el-tag>
                <div class="muted" style="font-size:12px">
                  {{ report.deliveryCapacity.originQty }} + {{ report.addHeadcount }} = {{ report.deliveryCapacity.totalAfter }} 份 / 容量 {{ report.deliveryCapacity.boxCapacity }}
                </div>
              </div>
            </div>
            <div class="check-item">
              <div class="check-label">特殊餐标</div>
              <div>
                <el-tag size="small" type="success" effect="plain">素食 {{ report.labels.vegetarian }}</el-tag>
                <el-tag size="small" type="danger" effect="plain" style="margin-left:4px">过敏 {{ report.labels.allergy }}</el-tag>
                <div class="muted" style="font-size:12px">门店按企业名单重新贴标，同步配送员/签收人</div>
              </div>
            </div>
            <div class="check-item">
              <div class="check-label">发票金额</div>
              <div>
                <div>{{ fmtMoney(report.invoiceBefore) }} → <b class="danger-text">{{ fmtMoney(report.invoiceAfter) }}</b></div>
                <div class="muted" style="font-size:12px">追加餐费 {{ fmtMoney(report.addAmount) }}<template v-if="report.extraDispatchFee"> + 加派费 {{ fmtMoney(report.extraDispatchFee) }}</template></div>
              </div>
            </div>
            <div class="check-item">
              <div class="check-label">送达时间</div>
              <div>
                <div>{{ fmtTime(report.newDeliverAt) }}</div>
                <div class="muted" style="font-size:12px">{{ report.useOriginStore ? '按原时间送达' : `周边门店加急协同，顺延 ${NEARBY_DELAY_MIN} 分钟` }}</div>
              </div>
            </div>
          </div>

          <el-collapse style="margin-top:8px">
            <el-collapse-item title="周边门店核查明细（库存 / 剩余产能 / 临期批次）">
              <el-table :data="report.checks" size="small" border>
                <el-table-column prop="storeName" label="门店" min-width="140" />
                <el-table-column label="距离" width="70" align="center">
                  <template #default="{ row }">{{ row.distance }}km</template>
                </el-table-column>
                <el-table-column label="剩余产能" width="90" align="center">
                  <template #default="{ row }">
                    <el-tag size="small" :type="row.capacityOk ? 'success' : 'danger'">{{ row.remainingCapacity }} 份</el-tag>
                  </template>
                </el-table-column>
                <el-table-column label="库存批次" width="90" align="center">
                  <template #default="{ row }">
                    <el-tag size="small" :type="row.stockOk ? 'success' : 'danger'">{{ row.stockOk ? '满足' : '不足' }}</el-tag>
                  </template>
                </el-table-column>
                <el-table-column label="临期可消化" width="90" align="center">
                  <template #default="{ row }">{{ row.nearExpiryQty }} 份</template>
                </el-table-column>
                <el-table-column prop="failReason" label="不可承接原因" min-width="120" show-overflow-tooltip />
              </el-table>
            </el-collapse-item>
          </el-collapse>
        </template>
      </template>
      <template #footer>
        <el-button @click="reportVisible = false">取消</el-button>
        <el-button v-if="report?.ok" type="warning" :loading="confirming" @click="doConfirmTopUp">
          确认加餐（差额 {{ fmtMoney(report.totalDiff) }}，按新时间送达）
        </el-button>
      </template>
    </el-dialog>

    <!-- 门店贴标确认 -->
    <el-dialog v-model="labelVisible" title="特殊餐重新贴标确认" width="460px">
      <div v-if="labelTarget">
        <el-alert type="warning" :closable="false" show-icon
          title="请按企业名单逐份重新贴标，并核对拣货清单避免漏贴某一类特殊餐标" style="margin-bottom:12px" />
        <el-descriptions :column="1" border size="small">
          <el-descriptions-item label="应贴素食标签">{{ labelTarget.vegLabelCount }} 枚</el-descriptions-item>
          <el-descriptions-item label="应贴过敏标签">{{ labelTarget.allergyLabelCount }} 枚</el-descriptions-item>
        </el-descriptions>
        <div class="label-chips" style="margin:10px 0">
          <el-tag v-for="l in labelTarget.specialDietRoster" :key="l.labelCode" size="small"
            :type="l.tag === '素食' ? 'success' : 'danger'" effect="dark" style="margin:2px">
            {{ l.labelCode }} · {{ l.name }} · {{ l.tag }}
          </el-tag>
        </div>
        <el-input v-model="labelNote" type="textarea" :rows="2" placeholder="贴标备注（可选）" />
      </div>
      <template #footer>
        <el-button @click="labelVisible = false">取消</el-button>
        <el-button type="warning" @click="doLabel">已全部重新贴标，确认</el-button>
      </template>
    </el-dialog>

    <!-- 餐食变质/异味售后 -->
    <el-dialog v-model="spoiledVisible" title="餐食变质 / 异味售后" width="680px">
      <el-alert type="error" :closable="false" show-icon
        title="请选择问题商品与生产批次，并填写签收时间、上传温控照片、登记食用人员；提交后客服将受理，可批量退款、补送并触发同批次门店下架。"
        style="margin-bottom:12px" />
      <el-form label-width="110px">
        <el-form-item label="问题类型">
          <el-radio-group v-model="spoiledForm.issueType">
            <el-radio-button value="ODOR">饭团/餐食异味</el-radio-button>
            <el-radio-button value="SPOILED">便当变质</el-radio-button>
            <el-radio-button value="FOREIGN">异物</el-radio-button>
            <el-radio-button value="TEMP">温控失当</el-radio-button>
          </el-radio-group>
        </el-form-item>
        <el-form-item label="签收时间">
          <el-date-picker v-model="spoiledForm.deliveredAt" type="datetime" style="width:100%" />
        </el-form-item>
      </el-form>

      <div class="sub-title">问题商品与批次</div>
      <el-table :data="spoiledForm.items" size="small" border>
        <el-table-column label="选择" width="50" align="center">
          <template #default="{ row }"><el-checkbox v-model="row.checked" /></template>
        </el-table-column>
        <el-table-column prop="name" label="商品" min-width="140" />
        <el-table-column label="数量" width="100">
          <template #default="{ row }"><el-input-number v-model="row.qty" :min="1" :max="200" size="small" :disabled="!row.checked" controls-position="right" style="width:90px" /></template>
        </el-table-column>
        <el-table-column label="生产批次" min-width="200">
          <template #default="{ row }">
            <el-select v-model="row.batchId" size="small" filterable placeholder="选择批次" :disabled="!row.checked">
              <el-option v-for="b in spoiledBatches.filter((x:any)=>x.productId===row.productId)" :key="b.batchId"
                :label="`${b.batchNo}（生产 ${fmtTime(b.producedAt)} / ${b.status==='DEPLETED'?'已售罄':b.quantity+'份在架'}）`" :value="b.batchId" />
            </el-select>
          </template>
        </el-table-column>
      </el-table>

      <div class="sub-title" style="margin-top:12px">温控照片凭证</div>
      <div v-for="(p,i) in spoiledForm.photos" :key="i" class="photo-edit-row">
        <el-input v-model="p.fileName" placeholder="照片文件名/说明（如 便当表面.jpg）" style="width:230px" />
        <el-input-number v-model="p.surfaceTemp" :precision="1" :step="0.1" size="small" controls-position="right" placeholder="表面℃" style="width:120px" />
        <el-input-number v-model="p.coreTemp" :precision="1" :step="0.1" size="small" controls-position="right" placeholder="中心℃" style="width:120px" />
        <el-button link type="danger" @click="spoiledForm.photos.splice(i,1)">删除</el-button>
      </div>
      <el-button size="small" @click="spoiledForm.photos.push({fileName:'',surfaceTemp:null,coreTemp:null,takenAt:new Date(),note:''})">+ 添加温控照片</el-button>

      <div class="sub-title" style="margin-top:12px">食用人员登记</div>
      <el-table :data="spoiledForm.diners" size="small" border>
        <el-table-column label="姓名" min-width="120">
          <template #default="{ row }"><el-input v-model="row.name" size="small" placeholder="姓名" /></template>
        </el-table-column>
        <el-table-column label="电话" min-width="140">
          <template #default="{ row }"><el-input v-model="row.phone" size="small" placeholder="联系电话" /></template>
        </el-table-column>
        <el-table-column label="症状/情况" min-width="180">
          <template #default="{ row }"><el-input v-model="row.symptom" size="small" placeholder="如 腹泻/异味未食用" /></template>
        </el-table-column>
        <el-table-column width="70" align="center">
          <template #default="{ $index }"><el-button link type="danger" @click="spoiledForm.diners.splice($index,1)">删</el-button></template>
        </el-table-column>
      </el-table>
      <el-button size="small" style="margin-top:6px" @click="spoiledForm.diners.push({name:'',phone:'',symptom:''})">+ 添加食用人员</el-button>

      <el-input v-model="spoiledForm.description" type="textarea" :rows="2" style="margin-top:10px"
        placeholder="问题描述：异味/变质情况、发现时间、包装与温控异常等" />
      <template #footer>
        <el-button @click="spoiledVisible = false">取消</el-button>
        <el-button type="danger" :loading="spoiledSubmitting" @click="submitSpoiled">提交食安售后</el-button>
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
  INCIDENT_STATUS, DELIVERY_STATUS, INVOICE_STATUS, TOPUP_STATUS,
  SPOILED_STATUS, REFUND_STATUS,
  ALLERGENS, fmtTime, fmtMoney,
} from '../utils/dict'

const NEARBY_DELAY_MIN = 15

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

// ===== 临时加餐 =====
const topUpVisible = ref(false)
const reportVisible = ref(false)
const labelVisible = ref(false)
const checking = ref(false)
const confirming = ref(false)
const topUpForm = reactive<any>({ addHeadcount: 30, addVegetarianCount: 0, addAllergies: [], roster: [] })
const report = ref<any>(null)
const labelTarget = ref<any>(null)
const labelNote = ref('')
const nowTs = ref(Date.now())
setInterval(() => { nowTs.value = Date.now() }, 30000)

const canTopUp = computed(() =>
  ['CONFIRMED', 'PREPARING', 'READY'].includes(o.value?.status) && topUpDeadlineMin.value >= 60)
const topUpDeadlineMin = computed(() => {
  if (!o.value) return 0
  return Math.floor((new Date(o.value.deliverAt).getTime() - nowTs.value) / 60000)
})

// ===== 餐食变质售后 =====
const spoiledVisible = ref(false)
const spoiledSubmitting = ref(false)
const spoiledBatches = ref<any[]>([])
const spoiledForm = reactive<any>({ issueType: 'SPOILED', deliveredAt: null, items: [], photos: [], diners: [{ name: '', phone: '', symptom: '' }], description: '' })
const spoiledReports = computed(() => o.value?.spoiledReports || [])

async function openSpoiled() {
  const ctx: any = await http.get(`/spoiled/context/${id}`)
  spoiledBatches.value = ctx.batches
  spoiledForm.issueType = 'SPOILED'
  spoiledForm.deliveredAt = ctx.deliveredAt
  spoiledForm.items = ctx.items.map((i: any) => ({ ...i, checked: false, qty: 1, batchId: null }))
  spoiledForm.photos = [{ fileName: '', surfaceTemp: null, coreTemp: null, takenAt: new Date(), note: '' }]
  spoiledForm.diners = [{ name: '', phone: '', symptom: '' }]
  spoiledForm.description = ''
  spoiledVisible.value = true
}

async function submitSpoiled() {
  const items = spoiledForm.items
    .filter((i: any) => i.checked)
    .map((i: any) => ({ productId: i.productId, name: i.name, batchId: i.batchId, qty: i.qty, issueType: spoiledForm.issueType }))
  if (!items.length) { ElMessage.warning('请勾选至少一种问题商品'); return }
  if (items.some((i: any) => !i.batchId)) { ElMessage.warning('请为每种问题商品选择生产批次'); return }
  const photos = spoiledForm.photos.filter((p: any) => p.fileName)
  const diners = spoiledForm.diners.filter((p: any) => p.name)
  spoiledSubmitting.value = true
  try {
    await http.post('/spoiled/reports', {
      orderId: id, issueType: spoiledForm.issueType, deliveredAt: spoiledForm.deliveredAt,
      items, photos, diners, description: spoiledForm.description,
    })
    ElMessage.success('食安售后已提交，客服将立即受理')
    spoiledVisible.value = false
    load()
  } finally { spoiledSubmitting.value = false }
}

function openReport(rid: number) {
  router.push(`/aftersales?focus=${rid}`)
}

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

// ===== 临时加餐 =====
function openTopUp() {
  Object.assign(topUpForm, {
    addHeadcount: 30,
    addVegetarianCount: 0,
    addAllergies: [],
    roster: [],
  })
  report.value = null
  topUpVisible.value = true
}

function addRoster() {
  topUpForm.roster.push({ name: '', tag: '素食' })
}

async function doCheck() {
  if (topUpForm.addVegetarianCount > topUpForm.addHeadcount) {
    ElMessage.warning('素食份数不能超过追加总份数')
    return
  }
  const validRoster = topUpForm.roster.filter((r: any) => r.name && r.tag)
  checking.value = true
  try {
    const res: any = await http.post(`/topups/order/${id}/check`, {
      addHeadcount: topUpForm.addHeadcount,
      addVegetarianCount: topUpForm.addVegetarianCount,
      addAllergies: topUpForm.addAllergies,
      roster: validRoster,
    })
    report.value = res
    topUpVisible.value = false
    reportVisible.value = true
  } catch { /* 错误已统一提示 */ } finally {
    checking.value = false
  }
}

async function doConfirmTopUp() {
  confirming.value = true
  try {
    await http.post(`/topups/${report.value.topUpId}/confirm`)
    ElMessage.success('加餐已确认：库存已扣减，拣货清单、配送员与签收人餐标已同步')
    reportVisible.value = false
    load()
  } catch { /* ignore */ } finally {
    confirming.value = false
  }
}

function openLabel(t: any) {
  labelTarget.value = t
  labelNote.value = ''
  labelVisible.value = true
}

async function doLabel() {
  await http.post(`/topups/${labelTarget.value.id}/label`, { note: labelNote.value })
  ElMessage.success('已按企业名单完成贴标，配送员将按标签编码核对')
  labelVisible.value = false
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
.topup-card { border: 1px solid #f0c78a; border-radius: 8px; padding: 10px; margin-bottom: 10px; background: #fdf8f0; }
.topup-head { display: flex; align-items: center; gap: 8px; font-size: 13px; }
.topup-meta { font-size: 13px; color: #606266; margin: 6px 0; line-height: 1.8; }
.label-box { margin-top: 6px; padding: 8px; background: #fff; border-radius: 6px; border: 1px dashed #f0a020; }
.label-chips { line-height: 2; }
.roster-row { display: flex; gap: 8px; margin: 6px 0; }
.check-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; margin-top: 12px; }
.check-item { background: #f7f8fa; border-radius: 8px; padding: 10px; }
.check-label { font-weight: 600; font-size: 13px; margin-bottom: 4px; }
.spoiled-row { display:flex; align-items:center; gap:10px; padding:8px 6px; border-bottom:1px solid #f2f3f5; cursor:pointer; font-size:13px; }
.spoiled-row:hover { background:#f7f8fa; }
.photo-edit-row { display:flex; gap:8px; align-items:center; margin:6px 0; }
</style>
