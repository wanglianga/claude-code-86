export const ORDER_STATUS: Record<string, { name: string; type: string }> = {
  DRAFT: { name: '草稿', type: 'info' },
  PLANNING: { name: '方案生成中', type: 'warning' },
  PENDING_CONFIRM: { name: '待确认方案', type: 'warning' },
  CONFIRMED: { name: '已确认', type: 'primary' },
  PREPARING: { name: '门店备货中', type: 'primary' },
  READY: { name: '待取货', type: 'primary' },
  OUT_FOR_DELIVERY: { name: '配送中', type: 'warning' },
  DELIVERED: { name: '已送达', type: 'success' },
  SIGNED: { name: '已签收', type: 'success' },
  COMPLETED: { name: '已归档', type: 'success' },
  CANCELLED: { name: '已取消', type: 'info' },
}

export const ORDER_FLOW = [
  'PENDING_CONFIRM', 'CONFIRMED', 'PREPARING', 'READY',
  'OUT_FOR_DELIVERY', 'DELIVERED', 'SIGNED', 'COMPLETED',
]

export const OCCASIONS: Record<string, string> = {
  MEETING: '会议餐',
  TRAINING: '培训餐',
  OVERTIME: '加班餐',
}

export const CATEGORIES: Record<string, string> = {
  RICE_BALL: '饭团',
  BENTO: '便当',
  SANDWICH: '三明治',
  COFFEE: '咖啡',
  DRINK: '饮料',
  FRUIT: '水果',
}

export const TEMP_ZONES: Record<string, string> = {
  CHILLED: '冷藏',
  FROZEN: '冷冻',
  AMBIENT: '常温',
  HOT: '热链',
}

export const INCIDENT_TYPES: Record<string, string> = {
  HEADCOUNT_CHANGE: '人数临时增减',
  STOCK_SHORTAGE: '门店库存不足',
  NEAR_EXPIRY: '鲜食临期',
  DELIVERY_LATE: '配送迟到',
  INVOICE_ERROR: '发票信息错误',
  SPOILED: '餐食变质反馈',
  OTHER: '其他异常',
}

export const INCIDENT_STATUS: Record<string, { name: string; type: string }> = {
  OPEN: { name: '待处理', type: 'danger' },
  PROCESSING: { name: '处理中', type: 'warning' },
  RESOLVED: { name: '已办结', type: 'success' },
  CLOSED: { name: '已关闭', type: 'info' },
}

export const PRIORITIES: Record<string, { name: string; type: string }> = {
  LOW: { name: '低', type: 'info' },
  MEDIUM: { name: '中', type: 'primary' },
  HIGH: { name: '高', type: 'warning' },
  URGENT: { name: '紧急', type: 'danger' },
}

export const INVOICE_STATUS: Record<string, { name: string; type: string }> = {
  PENDING: { name: '待开票', type: 'warning' },
  ISSUED: { name: '已开具', type: 'success' },
  ERROR: { name: '信息错误', type: 'danger' },
  REISSUED: { name: '已红冲', type: 'info' },
}

export const SETTLEMENT_STATUS: Record<string, { name: string; type: string }> = {
  OPEN: { name: '待确认', type: 'warning' },
  CONFIRMED: { name: '企业已确认', type: 'primary' },
  INVOICED: { name: '已开票', type: 'success' },
  PAID: { name: '已回款', type: 'success' },
}

export const DELIVERY_STATUS: Record<string, { name: string; type: string }> = {
  PENDING: { name: '待指派', type: 'info' },
  ASSIGNED: { name: '已指派', type: 'primary' },
  OUTBOUND: { name: '已出库', type: 'primary' },
  PICKED: { name: '已取货', type: 'warning' },
  DELIVERED: { name: '已送达', type: 'success' },
  SIGNED: { name: '已签收', type: 'success' },
}

export const ALLERGENS = ['麸质', '蛋', '奶', '花生', '海鲜', '大豆']

export const ROLE_NAMES: Record<string, string> = {
  ADMIN: '平台运营',
  ENTERPRISE: '企业行政',
  STORE: '门店',
  LOGISTICS: '仓配',
  SERVICE: '客服',
  FINANCE: '财务',
}

export function fmtTime(t: string | Date | null | undefined) {
  if (!t) return '-'
  const d = new Date(t)
  const p = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`
}

export function fmtMoney(n: number | string | null | undefined) {
  const v = Number(n || 0)
  return `¥${v.toFixed(2)}`
}
