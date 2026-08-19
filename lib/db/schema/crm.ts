import { relations } from 'drizzle-orm'
import {
  integer,
  pgTable,
  real,
  text,
  timestamp,
  boolean,
  index,
  uniqueIndex,
} from 'drizzle-orm/pg-core'

export const customers = pgTable(
  'customers',
  {
    id: text('id').primaryKey(),
    name: text('name').notNull(),
    email: text('email').notNull().default(''),
    phone: text('phone').notNull(),
    nin: text('nin').notNull().default(''),
    bvn: text('bvn').notNull().default(''),
    address: text('address').notNull(),
    city: text('city').notNull(),
    state: text('state').notNull(),
    lga: text('lga').notNull().default(''),
    latitude: real('latitude'),
    longitude: real('longitude'),
    gpsCapturedAt: timestamp('gps_captured_at'),
    gpsLocked: boolean('gps_locked').notNull().default(false),
    gpsOutOfArea: boolean('gps_out_of_area').notNull().default(false),
    photoUrl: text('photo_url').notNull().default(''),
    businessType: text('business_type').notNull(),
    creditLimit: integer('credit_limit').notNull().default(0),
    totalPurchases: integer('total_purchases').notNull().default(0),
    outstandingBalance: integer('outstanding_balance').notNull().default(0),
    avatar: text('avatar'),
    createdAt: timestamp('created_at').defaultNow().notNull(),
  },
  (table) => [
    index('customers_phone_idx').on(table.phone),
    index('customers_nin_idx').on(table.nin),
    index('customers_bvn_idx').on(table.bvn),
  ]
)

export const products = pgTable(
  'products',
  {
    id: text('id').primaryKey(),
    sku: text('sku').notNull(),
    name: text('name').notNull(),
    category: text('category').notNull(),
    brand: text('brand').notNull(),
    description: text('description').notNull().default(''),
    price: integer('price').notNull(),
    cost: integer('cost').notNull(),
    stock: integer('stock').notNull().default(0),
    unit: text('unit').notNull().default('pcs'),
    image: text('image'),
    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at').defaultNow().notNull(),
  },
  (table) => [uniqueIndex('products_sku_idx').on(table.sku)]
)

export const sales = pgTable(
  'sales',
  {
    id: text('id').primaryKey(),
    customerId: text('customer_id')
      .notNull()
      .references(() => customers.id),
    date: timestamp('date').defaultNow().notNull(),
    status: text('status').notNull().default('pending_payment'),
    paymentType: text('payment_type').notNull(),
    paymentMethod: text('payment_method').notNull().default('cash'),
    installmentWeeks: integer('installment_weeks'),
    installmentIntervalDays: integer('installment_interval_days'),
    planEndDate: timestamp('plan_end_date'),
    totalAmount: integer('total_amount').notNull(),
    amountPaid: integer('amount_paid').notNull().default(0),
    discountPercent: real('discount_percent').notNull().default(0),
    vatAmount: integer('vat_amount').notNull().default(0),
    transportCost: integer('transport_cost').notNull().default(0),
    profit: integer('profit').notNull().default(0),
    notes: text('notes').notNull().default(''),
    latitude: real('latitude'),
    longitude: real('longitude'),
    gpsCapturedAt: timestamp('gps_captured_at'),
    gpsLocked: boolean('gps_locked').notNull().default(false),
    gpsOutOfArea: boolean('gps_out_of_area').notNull().default(false),
    sitePhotoUrl: text('site_photo_url').notNull().default(''),
    createdAt: timestamp('created_at').defaultNow().notNull(),
  },
  (table) => [index('sales_customer_id_idx').on(table.customerId)]
)

export const saleItems = pgTable(
  'sale_items',
  {
    id: text('id').primaryKey(),
    saleId: text('sale_id')
      .notNull()
      .references(() => sales.id, { onDelete: 'cascade' }),
    productId: text('product_id')
      .notNull()
      .references(() => products.id),
    quantity: integer('quantity').notNull(),
    unitPrice: integer('unit_price').notNull(),
    total: integer('total').notNull(),
  },
  (table) => [index('sale_items_sale_id_idx').on(table.saleId)]
)

export const invoices = pgTable(
  'invoices',
  {
    id: text('id').primaryKey(),
    invoiceNumber: text('invoice_number').notNull(),
    saleId: text('sale_id')
      .notNull()
      .references(() => sales.id, { onDelete: 'cascade' }),
    customerId: text('customer_id')
      .notNull()
      .references(() => customers.id),
    issueDate: timestamp('issue_date').defaultNow().notNull(),
    dueDate: timestamp('due_date').notNull(),
    status: text('status').notNull().default('sent'),
    totalAmount: integer('total_amount').notNull(),
    paidAmount: integer('paid_amount').notNull().default(0),
  },
  (table) => [
    uniqueIndex('invoices_sale_id_idx').on(table.saleId),
    uniqueIndex('invoices_invoice_number_idx').on(table.invoiceNumber),
  ]
)

export const invoiceItems = pgTable(
  'invoice_items',
  {
    id: text('id').primaryKey(),
    invoiceId: text('invoice_id')
      .notNull()
      .references(() => invoices.id, { onDelete: 'cascade' }),
    productId: text('product_id')
      .notNull()
      .references(() => products.id),
    description: text('description').notNull(),
    quantity: integer('quantity').notNull(),
    unitPrice: integer('unit_price').notNull(),
    total: integer('total').notNull(),
  },
  (table) => [index('invoice_items_invoice_id_idx').on(table.invoiceId)]
)

export const paymentSchedules = pgTable(
  'payment_schedules',
  {
    id: text('id').primaryKey(),
    saleId: text('sale_id')
      .notNull()
      .references(() => sales.id, { onDelete: 'cascade' }),
    invoiceId: text('invoice_id')
      .notNull()
      .references(() => invoices.id, { onDelete: 'cascade' }),
    customerId: text('customer_id')
      .notNull()
      .references(() => customers.id),
    paymentType: text('payment_type').notNull(),
    installmentWeeks: integer('installment_weeks'),
    installmentIntervalDays: integer('installment_interval_days'),
    planEndDate: timestamp('plan_end_date'),
    totalAmount: integer('total_amount').notNull(),
    paidAmount: integer('paid_amount').notNull().default(0),
    nextDueDate: timestamp('next_due_date'),
  },
  (table) => [uniqueIndex('payment_schedules_sale_id_idx').on(table.saleId)]
)

export const installments = pgTable(
  'installments',
  {
    id: text('id').primaryKey(),
    scheduleId: text('schedule_id')
      .notNull()
      .references(() => paymentSchedules.id, { onDelete: 'cascade' }),
    weekNumber: integer('week_number').notNull(),
    amount: integer('amount').notNull(),
    paidAmount: integer('paid_amount').notNull().default(0),
    dueDate: timestamp('due_date').notNull(),
    paidDate: timestamp('paid_date'),
    status: text('status').notNull().default('pending'), // pending | partial | paid | overdue
    reminder: boolean('reminder').notNull().default(false),
    reminderSmsSentAt: timestamp('reminder_sms_sent_at'),
    overdueSmsSentAt: timestamp('overdue_sms_sent_at'),
  },
  (table) => [index('installments_schedule_id_idx').on(table.scheduleId)]
)

export const payments = pgTable(
  'payments',
  {
    id: text('id').primaryKey(),
    invoiceId: text('invoice_id')
      .notNull()
      .references(() => invoices.id, { onDelete: 'cascade' }),
    saleId: text('sale_id')
      .notNull()
      .references(() => sales.id, { onDelete: 'cascade' }),
    customerId: text('customer_id')
      .notNull()
      .references(() => customers.id),
    scheduleId: text('schedule_id').references(() => paymentSchedules.id, {
      onDelete: 'set null',
    }),
    installmentId: text('installment_id').references(() => installments.id, {
      onDelete: 'set null',
    }),
    amount: integer('amount').notNull(),
    date: timestamp('date').defaultNow().notNull(),
    method: text('method').notNull().default('cash'),
    reference: text('reference').notNull().default(''),
    bank: text('bank').notNull().default(''),
    status: text('status').notNull().default('success'),
    paymentType: text('payment_type').notNull(),
    weekNumber: integer('week_number'),
    isPartial: boolean('is_partial').notNull().default(false),
    expectedAmount: integer('expected_amount'),
    validityDays: integer('validity_days'),
    activationId: text('activation_id'),
    notes: text('notes').notNull().default(''),
    createdByUserId: text('created_by_user_id'),
    createdAt: timestamp('created_at').defaultNow().notNull(),
  },
  (table) => [
    index('payments_sale_id_idx').on(table.saleId),
    index('payments_customer_id_idx').on(table.customerId),
    index('payments_invoice_id_idx').on(table.invoiceId),
    index('payments_date_idx').on(table.date),
  ]
)

export const inventoryMovements = pgTable(
  'inventory_movements',
  {
    id: text('id').primaryKey(),
    productId: text('product_id')
      .notNull()
      .references(() => products.id),
    type: text('type').notNull(),
    quantity: integer('quantity').notNull(),
    reference: text('reference').notNull(),
    date: timestamp('date').defaultNow().notNull(),
    notes: text('notes').notNull().default(''),
  },
  (table) => [index('inventory_movements_product_id_idx').on(table.productId)]
)

export const warranties = pgTable(
  'warranties',
  {
    id: text('id').primaryKey(),
    saleId: text('sale_id')
      .notNull()
      .references(() => sales.id, { onDelete: 'cascade' }),
    productId: text('product_id')
      .notNull()
      .references(() => products.id),
    customerId: text('customer_id')
      .notNull()
      .references(() => customers.id),
    serialNumber: text('serial_number').notNull().default(''),
    warrantyPeriodMonths: integer('warranty_period_months').notNull().default(24),
    startDate: timestamp('start_date').notNull(),
    expiryDate: timestamp('expiry_date').notNull(),
    status: text('status').notNull().default('active'),
    createdAt: timestamp('created_at').defaultNow().notNull(),
  },
  (table) => [
    index('warranties_sale_id_idx').on(table.saleId),
    index('warranties_customer_id_idx').on(table.customerId),
  ]
)

export const warrantyClaims = pgTable(
  'warranty_claims',
  {
    id: text('id').primaryKey(),
    warrantyId: text('warranty_id')
      .notNull()
      .references(() => warranties.id, { onDelete: 'cascade' }),
    claimDate: timestamp('claim_date').defaultNow().notNull(),
    issueDescription: text('issue_description').notNull(),
    status: text('status').notNull().default('pending'),
    resolution: text('resolution').notNull().default(''),
  },
  (table) => [index('warranty_claims_warranty_id_idx').on(table.warrantyId)]
)

export const activationCodes = pgTable(
  'activation_codes',
  {
    id: text('id').primaryKey(),
    code: text('code').notNull(),
    phone: text('phone').notNull(),
    customerId: text('customer_id')
      .notNull()
      .references(() => customers.id),
    saleId: text('sale_id').references(() => sales.id, { onDelete: 'set null' }),
    warrantyId: text('warranty_id').references(() => warranties.id, {
      onDelete: 'set null',
    }),
    paymentId: text('payment_id'),
    deviceSerial: text('device_serial').notNull().default(''),
    messageBody: text('message_body').notNull(),
    status: text('status').notNull().default('pending'), // pending | sent | failed | used | expired
    validityDays: integer('validity_days').notNull().default(30),
    amountPaid: integer('amount_paid').notNull().default(0),
    expectedAmount: integer('expected_amount'),
    isPartial: boolean('is_partial').notNull().default(false),
    expiresAt: timestamp('expires_at').notNull(),
    providerMessageId: text('provider_message_id'),
    providerResponse: text('provider_response'),
    errorMessage: text('error_message'),
    sentAt: timestamp('sent_at'),
    createdAt: timestamp('created_at').defaultNow().notNull(),
    createdByUserId: text('created_by_user_id'),
  },
  (table) => [
    index('activation_codes_customer_id_idx').on(table.customerId),
    index('activation_codes_sale_id_idx').on(table.saleId),
    index('activation_codes_phone_idx').on(table.phone),
    index('activation_codes_status_idx').on(table.status),
    index('activation_codes_payment_id_idx').on(table.paymentId),
  ]
)

export const productsRelations = relations(products, ({ many }) => ({
  saleItems: many(saleItems),
  inventoryMovements: many(inventoryMovements),
  warranties: many(warranties),
}))

export const customersRelations = relations(customers, ({ many }) => ({
  sales: many(sales),
  warranties: many(warranties),
  payments: many(payments),
}))

export const salesRelations = relations(sales, ({ one, many }) => ({
  customer: one(customers, {
    fields: [sales.customerId],
    references: [customers.id],
  }),
  items: many(saleItems),
  invoice: one(invoices),
  schedule: one(paymentSchedules),
  warranties: many(warranties),
  payments: many(payments),
}))

export const saleItemsRelations = relations(saleItems, ({ one }) => ({
  sale: one(sales, {
    fields: [saleItems.saleId],
    references: [sales.id],
  }),
  product: one(products, {
    fields: [saleItems.productId],
    references: [products.id],
  }),
}))

export const invoicesRelations = relations(invoices, ({ one, many }) => ({
  sale: one(sales, {
    fields: [invoices.saleId],
    references: [sales.id],
  }),
  customer: one(customers, {
    fields: [invoices.customerId],
    references: [customers.id],
  }),
  items: many(invoiceItems),
}))

export const invoiceItemsRelations = relations(invoiceItems, ({ one }) => ({
  invoice: one(invoices, {
    fields: [invoiceItems.invoiceId],
    references: [invoices.id],
  }),
  product: one(products, {
    fields: [invoiceItems.productId],
    references: [products.id],
  }),
}))

export const paymentSchedulesRelations = relations(paymentSchedules, ({ one, many }) => ({
  sale: one(sales, {
    fields: [paymentSchedules.saleId],
    references: [sales.id],
  }),
  invoice: one(invoices, {
    fields: [paymentSchedules.invoiceId],
    references: [invoices.id],
  }),
  customer: one(customers, {
    fields: [paymentSchedules.customerId],
    references: [customers.id],
  }),
  installments: many(installments),
}))

export const installmentsRelations = relations(installments, ({ one }) => ({
  schedule: one(paymentSchedules, {
    fields: [installments.scheduleId],
    references: [paymentSchedules.id],
  }),
}))

export const paymentsRelations = relations(payments, ({ one }) => ({
  sale: one(sales, {
    fields: [payments.saleId],
    references: [sales.id],
  }),
  invoice: one(invoices, {
    fields: [payments.invoiceId],
    references: [invoices.id],
  }),
  customer: one(customers, {
    fields: [payments.customerId],
    references: [customers.id],
  }),
  schedule: one(paymentSchedules, {
    fields: [payments.scheduleId],
    references: [paymentSchedules.id],
  }),
  installment: one(installments, {
    fields: [payments.installmentId],
    references: [installments.id],
  }),
}))

export const inventoryMovementsRelations = relations(inventoryMovements, ({ one }) => ({
  product: one(products, {
    fields: [inventoryMovements.productId],
    references: [products.id],
  }),
}))

export const warrantiesRelations = relations(warranties, ({ one, many }) => ({
  sale: one(sales, {
    fields: [warranties.saleId],
    references: [sales.id],
  }),
  product: one(products, {
    fields: [warranties.productId],
    references: [products.id],
  }),
  customer: one(customers, {
    fields: [warranties.customerId],
    references: [customers.id],
  }),
  claims: many(warrantyClaims),
}))

export const warrantyClaimsRelations = relations(warrantyClaims, ({ one }) => ({
  warranty: one(warranties, {
    fields: [warrantyClaims.warrantyId],
    references: [warranties.id],
  }),
}))

export const activationCodesRelations = relations(activationCodes, ({ one }) => ({
  customer: one(customers, {
    fields: [activationCodes.customerId],
    references: [customers.id],
  }),
  sale: one(sales, {
    fields: [activationCodes.saleId],
    references: [sales.id],
  }),
  warranty: one(warranties, {
    fields: [activationCodes.warrantyId],
    references: [warranties.id],
  }),
}))
