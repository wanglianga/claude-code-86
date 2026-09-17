import { Injectable, Logger, OnApplicationBootstrap } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import * as bcrypt from 'bcryptjs';
import { User, UserRole } from '../entities/user.entity';
import { Enterprise, Contract } from '../entities/enterprise.entity';
import { Store, StoreShift } from '../entities/store.entity';
import { Product, Category } from '../entities/product.entity';
import { InventoryBatch } from '../entities/inventory.entity';
import { Supplier, SupplierDelivery } from '../entities/supplier.entity';
import { MealOrder, MealPlan, OrderStatus } from '../entities/order.entity';
import { Delivery } from '../entities/delivery.entity';
import { Incident, IncidentLog } from '../entities/incident.entity';
import { Invoice, Settlement } from '../entities/finance.entity';
import { Archive, Feedback } from '../entities/archive.entity';
import { MealTopUp } from '../entities/topup.entity';
import { SpoiledReport, BatchRecall, RecallTask, Redelivery } from '../entities/spoiled.entity';
import { NearExpiryOffer } from '../entities/near-expiry.entity';

@Injectable()
export class SeedService implements OnApplicationBootstrap {
  private logger = new Logger('Seed');

  constructor(
    @InjectRepository(User) private userRepo: Repository<User>,
    @InjectRepository(Enterprise) private enterpriseRepo: Repository<Enterprise>,
    @InjectRepository(Contract) private contractRepo: Repository<Contract>,
    @InjectRepository(Store) private storeRepo: Repository<Store>,
    @InjectRepository(StoreShift) private shiftRepo: Repository<StoreShift>,
    @InjectRepository(Product) private productRepo: Repository<Product>,
    @InjectRepository(InventoryBatch) private batchRepo: Repository<InventoryBatch>,
    @InjectRepository(Supplier) private supplierRepo: Repository<Supplier>,
    @InjectRepository(SupplierDelivery) private supplierDeliveryRepo: Repository<SupplierDelivery>,
    @InjectRepository(MealOrder) private orderRepo: Repository<MealOrder>,
    @InjectRepository(MealPlan) private planRepo: Repository<MealPlan>,
    @InjectRepository(Delivery) private deliveryRepo: Repository<Delivery>,
    @InjectRepository(Incident) private incidentRepo: Repository<Incident>,
    @InjectRepository(IncidentLog) private incidentLogRepo: Repository<IncidentLog>,
    @InjectRepository(Invoice) private invoiceRepo: Repository<Invoice>,
    @InjectRepository(Settlement) private settlementRepo: Repository<Settlement>,
    @InjectRepository(Archive) private archiveRepo: Repository<Archive>,
    @InjectRepository(Feedback) private feedbackRepo: Repository<Feedback>,
    @InjectRepository(MealTopUp) private topUpRepo: Repository<MealTopUp>,
    @InjectRepository(SpoiledReport) private spoiledRepo: Repository<SpoiledReport>,
    @InjectRepository(BatchRecall) private recallRepo: Repository<BatchRecall>,
    @InjectRepository(RecallTask) private recallTaskRepo: Repository<RecallTask>,
    @InjectRepository(Redelivery) private redeliveryRepo: Repository<Redelivery>,
    @InjectRepository(NearExpiryOffer) private offerRepo: Repository<NearExpiryOffer>,
  ) {}

  async onApplicationBootstrap() {
    if (process.env.SEED_ON_EMPTY === 'false') return;
    const count = await this.userRepo.count();
    if (count > 0) return;
    this.logger.log('数据库为空，开始写入演示种子数据...');
    await this.seed();
    this.logger.log('种子数据写入完成');
  }

  private hoursFromNow(h: number) {
    return new Date(Date.now() + h * 3600 * 1000);
  }

  private daysFromNow(d: number, hour = 12) {
    const t = new Date(Date.now() + d * 86400000);
    t.setHours(hour, 0, 0, 0);
    return t;
  }

  async seed() {
    const pwd = await bcrypt.hash('123456', 10);

    // ============ 门店 ============
    const stores = await this.storeRepo.save([
      this.storeRepo.create({
        name: '鲜达·中心旗舰店', address: '朝阳区建国路 88 号', lat: 31.2304, lng: 121.4737,
        dailyCapacity: 200, staffCount: 8,
        peakHours: [{ start: '11:30', end: '13:00' }, { start: '17:30', end: '19:00' }],
      }),
      this.storeRepo.create({
        name: '鲜达·高新写字楼店', address: '海淀区中关村大街 27 号', lat: 31.2243, lng: 121.4691,
        dailyCapacity: 120, staffCount: 5,
        peakHours: [{ start: '11:30', end: '13:00' }],
      }),
      this.storeRepo.create({
        name: '鲜达·滨江社区店', address: '浦东新区滨江大道 1200 号', lat: 31.2397, lng: 121.4998,
        dailyCapacity: 80, staffCount: 4,
        peakHours: [{ start: '08:00', end: '09:30' }, { start: '17:30', end: '19:30' }],
      }),
    ]);

    // ============ 企业 ============
    const ent1 = await this.enterpriseRepo.save(this.enterpriseRepo.create({
      name: '晨光科技有限公司', contactName: '王芳', contactPhone: '13800001111',
      backupContactName: '刘洋', backupContactPhone: '13800002222',
      address: '朝阳区建国路 SOHO 现代城 A 座 18 层', lat: 31.2315, lng: 121.4760,
      taxNo: '91310115MA1K3XX88A', invoiceTitle: '晨光科技有限公司',
      preferences: { likes: ['BENTO', 'COFFEE'], dislikes: [], note: '偏好热链便当，咖啡需求高' },
    }));
    const ent2 = await this.enterpriseRepo.save(this.enterpriseRepo.create({
      name: '恒宇广告集团', contactName: '李强', contactPhone: '13900003333',
      backupContactName: '赵敏', backupContactPhone: '13900004444',
      address: '海淀区中关村创业大厦 6 层', lat: 31.2238, lng: 121.4680,
      taxNo: '91310108MA1G5YY99B', invoiceTitle: '恒宇广告集团',
      preferences: { likes: ['SANDWICH', 'FRUIT'], dislikes: ['RICE_BALL'], note: '轻食为主' },
    }));

    // ============ 长期合同 ============
    const contract1 = await this.contractRepo.save(this.contractRepo.create({
      enterpriseId: ent1.id, title: '晨光科技年度团餐框架协议',
      startDate: '2026-01-01', endDate: '2026-12-31',
      mealBudget: 30, discount: 0.95, settlementType: 'MONTHLY', status: 'ACTIVE',
    }));
    await this.contractRepo.save(this.contractRepo.create({
      enterpriseId: ent2.id, title: '恒宇广告单次团餐协议',
      startDate: '2026-03-01', endDate: '2026-12-31',
      mealBudget: 25, discount: 1, settlementType: 'PER_ORDER', status: 'ACTIVE',
    }));

    // ============ 用户 ============
    const users = await this.userRepo.save([
      this.userRepo.create({ username: 'admin', password: pwd, name: '欧阳平台', role: UserRole.ADMIN, phone: '13700000001' }),
      this.userRepo.create({ username: 'chenguang', password: pwd, name: '王芳', role: UserRole.ENTERPRISE, enterpriseId: ent1.id, phone: '13800001111' }),
      this.userRepo.create({ username: 'hengyu', password: pwd, name: '李强', role: UserRole.ENTERPRISE, enterpriseId: ent2.id, phone: '13900003333' }),
      this.userRepo.create({ username: 'store1', password: pwd, name: '刘店长', role: UserRole.STORE, storeId: stores[0].id, phone: '13700000011' }),
      this.userRepo.create({ username: 'store2', password: pwd, name: '张店长', role: UserRole.STORE, storeId: stores[1].id, phone: '13700000012' }),
      this.userRepo.create({ username: 'store3', password: pwd, name: '王店长', role: UserRole.STORE, storeId: stores[2].id, phone: '13700000013' }),
      this.userRepo.create({ username: 'courier1', password: pwd, name: '赵师傅', role: UserRole.LOGISTICS, phone: '13700000021' }),
      this.userRepo.create({ username: 'courier2', password: pwd, name: '孙师傅', role: UserRole.LOGISTICS, phone: '13700000022' }),
      this.userRepo.create({ username: 'service', password: pwd, name: '陈静', role: UserRole.SERVICE, phone: '13700000031' }),
      this.userRepo.create({ username: 'finance', password: pwd, name: '周敏', role: UserRole.FINANCE, phone: '13700000041' }),
    ]);
    const [admin, cgUser, hyUser, , , , courier1] = users;

    // ============ 商品 ============
    const products = await this.productRepo.save([
      this.productRepo.create({ sku: 'BENTO-01', name: '黑椒牛柳便当', category: Category.BENTO, price: 22, cost: 13, shelfLifeHours: 8, tempZone: 'HOT', allergens: ['麸质', '大豆'], vegetarian: false }),
      this.productRepo.create({ sku: 'BENTO-02', name: '照烧鸡腿便当', category: Category.BENTO, price: 20, cost: 12, shelfLifeHours: 8, tempZone: 'HOT', allergens: ['麸质'], vegetarian: false }),
      this.productRepo.create({ sku: 'BENTO-03', name: '田园时蔬素食便当', category: Category.BENTO, price: 18, cost: 10, shelfLifeHours: 8, tempZone: 'HOT', allergens: ['大豆'], vegetarian: true }),
      this.productRepo.create({ sku: 'RICE-01', name: '金枪鱼蛋黄饭团', category: Category.RICE_BALL, price: 7, cost: 3.5, shelfLifeHours: 12, tempZone: 'CHILLED', allergens: ['海鲜', '蛋'], vegetarian: false }),
      this.productRepo.create({ sku: 'RICE-02', name: '照烧鸡肉饭团', category: Category.RICE_BALL, price: 6.5, cost: 3, shelfLifeHours: 12, tempZone: 'CHILLED', allergens: ['麸质'], vegetarian: false }),
      this.productRepo.create({ sku: 'RICE-03', name: '素香松饭团', category: Category.RICE_BALL, price: 6, cost: 2.8, shelfLifeHours: 12, tempZone: 'CHILLED', allergens: [], vegetarian: true }),
      this.productRepo.create({ sku: 'SAND-01', name: '火腿蛋三明治', category: Category.SANDWICH, price: 9, cost: 4.5, shelfLifeHours: 16, tempZone: 'CHILLED', allergens: ['麸质', '蛋'], vegetarian: false }),
      this.productRepo.create({ sku: 'SAND-02', name: '全麦蔬菜三明治', category: Category.SANDWICH, price: 8.5, cost: 4, shelfLifeHours: 16, tempZone: 'CHILLED', allergens: ['麸质'], vegetarian: true }),
      this.productRepo.create({ sku: 'COFFEE-01', name: '美式咖啡（热）', category: Category.COFFEE, price: 12, cost: 5, shelfLifeHours: 4, tempZone: 'HOT', allergens: [], vegetarian: true }),
      this.productRepo.create({ sku: 'COFFEE-02', name: '拿铁咖啡', category: Category.COFFEE, price: 15, cost: 6.5, shelfLifeHours: 4, tempZone: 'HOT', allergens: ['奶'], vegetarian: true }),
      this.productRepo.create({ sku: 'DRINK-01', name: '鲜榨橙汁', category: Category.DRINK, price: 6, cost: 2.5, shelfLifeHours: 24, tempZone: 'CHILLED', allergens: [], vegetarian: true }),
      this.productRepo.create({ sku: 'DRINK-02', name: '矿泉水', category: Category.DRINK, price: 2.5, cost: 1, shelfLifeHours: 720, tempZone: 'AMBIENT', allergens: [], vegetarian: true }),
      this.productRepo.create({ sku: 'FRUIT-01', name: '香蕉', category: Category.FRUIT, price: 3.5, cost: 1.5, shelfLifeHours: 48, tempZone: 'AMBIENT', allergens: [], vegetarian: true }),
      this.productRepo.create({ sku: 'FRUIT-02', name: '苹果切块杯', category: Category.FRUIT, price: 8, cost: 4, shelfLifeHours: 18, tempZone: 'CHILLED', allergens: [], vegetarian: true }),
    ]);
    const P = (sku: string) => products.find(p => p.sku === sku);

    // ============ 供应商 ============
    const suppliers = await this.supplierRepo.save([
      this.supplierRepo.create({ name: '鲜食中央厨房', contact: '吴经理', phone: '13600000001' }),
      this.supplierRepo.create({ name: '乳品饮料供应商', contact: '郑经理', phone: '13600000002' }),
    ]);

    // ============ 库存批次（含临期） ============
    const batches: Partial<InventoryBatch>[] = [];
    let seq = 1;
    for (const store of stores) {
      for (const p of products) {
        // 当日正常批次：足保质期
        batches.push({
          batchNo: `B${String(seq++).padStart(4, '0')}`, storeId: store.id, productId: p.id,
          quantity: 40 + (p.id * 7) % 30, initialQuantity: 60,
          producedAt: this.hoursFromNow(-1),
          expiresAt: this.hoursFromNow(p.shelfLifeHours),
          tempZone: p.tempZone, supplierId: suppliers[0].id, status: 'AVAILABLE',
        });
        // 明日生产计划批次（中央厨房排产，供次日团餐方案选用）
        batches.push({
          batchNo: `B${String(seq++).padStart(4, '0')}`, storeId: store.id, productId: p.id,
          quantity: 50, initialQuantity: 50,
          producedAt: this.daysFromNow(1, 5),
          expiresAt: new Date(this.daysFromNow(1, 5).getTime() + p.shelfLifeHours * 3600 * 1000),
          tempZone: p.tempZone, supplierId: suppliers[0].id, status: 'AVAILABLE',
        });
      }
      // 临期批次：3-5 小时后到期（便当/饭团/三明治/咖啡）
      for (const sku of ['BENTO-01', 'BENTO-03', 'RICE-01', 'SAND-01', 'COFFEE-01']) {
        const p = P(sku);
        batches.push({
          batchNo: `B${String(seq++).padStart(4, '0')}`, storeId: store.id, productId: p.id,
          quantity: 15 + (store.id * 3 + p.id) % 20, initialQuantity: 30,
          producedAt: this.hoursFromNow(-p.shelfLifeHours + 3),
          expiresAt: this.hoursFromNow(3 + (store.id % 3)),
          tempZone: p.tempZone, supplierId: suppliers[0].id, status: 'AVAILABLE',
        });
      }
    }
    await this.batchRepo.save(batches.map(b => this.batchRepo.create(b)));

    // ============ 排班（写字楼店今日缺员） ============
    const today = new Date().toISOString().slice(0, 10);
    const tomorrow = new Date(Date.now() + 86400000).toISOString().slice(0, 10);
    await this.shiftRepo.save([
      this.shiftRepo.create({ storeId: stores[0].id, date: today, requiredStaff: 8, actualStaff: 8 }),
      this.shiftRepo.create({ storeId: stores[1].id, date: today, requiredStaff: 5, actualStaff: 3, note: '2 人临时请假，注意团餐备货人手' }),
      this.shiftRepo.create({ storeId: stores[2].id, date: today, requiredStaff: 4, actualStaff: 4 }),
      this.shiftRepo.create({ storeId: stores[0].id, date: tomorrow, requiredStaff: 8, actualStaff: 7, note: '1 人调休' }),
    ]);

    // ============ 供应商到货（一单延迟） ============
    await this.supplierDeliveryRepo.save([
      this.supplierDeliveryRepo.create({
        supplierId: suppliers[0].id, storeId: stores[0].id,
        expectedAt: this.hoursFromNow(-3), arrivedAt: this.hoursFromNow(-1),
        status: 'DELAYED', note: '中央厨房设备检修，延迟 2 小时',
        items: [{ productId: P('BENTO-01').id, quantity: 60 }, { productId: P('RICE-01').id, quantity: 80 }],
      }),
      this.supplierDeliveryRepo.create({
        supplierId: suppliers[1].id, storeId: stores[0].id,
        expectedAt: this.hoursFromNow(5),
        status: 'SCHEDULED',
        items: [{ productId: P('DRINK-01').id, quantity: 100 }, { productId: P('COFFEE-02').id, quantity: 40 }],
      }),
    ]);

    // ============ 历史团餐单（晨光科技，已归档） ============
    const mkItems = (bentoQty: number, drinkQty: number, fruitQty: number, coffeeQty: number, nearQty = 0) => ([
      { productId: P('BENTO-02').id, name: '照烧鸡腿便当', category: 'BENTO', quantity: bentoQty, unitPrice: 19, nearExpiryQty: nearQty, vegetarian: false },
      { productId: P('DRINK-01').id, name: '鲜榨橙汁', category: 'DRINK', quantity: drinkQty, unitPrice: 5.7, nearExpiryQty: 0, vegetarian: true },
      { productId: P('FRUIT-01').id, name: '香蕉', category: 'FRUIT', quantity: fruitQty, unitPrice: 3.3, nearExpiryQty: 0, vegetarian: true },
      ...(coffeeQty > 0 ? [{ productId: P('COFFEE-01').id, name: '美式咖啡（热）', category: 'COFFEE', quantity: coffeeQty, unitPrice: 11.4, nearExpiryQty: 0, vegetarian: true }] : []),
    ]);

    const seedArchive = async (idx: number, opts: {
      daysAgo: number; headcount: number; occasion: string; onTime: boolean;
      incidents?: number; compensation?: number; invoiceErrors?: number;
      rating?: number; nearExpiryUsed?: number; returnCount?: number;
    }) => {
      const deliverAt = this.daysFromNow(-opts.daysAgo, 12);
      const items = mkItems(opts.headcount, opts.headcount, opts.headcount, Math.floor(opts.headcount * 0.4), opts.nearExpiryUsed || 0);
      const total = items.reduce((s, i) => s + i.quantity * i.unitPrice, 0);
      const returnAmount = (opts.returnCount || 0) * 30;
      const actual = Math.round((total - returnAmount) * 100) / 100;
      const order = await this.orderRepo.save(this.orderRepo.create({
        orderNo: `TM2026${String(8000 + idx)}`,
        enterpriseId: ent1.id, contractId: contract1.id, storeId: stores[0].id,
        occasion: opts.occasion, headcount: opts.headcount, mealBudget: 30,
        vegetarianCount: Math.floor(opts.headcount * 0.1), allergies: [],
        deliverAt, address: ent1.address, contactName: '王芳', contactPhone: '13800001111',
        backupContactName: '刘洋', backupContactPhone: '13800002222',
        invoiceRequired: true, invoiceTitle: ent1.invoiceTitle, taxNo: ent1.taxNo,
        status: OrderStatus.COMPLETED, totalAmount: total,
        actualHeadcount: opts.headcount - (opts.returnCount || 0), actualAmount: actual,
        createdBy: cgUser.id, createdAt: deliverAt, updatedAt: deliverAt,
      }));
      await this.planRepo.save(this.planRepo.create({
        orderId: order.id, storeId: stores[0].id, items, totalPrice: total,
        reasons: ['历史订单方案'], warnings: [], version: 1, status: 'ACCEPTED',
      }));
      const deliveredAt = new Date(deliverAt.getTime() + (opts.onTime ? -10 : 35) * 60000);
      await this.deliveryRepo.save(this.deliveryRepo.create({
        orderId: order.id, courierId: courier1.id, thermalBoxNo: `BX-H${idx}`,
        route: '中心旗舰店 → 建国路 SOHO', outboundAt: new Date(deliverAt.getTime() - 50 * 60000),
        pickedAt: new Date(deliverAt.getTime() - 40 * 60000), deliveredAt,
        signedAt: new Date(deliveredAt.getTime() + 15 * 60000), signerName: '王芳',
        status: 'SIGNED', late: !opts.onTime,
      }));
      await this.archiveRepo.save(this.archiveRepo.create({
        orderId: order.id, enterpriseId: ent1.id, storeId: stores[0].id,
        actualAmount: actual, actualHeadcount: opts.headcount,
        returnCount: opts.returnCount || 0, returnAmount,
        nearExpiryUsed: opts.nearExpiryUsed || 0,
        compensation: opts.compensation || 0, onTime: opts.onTime,
        incidentCount: opts.incidents || 0, invoiceErrors: opts.invoiceErrors || 0,
        rating: opts.rating ?? 5, items, deliveredAt,
      }));
      return order;
    };

    const arch1 = await seedArchive(1, { daysAgo: 42, headcount: 30, occasion: 'MEETING', onTime: true, rating: 5 });
    const arch2 = await seedArchive(2, { daysAgo: 35, headcount: 45, occasion: 'TRAINING', onTime: true, rating: 4, nearExpiryUsed: 8 });
    const arch3 = await seedArchive(3, { daysAgo: 28, headcount: 25, occasion: 'OVERTIME', onTime: false, incidents: 1, compensation: 100, rating: 3 });
    const arch4 = await seedArchive(4, { daysAgo: 21, headcount: 40, occasion: 'MEETING', onTime: true, rating: 5, nearExpiryUsed: 12 });
    const arch5 = await seedArchive(5, { daysAgo: 14, headcount: 35, occasion: 'TRAINING', onTime: true, invoiceErrors: 1, rating: 4 });
    const arch6 = await seedArchive(6, { daysAgo: 7, headcount: 50, occasion: 'MEETING', onTime: true, rating: 5, nearExpiryUsed: 15 });
    const arch7 = await seedArchive(7, { daysAgo: 3, headcount: 20, occasion: 'OVERTIME', onTime: false, incidents: 2, compensation: 150, rating: 3, returnCount: 2 });

    // 归档订单关联的历史工单（已关闭）
    const closedIncident = await this.incidentRepo.save(this.incidentRepo.create({
      ticketNo: 'GD20260828001', orderId: arch3.id, type: 'DELIVERY_LATE',
      title: '配送迟到', description: '晚高峰堵车，比约定时间晚 35 分钟送达',
      status: 'CLOSED', priority: 'HIGH', compensation: 100, compensationConfirmed: true,
      resolution: '客服致歉并赔付 ¥100，企业接受', createdByRole: 'SYSTEM',
      closedAt: this.daysFromNow(-27, 18),
    }));
    await this.incidentLogRepo.save([
      this.incidentLogRepo.create({ incidentId: closedIncident.id, actorId: 0, actorName: '系统', actorRole: '系统', action: 'CREATED', note: '配送迟到自动触发工单' }),
      this.incidentLogRepo.create({ incidentId: closedIncident.id, actorId: 9, actorName: '陈静', actorRole: '客服', action: 'COMPENSATE_PROPOSE', note: '提出赔付 ¥100' }),
      this.incidentLogRepo.create({ incidentId: closedIncident.id, actorId: 10, actorName: '周敏', actorRole: '财务', action: 'COMPENSATE_CONFIRM', note: '财务确认赔付 ¥100' }),
    ]);

    // ============ 进行中的工单（餐食变质，高优先级） ============
    const openIncident = await this.incidentRepo.save(this.incidentRepo.create({
      ticketNo: 'GD20260913001', orderId: arch7.id, type: 'SPOILED',
      title: '员工反馈餐食变质',
      description: '2 名员工反馈便当有异味，疑似温控失效。请门店核查同批次留样，客服跟进企业，财务预备赔付。',
      status: 'PROCESSING', priority: 'URGENT', compensation: 150, compensationConfirmed: true,
      createdBy: cgUser.id, createdByRole: 'ENTERPRISE',
    }));
    await this.incidentLogRepo.save([
      this.incidentLogRepo.create({ incidentId: openIncident.id, actorId: cgUser.id, actorName: '王芳', actorRole: '企业行政', action: 'CREATED', note: '员工反馈便当变质，要求平台处理' }),
      this.incidentLogRepo.create({ incidentId: openIncident.id, actorId: 9, actorName: '陈静', actorRole: '客服', action: 'CLAIM', note: '已联系企业致歉，安排门店核查同批次' }),
      this.incidentLogRepo.create({ incidentId: openIncident.id, actorId: 4, actorName: '刘店长', actorRole: '门店', action: 'COMMENT', note: '同批次留样复检中，初步判断为保温箱温控异常' }),
      this.incidentLogRepo.create({ incidentId: openIncident.id, actorId: 9, actorName: '陈静', actorRole: '客服', action: 'COMPENSATE_PROPOSE', note: '提出赔付 ¥150（变质餐品 2 倍赔付）' }),
      this.incidentLogRepo.create({ incidentId: openIncident.id, actorId: 10, actorName: '周敏', actorRole: '财务', action: 'COMPENSATE_CONFIRM', note: '财务确认赔付 ¥150' }),
    ]);
    await this.orderRepo.update({ id: arch7.id }, { hasException: true });

    // ============ 进行中的订单 ============
    // 1) 待企业确认（6 小时后送达的加班餐）
    const pendingOrder = await this.orderRepo.save(this.orderRepo.create({
      orderNo: `TM${Date.now().toString().slice(-10)}01`,
      enterpriseId: ent1.id, contractId: contract1.id, storeId: stores[0].id,
      occasion: 'OVERTIME', headcount: 25, mealBudget: 30, vegetarianCount: 3,
      allergies: ['海鲜'], deliverAt: this.hoursFromNow(6),
      address: ent1.address, contactName: '王芳', contactPhone: '13800001111',
      backupContactName: '刘洋', backupContactPhone: '13800002222',
      invoiceRequired: true, invoiceTitle: ent1.invoiceTitle, taxNo: ent1.taxNo,
      remark: '项目组冲刺加班，请准时送到 18 层前台',
      status: OrderStatus.PENDING_CONFIRM, totalAmount: 685.5, createdBy: cgUser.id,
    }));
    await this.planRepo.save(this.planRepo.create({
      orderId: pendingOrder.id, storeId: stores[0].id,
      items: [
        { productId: P('BENTO-02').id, name: '照烧鸡腿便当', category: 'BENTO', quantity: 22, unitPrice: 19, nearExpiryQty: 6, vegetarian: false },
        { productId: P('BENTO-03').id, name: '田园时蔬素食便当', category: 'BENTO', quantity: 3, unitPrice: 17.1, nearExpiryQty: 0, vegetarian: true },
        { productId: P('DRINK-01').id, name: '鲜榨橙汁', category: 'DRINK', quantity: 25, unitPrice: 5.7, nearExpiryQty: 0, vegetarian: true },
        { productId: P('FRUIT-01').id, name: '香蕉', category: 'FRUIT', quantity: 25, unitPrice: 3.3, nearExpiryQty: 0, vegetarian: true },
      ],
      totalPrice: 685.5,
      reasons: [
        '优选「鲜达·中心旗舰店」供餐：距企业 0.3km，当日剩余团餐产能 175 份',
        '优先消化临期鲜食 6 份（临期 7 折），为企业节省约 ¥34.20，减少门店损耗',
        '已按企业历史偏好（便当、咖啡）搭配套餐',
        '含素食 3 份，单独装配并标注',
        '已剔除含过敏原（海鲜）的商品',
        '适用长期合同折扣 9.5 折',
      ],
      warnings: ['送达时间处于门店散客晚高峰边缘，建议门店提前备货、设置专用取餐通道'],
      version: 1, status: 'PROPOSED',
    }));

    // 2) 门店备货中（明天中午会议餐）
    const prepOrder = await this.orderRepo.save(this.orderRepo.create({
      orderNo: `TM${Date.now().toString().slice(-10)}02`,
      enterpriseId: ent1.id, contractId: contract1.id, storeId: stores[1].id,
      occasion: 'MEETING', headcount: 40, mealBudget: 30, vegetarianCount: 5,
      allergies: [], deliverAt: this.daysFromNow(1, 12),
      address: ent1.address, contactName: '王芳', contactPhone: '13800001111',
      backupContactName: '刘洋', backupContactPhone: '13800002222',
      invoiceRequired: true, invoiceTitle: ent1.invoiceTitle, taxNo: ent1.taxNo,
      status: OrderStatus.PREPARING, totalAmount: 1094.4, createdBy: cgUser.id,
    }));
    await this.planRepo.save(this.planRepo.create({
      orderId: prepOrder.id, storeId: stores[1].id,
      items: [
        { productId: P('BENTO-01').id, name: '黑椒牛柳便当', category: 'BENTO', quantity: 35, unitPrice: 20.9, nearExpiryQty: 0, vegetarian: false },
        { productId: P('BENTO-03').id, name: '田园时蔬素食便当', category: 'BENTO', quantity: 5, unitPrice: 17.1, nearExpiryQty: 0, vegetarian: true },
        { productId: P('DRINK-01').id, name: '鲜榨橙汁', category: 'DRINK', quantity: 40, unitPrice: 5.7, nearExpiryQty: 0, vegetarian: true },
      ],
      totalPrice: 1094.4, reasons: ['会议餐方案'], warnings: ['本单占门店日产能 33%，请平衡散客销售'],
      version: 1, status: 'ACCEPTED',
    }));

    // 3) 配送中（恒宇广告培训餐，单结）
    const deliveringOrder = await this.orderRepo.save(this.orderRepo.create({
      orderNo: `TM${Date.now().toString().slice(-10)}03`,
      enterpriseId: ent2.id, storeId: stores[1].id,
      occasion: 'TRAINING', headcount: 30, mealBudget: 25, vegetarianCount: 2,
      allergies: ['花生'], deliverAt: this.hoursFromNow(2),
      address: ent2.address, contactName: '李强', contactPhone: '13900003333',
      backupContactName: '赵敏', backupContactPhone: '13900004444',
      invoiceRequired: true, invoiceTitle: ent2.invoiceTitle, taxNo: ent2.taxNo,
      status: OrderStatus.OUT_FOR_DELIVERY, totalAmount: 690, createdBy: hyUser.id,
    }));
    await this.planRepo.save(this.planRepo.create({
      orderId: deliveringOrder.id, storeId: stores[1].id,
      items: [
        { productId: P('SAND-01').id, name: '火腿蛋三明治', category: 'SANDWICH', quantity: 28, unitPrice: 9, nearExpiryQty: 5, vegetarian: false },
        { productId: P('SAND-02').id, name: '全麦蔬菜三明治', category: 'SANDWICH', quantity: 2, unitPrice: 8.5, nearExpiryQty: 0, vegetarian: true },
        { productId: P('DRINK-02').id, name: '矿泉水', category: 'DRINK', quantity: 30, unitPrice: 2.5, nearExpiryQty: 0, vegetarian: true },
        { productId: P('FRUIT-02').id, name: '苹果切块杯', category: 'FRUIT', quantity: 30, unitPrice: 8, nearExpiryQty: 0, vegetarian: true },
      ],
      totalPrice: 690, reasons: ['轻食偏好方案'], warnings: [],
      version: 1, status: 'ACCEPTED',
    }));
    await this.deliveryRepo.save(this.deliveryRepo.create({
      orderId: deliveringOrder.id, courierId: courier1.id, thermalBoxNo: 'BX-1024',
      route: '高新写字楼店 → 中关村创业大厦',
      outboundAt: this.hoursFromNow(-0.5), pickedAt: this.hoursFromNow(-0.3),
      status: 'PICKED',
    }));

    // ============ 发票 ============
    await this.invoiceRepo.save([
      this.invoiceRepo.create({
        invoiceNo: 'INV20260801001', enterpriseId: ent1.id, orderId: arch1.id,
        title: ent1.invoiceTitle, taxNo: ent1.taxNo, amount: 900, status: 'ISSUED',
        issuedAt: this.daysFromNow(-40, 10),
      }),
      this.invoiceRepo.create({
        invoiceNo: 'INV20260902001', enterpriseId: ent1.id, orderId: arch5.id,
        title: '晨光科技', taxNo: 'ERROR-TAXNO', amount: 1050, status: 'ERROR',
        errorNote: '企业反馈发票抬头缺少"有限公司"，税号有误，需红冲重开',
      }),
      this.invoiceRepo.create({
        invoiceNo: `INV${Date.now()}P`, enterpriseId: ent2.id, orderId: null,
        title: ent2.invoiceTitle, taxNo: ent2.taxNo, amount: 690, status: 'PENDING',
      }),
    ]);

    // ============ 月结 ============
    const lastMonth = new Date();
    lastMonth.setMonth(lastMonth.getMonth() - 1);
    const lm = `${lastMonth.getFullYear()}-${String(lastMonth.getMonth() + 1).padStart(2, '0')}`;
    const cm = `${new Date().getFullYear()}-${String(new Date().getMonth() + 1).padStart(2, '0')}`;
    await this.settlementRepo.save([
      this.settlementRepo.create({
        enterpriseId: ent1.id, month: lm, totalAmount: 4580, orderCount: 5, status: 'PAID',
      }),
      this.settlementRepo.create({
        enterpriseId: ent1.id, month: cm, totalAmount: 0, orderCount: 0, status: 'OPEN',
      }),
    ]);

    // ============ 历史反馈 ============
    await this.feedbackRepo.save([
      this.feedbackRepo.create({ orderId: arch2.id, rating: 4, comment: '整体不错，便当温度可以再热一点', createdBy: cgUser.id }),
      this.feedbackRepo.create({ orderId: arch6.id, rating: 5, comment: '临期折扣很实惠，品质没问题', createdBy: cgUser.id }),
      this.feedbackRepo.create({ orderId: arch7.id, rating: 2, comment: '有 2 份便当异味，已反馈客服', spoiled: true, createdBy: cgUser.id }),
    ]);

    // ============ 临时加餐演示 ============
    // 场景一：晨光科技 40 人会议餐已确认、约 70 分钟后送达（送达前一小时窗口内），
    //         企业可在订单详情直接发起「临时加餐 30 份」体验 核查→确认→贴标 全流程
    //         （40+30=70 超过保温箱 60 份容量，核查报告会要求加派骑手）。
    const topupDemoOrder = await this.orderRepo.save(this.orderRepo.create({
      orderNo: `TM${Date.now().toString().slice(-10)}04`,
      enterpriseId: ent1.id, contractId: contract1.id, storeId: stores[0].id,
      occasion: 'MEETING', headcount: 40, mealBudget: 30, vegetarianCount: 4,
      allergies: ['海鲜'], deliverAt: this.hoursFromNow(70 / 60),
      address: ent1.address, contactName: '王芳', contactPhone: '13800001111',
      backupContactName: '刘洋', backupContactPhone: '13800002222',
      invoiceRequired: true, invoiceTitle: ent1.invoiceTitle, taxNo: ent1.taxNo,
      remark: '临时会议扩编，请预留加餐能力',
      status: OrderStatus.CONFIRMED, totalAmount: 1112.4, createdBy: cgUser.id,
    }));
    await this.planRepo.save(this.planRepo.create({
      orderId: topupDemoOrder.id, storeId: stores[0].id,
      items: [
        { productId: P('BENTO-02').id, name: '照烧鸡腿便当', category: 'BENTO', quantity: 36, unitPrice: 19, nearExpiryQty: 0, vegetarian: false },
        { productId: P('BENTO-03').id, name: '田园时蔬素食便当', category: 'BENTO', quantity: 4, unitPrice: 17.1, nearExpiryQty: 0, vegetarian: true },
        { productId: P('DRINK-01').id, name: '鲜榨橙汁', category: 'DRINK', quantity: 40, unitPrice: 5.7, nearExpiryQty: 0, vegetarian: true },
        { productId: P('FRUIT-01').id, name: '香蕉', category: 'FRUIT', quantity: 40, unitPrice: 3.3, nearExpiryQty: 0, vegetarian: true },
      ],
      totalPrice: 1112.4,
      reasons: ['优选「鲜达·中心旗舰店」供餐：距企业 0.3km，库存与产能充足', '含素食 4 份，单独装配并标注', '适用长期合同折扣 9.5 折'],
      warnings: [], version: 1, status: 'ACCEPTED',
    }));

    // 场景二：恒宇广告 30 人培训餐备货中（约 100 分钟后送达），20 分钟前已临时追加 20 份
    //         （含 4 份素食、1 人蛋过敏），加餐已确认，等待门店按企业名单贴标；
    //         单结企业已自动生成差额发票，拣货清单/配送标签已同步。
    const topupPrepOrder = await this.orderRepo.save(this.orderRepo.create({
      orderNo: `TM${Date.now().toString().slice(-10)}05`,
      enterpriseId: ent2.id, storeId: stores[1].id,
      occasion: 'TRAINING', headcount: 50, mealBudget: 25, vegetarianCount: 6,
      allergies: ['花生', '蛋'], deliverAt: this.hoursFromNow(100 / 60),
      address: ent2.address, contactName: '李强', contactPhone: '13900003333',
      backupContactName: '赵敏', backupContactPhone: '13900004444',
      invoiceRequired: true, invoiceTitle: ent2.invoiceTitle, taxNo: ent2.taxNo,
      remark: '培训现场临时增加 20 人，已走加餐流程',
      status: OrderStatus.PREPARING, totalAmount: 1288, createdBy: hyUser.id,
    }));
    await this.planRepo.save(this.planRepo.create({
      orderId: topupPrepOrder.id, storeId: stores[1].id,
      items: [
        { productId: P('BENTO-01').id, name: '黑椒牛柳便当', category: 'BENTO', quantity: 28, unitPrice: 20, nearExpiryQty: 0, vegetarian: false },
        { productId: P('BENTO-03').id, name: '田园时蔬素食便当', category: 'BENTO', quantity: 2, unitPrice: 18, nearExpiryQty: 0, vegetarian: true },
        { productId: P('DRINK-01').id, name: '鲜榨橙汁', category: 'DRINK', quantity: 30, unitPrice: 6, nearExpiryQty: 0, vegetarian: true },
      ],
      totalPrice: 776,
      reasons: ['培训餐方案'],
      warnings: [], version: 1, status: 'ACCEPTED',
    }));
    const topupItems = [
      { productId: P('BENTO-01').id, name: '黑椒牛柳便当', category: 'BENTO', quantity: 16, unitPrice: 20, nearExpiryQty: 0, vegetarian: false },
      { productId: P('BENTO-03').id, name: '田园时蔬素食便当', category: 'BENTO', quantity: 4, unitPrice: 18, nearExpiryQty: 0, vegetarian: true },
      { productId: P('DRINK-01').id, name: '鲜榨橙汁', category: 'DRINK', quantity: 20, unitPrice: 6, nearExpiryQty: 0, vegetarian: true },
    ];
    const topupRoster = [
      { name: '陈晨', tag: '素食', labelCode: 'TCSEED01-L01', productName: '田园时蔬素食便当', labelled: false },
      { name: '吴迪', tag: '素食', labelCode: 'TCSEED01-L02', productName: '田园时蔬素食便当', labelled: false },
      { name: '素食3', tag: '素食', labelCode: 'TCSEED01-L03', productName: '田园时蔬素食便当', labelled: false },
      { name: '素食4', tag: '素食', labelCode: 'TCSEED01-L04', productName: '田园时蔬素食便当', labelled: false },
      { name: '黄磊', tag: '过敏:蛋', labelCode: 'TCSEED01-L05', productName: '黑椒牛柳便当', labelled: false },
    ];
    const diffInvoice = await this.invoiceRepo.save(this.invoiceRepo.create({
      invoiceNo: `INV${Date.now()}TD`, enterpriseId: ent2.id, orderId: topupPrepOrder.id,
      title: ent2.invoiceTitle, taxNo: ent2.taxNo, amount: 512, status: 'PENDING', kind: 'TOPUP_DIFF',
    }));
    await this.topUpRepo.save(this.topUpRepo.create({
      topUpNo: 'TCSEED01', orderId: topupPrepOrder.id, enterpriseId: ent2.id, storeId: stores[1].id,
      addHeadcount: 20, addVegetarianCount: 4, addAllergies: ['蛋'],
      specialDietRoster: topupRoster,
      items: topupItems, batchAllocations: [],
      addAmount: 512, addDeliveryFee: 0, totalDiff: 512,
      invoiceAmountBefore: 776, invoiceAmountAfter: 1288, invoiceId: diffInvoice.id,
      newDeliverAt: this.hoursFromNow(100 / 60), originDeliverAt: this.hoursFromNow(100 / 60),
      status: 'CONFIRMED',
      checks: [],
      deliveryCapacity: { boxCapacity: 60, originQty: 30, totalAfter: 50, overflow: 0, extraDispatch: false, fee: 0 },
      extraCourierRequired: false, extraCourierId: null,
      vegLabelCount: 4, allergyLabelCount: 1, pickListSynced: true,
      createdBy: hyUser.id,
    }));

    // ============ 餐食变质售后演示 ============
    // 基于 arch7（晨光科技加班餐，已有食安紧急工单 GD20260913001）：
    // 2 份黑椒牛柳便当变质，已收集批次/签收时间/温控照片/食用人员；
    // 客服已受理并提出 2 倍批量退款（¥88，待财务确认），补送单已备货待骑手取货；
    // 同批次下架由客服在「售后工单」中触发（会扫描 3 家门店在架库存与未配送团餐）。
    const spoiledBatch = await this.batchRepo.findOne({
      where: { storeId: stores[0].id, productId: P('BENTO-01').id, status: 'AVAILABLE' },
      order: { producedAt: 'DESC' },
    });
    const spoiledReport = await this.spoiledRepo.save(this.spoiledRepo.create({
      reportNo: 'SH-SEED01', orderId: arch7.id, enterpriseId: ent1.id, storeId: stores[0].id,
      incidentId: openIncident.id, issueType: 'SPOILED',
      items: [{
        productId: P('BENTO-01').id, name: '黑椒牛柳便当', category: 'BENTO',
        unitPrice: 22, qty: 2, issueType: 'SPOILED',
        batchId: spoiledBatch?.id ?? null, batchNo: spoiledBatch?.batchNo || '批次待核对',
      }],
      deliveredAt: this.daysFromNow(-3, 12),
      photos: [
        { fileName: '温控照片-便当表面.jpg', surfaceTemp: 38.2, coreTemp: 35.6, takenAt: this.daysFromNow(-3, 13), note: '开箱后保温箱温度偏高，便当表面发黏' },
        { fileName: '包装标签批次.jpg', surfaceTemp: null, coreTemp: null, takenAt: this.daysFromNow(-3, 13), note: '包装标签与批次号清晰可辨' },
      ],
      diners: [
        { name: '张伟', phone: '13500010001', symptom: '食用后腹泻' },
        { name: '陈静（员工）', phone: '13500010002', symptom: '异味未食用' },
        { name: '黄磊', phone: '13500010003', symptom: '轻微恶心' },
      ],
      description: '加班餐 2 份黑椒牛柳便当开封有酸味、米饭发黏，疑似冷链中断，请按食安流程处理',
      status: 'PROCESSING',
      refundAmount: 88, refundMultiplier: 2, refundStatus: 'PROPOSED',
      handledBy: users[8].id, createdBy: cgUser.id,
    }));
    // 补送单：门店已用新鲜批次备货（扣减 2 份），待骑手取货送达
    if (spoiledBatch) {
      spoiledBatch.quantity = Math.max(0, spoiledBatch.quantity - 2);
      if (spoiledBatch.quantity === 0) spoiledBatch.status = 'DEPLETED';
      await this.batchRepo.save(spoiledBatch);
    }
    const redelivery = await this.redeliveryRepo.save(this.redeliveryRepo.create({
      redeliveryNo: 'BC-SEED01', reportId: spoiledReport.id, orderId: arch7.id,
      enterpriseId: ent1.id, storeId: stores[0].id,
      items: [{ productId: P('BENTO-01').id, name: '黑椒牛柳便当（新鲜批次补送）', quantity: 2, unitPrice: 22 }],
      status: 'READY', courierId: courier1.id, readyAt: new Date(),
    }));
    spoiledReport.redeliveryId = redelivery.id;
    await this.spoiledRepo.save(spoiledReport);
    await this.incidentLogRepo.save(this.incidentLogRepo.create({
      incidentId: openIncident.id, actorId: cgUser.id, actorName: '王芳', actorRole: '企业行政',
      action: 'CREATED', note: '补充提交结构化变质售后单 SH-SEED01：批次/签收时间/温控照片 2 张/食用人员 3 人已收集',
    }));
    await this.incidentLogRepo.save(this.incidentLogRepo.create({
      incidentId: openIncident.id, actorId: users[8].id, actorName: '陈静', actorRole: '客服',
      action: 'COMMENT', note: '已受理：提出 2 倍批量退款 ¥88 待财务确认；补送单 BC-SEED01 已备货待骑手送达；同批次下架待触发',
    }));

    // ============ 临期鲜食优先调拨折扣演示 ============
    const offerRules = (rate: number) => [
      `【临期定性】本批餐食为临期鲜食优先调拨，已由企业行政确认按 ${rate} 折结算；餐食临近保质期但仍在保质期内、符合团餐送达后 2 小时食用要求，"临期/新鲜度不及正价餐"本身不属于质量问题，不得据此按餐食变质申请售后。`,
      `【食用时限】请于送达后 2 小时内且不晚于包装批次到期时间食用完毕；逾期食用或企业签收后未按标示温控暂存导致的问题，由企业自行承担。`,
      '【温控责任】门店按标示温区出库、仓配全程温控配送并记录温度；企业签收后脱离温控暂存导致的变质不纳入平台赔付。',
      '【真实食安不免责】若餐食存在异味、变质、异物等真实食品安全问题，企业仍可凭批次号与温控照片提交变质售后，平台按食安流程受理（批量退款/补送/同批次下架），临期折扣不免除平台质量责任。',
      '【确认凭据】企业对本方案的确认记录（含批次、折扣、温控、售后规则、逐份餐食标记）已写入团餐单、月结附件与售后说明，作为售后责任界定依据。',
    ];

    // 场景一：晨光科技 20 人会议餐（4 小时后送达，月结），中心旗舰店有一批照烧鸡腿便当
    //         7 小时后到期，送达时仍有 3 小时食用窗口，门店已推荐 7 折临期方案，待企业行政确认。
    const neDeliverAt = this.hoursFromNow(4);
    const neBatchExpire = this.hoursFromNow(7);
    const neBatch = await this.batchRepo.save(this.batchRepo.create({
      batchNo: 'B-NEAR01', storeId: stores[0].id, productId: P('BENTO-02').id,
      quantity: 20, initialQuantity: 20,
      producedAt: this.hoursFromNow(-1), expiresAt: neBatchExpire,
      tempZone: 'HOT', supplierId: suppliers[0].id, status: 'AVAILABLE',
    }));
    const offerOrder = await this.orderRepo.save(this.orderRepo.create({
      orderNo: `TM${Date.now().toString().slice(-10)}06`,
      enterpriseId: ent1.id, contractId: contract1.id, storeId: stores[0].id,
      occasion: 'MEETING', headcount: 20, mealBudget: 30, vegetarianCount: 0,
      allergies: [], deliverAt: neDeliverAt,
      address: ent1.address, contactName: '王芳', contactPhone: '13800001111',
      backupContactName: '刘洋', backupContactPhone: '13800002222',
      invoiceRequired: true, invoiceTitle: ent1.invoiceTitle, taxNo: ent1.taxNo,
      remark: '部门季度复盘会工作餐',
      status: OrderStatus.CONFIRMED, totalAmount: 560, createdBy: cgUser.id,
    }));
    await this.planRepo.save(this.planRepo.create({
      orderId: offerOrder.id, storeId: stores[0].id,
      items: [
        { productId: P('BENTO-02').id, name: '照烧鸡腿便当', category: 'BENTO', quantity: 20, unitPrice: 19, nearExpiryQty: 0, vegetarian: false },
        { productId: P('DRINK-01').id, name: '鲜榨橙汁', category: 'DRINK', quantity: 20, unitPrice: 5.7, nearExpiryQty: 0, vegetarian: true },
        { productId: P('FRUIT-01').id, name: '香蕉', category: 'FRUIT', quantity: 20, unitPrice: 3.3, nearExpiryQty: 0, vegetarian: true },
      ],
      totalPrice: 560,
      reasons: ['优选「鲜达·中心旗舰店」供餐：距企业 0.3km，库存与产能充足', '适用长期合同折扣 9.5 折'],
      warnings: [], version: 1, status: 'ACCEPTED',
    }));
    const offerReason = `该批次为「鲜达·中心旗舰店」当日鲜食，今日 ${String(neBatchExpire.getHours()).padStart(2, '0')}:${String(neBatchExpire.getMinutes()).padStart(2, '0')} 到期，按团餐时间（${String(neDeliverAt.getHours()).padStart(2, '0')}:${String(neDeliverAt.getMinutes()).padStart(2, '0')} 送达）核验仍保留 3 小时食用窗口（≥2 小时），符合团餐供餐要求；为避免临期报损、优先团餐消化，按 0.7 折调拨。餐食仍在保质期内，非质量问题折价。`;
    await this.offerRepo.save(this.offerRepo.create({
      offerNo: 'NE-SEED-PENDING', orderId: offerOrder.id, enterpriseId: ent1.id, storeId: stores[0].id,
      recommendedBy: users[3].id, recommendedByRole: 'STORE', status: 'PROPOSED',
      items: [{
        productId: P('BENTO-02').id, name: '照烧鸡腿便当', category: 'BENTO', vegetarian: false,
        quantity: 20, unitPrice: 19, discountRate: 0.7, discountPrice: 13.3,
        lineOriginal: 380, lineFinal: 266, lineSaving: 114,
        batchId: neBatch.id, batchNo: neBatch.batchNo,
        sourceStoreId: stores[0].id, sourceStoreName: stores[0].name, crossStore: false,
        producedAt: this.hoursFromNow(-1), expiresAt: neBatchExpire, tempZone: 'HOT', remainHours: 3,
      }],
      portions: [],
      originalAmount: 380, finalAmount: 266, savingAmount: 114, totalQuantity: 20,
      discountReason: offerReason,
      tempControl: {
        zones: ['HOT'], requirement: '热链鲜食全程保温配送，门店出餐中心温度 ≥60℃',
        box: '热链保温箱（箱内 ≥60℃）', deliverTemp: '送达中心温度 ≥55℃', eatBeforeHours: 2,
        note: '送达后请按标示温度暂存，并于 2 小时食用窗口内食用完毕',
      },
      afterSalesRules: offerRules(0.7),
      mealTimeCheck: {
        deliverAt: neDeliverAt, eatWindowHours: 2, nearLookupHours: 6, passed: true,
        lines: [{
          productName: '照烧鸡腿便当', batchNo: neBatch.batchNo, sourceStoreName: stores[0].name,
          expiresAt: neBatchExpire, remainHours: 3, ok: true, reason: '送达时仍有 3 小时食用窗口（要求 ≥2 小时）',
        }],
      },
      transferIds: [], stockDeducted: false,
    }));

    // 场景二：本月已归档团餐（晨光科技月结），临期折扣方案企业已确认并履约，
    //         含逐份餐食标记、企业确认快照；财务当月归集月结时自动进入月结附件。
    const doneDeliverAt = new Date();
    doneDeliverAt.setHours(11, 30, 0, 0);
    const doneExpire = new Date();
    doneExpire.setHours(14, 0, 0, 0);
    const fulfilledBatch = await this.batchRepo.save(this.batchRepo.create({
      batchNo: 'B-NEAR02', storeId: stores[0].id, productId: P('BENTO-03').id,
      quantity: 0, initialQuantity: 12,
      producedAt: new Date(doneDeliverAt.getTime() - 5 * 3600000), expiresAt: doneExpire,
      tempZone: 'HOT', supplierId: suppliers[0].id, status: 'DEPLETED',
    }));
    const doneItems = [
      { productId: P('BENTO-03').id, name: '田园时蔬素食便当', category: 'BENTO', quantity: 12, unitPrice: 17.1, nearExpiryQty: 12, vegetarian: true },
      { productId: P('DRINK-01').id, name: '鲜榨橙汁', category: 'DRINK', quantity: 12, unitPrice: 5.7, nearExpiryQty: 0, vegetarian: true },
    ];
    const doneTotal = 212.04;
    const doneOrder = await this.orderRepo.save(this.orderRepo.create({
      orderNo: 'TM202609NE07',
      enterpriseId: ent1.id, contractId: contract1.id, storeId: stores[0].id,
      occasion: 'MEETING', headcount: 12, mealBudget: 30, vegetarianCount: 12,
      allergies: [], deliverAt: doneDeliverAt,
      address: ent1.address, contactName: '王芳', contactPhone: '13800001111',
      backupContactName: '刘洋', backupContactPhone: '13800002222',
      invoiceRequired: true, invoiceTitle: ent1.invoiceTitle, taxNo: ent1.taxNo,
      status: OrderStatus.COMPLETED, totalAmount: doneTotal,
      actualHeadcount: 12, actualAmount: doneTotal, createdBy: cgUser.id,
      createdAt: doneDeliverAt, updatedAt: new Date(),
    }));
    await this.planRepo.save(this.planRepo.create({
      orderId: doneOrder.id, storeId: stores[0].id, items: doneItems, totalPrice: doneTotal,
      reasons: ['优选「鲜达·中心旗舰店」供餐', '临期鲜食优先调拨 12 份经企业行政 王芳 确认（方案 NE-SEED-DONE，0.7 折，节省 ¥61.56）'],
      warnings: [], version: 1, status: 'ACCEPTED',
    }));
    await this.deliveryRepo.save(this.deliveryRepo.create({
      orderId: doneOrder.id, courierId: courier1.id, thermalBoxNo: 'BX-NEAR',
      route: '中心旗舰店 → 建国路 SOHO',
      outboundAt: new Date(doneDeliverAt.getTime() - 50 * 60000),
      pickedAt: new Date(doneDeliverAt.getTime() - 40 * 60000),
      deliveredAt: new Date(doneDeliverAt.getTime() - 5 * 60000),
      signedAt: new Date(doneDeliverAt.getTime() + 10 * 60000), signerName: '王芳',
      status: 'SIGNED', late: false,
    }));
    const confirmedAt = new Date(doneDeliverAt.getTime() - 3 * 3600000);
    const donePortions = Array.from({ length: 12 }, (_, i) => ({
      code: `NE-SEED-DONE-P${String(i + 1).padStart(3, '0')}`,
      productId: P('BENTO-03').id, productName: '田园时蔬素食便当',
      batchNo: fulfilledBatch.batchNo, inboundBatchNo: null,
      sourceStoreName: stores[0].name, tempZone: 'HOT', tempZoneName: '热链',
      producedAt: new Date(doneDeliverAt.getTime() - 5 * 3600000), expiresAt: doneExpire,
      eatBefore: doneExpire, discountRate: 0.7, discountPrice: 11.97, unitPrice: 17.1,
      discountReason: offerReason.replace('照烧鸡腿便当', '田园时蔬素食便当').replace(/今日 \d{2}:\d{2}/,
        `今日 ${String(doneExpire.getHours()).padStart(2, '0')}:${String(doneExpire.getMinutes()).padStart(2, '0')}`),
      afterSalesRules: offerRules(0.7),
      label: '临期调拨 7 折',
    }));
    await this.offerRepo.save(this.offerRepo.create({
      offerNo: 'NE-SEED-DONE', orderId: doneOrder.id, enterpriseId: ent1.id, storeId: stores[0].id,
      recommendedBy: users[3].id, recommendedByRole: 'STORE', status: 'FULFILLED',
      items: [{
        productId: P('BENTO-03').id, name: '田园时蔬素食便当', category: 'BENTO', vegetarian: true,
        quantity: 12, unitPrice: 17.1, discountRate: 0.7, discountPrice: 11.97,
        lineOriginal: 205.2, lineFinal: 143.64, lineSaving: 61.56,
        batchId: fulfilledBatch.id, batchNo: fulfilledBatch.batchNo,
        sourceStoreId: stores[0].id, sourceStoreName: stores[0].name, crossStore: false,
        producedAt: new Date(doneDeliverAt.getTime() - 5 * 3600000), expiresAt: doneExpire,
        tempZone: 'HOT', remainHours: 2.5, fulfilledBatchId: fulfilledBatch.id,
      }],
      portions: donePortions,
      originalAmount: 205.2, finalAmount: 143.64, savingAmount: 61.56, totalQuantity: 12,
      discountReason: '临期鲜食优先调拨：覆盖 12 份团餐主食，0.7 折。全部批次经团餐时间核验，送达时仍保留 ≥2 小时食用窗口；为减少门店临期报损而折价，餐食仍在保质期内，非质量问题。',
      tempControl: {
        zones: ['HOT'], requirement: '热链鲜食全程保温配送，门店出餐中心温度 ≥60℃',
        box: '热链保温箱（箱内 ≥60℃）', deliverTemp: '送达中心温度 ≥55℃', eatBeforeHours: 2,
        note: '送达后请按标示温度暂存，并于 2 小时食用窗口内食用完毕',
      },
      afterSalesRules: offerRules(0.7),
      mealTimeCheck: {
        deliverAt: doneDeliverAt, eatWindowHours: 2, nearLookupHours: 6, passed: true,
        lines: [{
          productName: '田园时蔬素食便当', batchNo: fulfilledBatch.batchNo, sourceStoreName: stores[0].name,
          expiresAt: doneExpire, remainHours: 2.5, ok: true, reason: '送达时仍有 2.5 小时食用窗口（要求 ≥2 小时）',
        }],
      },
      transferIds: [], stockDeducted: true,
      confirmedBy: cgUser.id, confirmedByName: '王芳', confirmedAt,
      confirmationSnapshot: {
        offerNo: 'NE-SEED-DONE', orderNo: doneOrder.orderNo, enterpriseId: ent1.id,
        confirmedBy: cgUser.id, confirmedByName: '王芳', confirmedAt,
        totalQuantity: 12, originalAmount: 205.2, finalAmount: 143.64, savingAmount: 61.56,
        afterSalesRules: offerRules(0.7), settlementType: 'MONTHLY',
      },
      labelConfirmed: true, labelledBy: users[3].id, labelledAt: new Date(doneDeliverAt.getTime() - 45 * 60000),
      labelNote: '已对 12 份临期餐食逐份贴标（含折扣原因与售后规则）',
      fulfilledAt: new Date(doneDeliverAt.getTime() - 40 * 60000),
    }));
    await this.archiveRepo.save(this.archiveRepo.create({
      orderId: doneOrder.id, enterpriseId: ent1.id, storeId: stores[0].id,
      actualAmount: doneTotal, actualHeadcount: 12, returnCount: 0, returnAmount: 0,
      nearExpiryUsed: 12, nearExpiryOfferCount: 1, nearExpiryDiscountAmount: 61.56,
      compensation: 0, onTime: true, incidentCount: 0, invoiceErrors: 0, rating: 5,
      items: doneItems, deliveredAt: new Date(doneDeliverAt.getTime() - 5 * 60000),
    }));
  }
}
