export type PaymentType = 'full' | 'installment'
export type SaleStatus = 'pending_payment' | 'partial' | 'paid' | 'completed' | 'cancelled'

export interface Customer {
  id: string
  name: string
  email: string
  phone: string
  nin: string
  bvn: string
  address: string
  city: string
  state: string
  lga: string
  latitude?: number | null
  longitude?: number | null
  gps_captured_at?: Date | null
  gps_locked?: boolean
  gps_out_of_area?: boolean
  photo_url?: string
  business_type: string
  credit_limit: number
  total_purchases: number
  outstanding_balance: number
  created_at: Date
  avatar?: string
}

export interface Product {
  id: string
  sku: string
  name: string
  category: string
  brand: string
  description: string
  price: number
  cost: number
  stock: number
  unit: string
  image?: string
}

export interface SaleItem {
  product_id: string
  quantity: number
  unit_price: number
  total: number
}

export interface Sale {
  id: string
  customer_id: string
  date: Date
  status: SaleStatus
  payment_type: PaymentType
  installment_weeks?: number
  total_amount: number
  amount_paid: number
  discount_percent: number
  vat_amount: number
  transport_cost: number
  items: SaleItem[]
  profit: number
  notes: string
  latitude?: number | null
  longitude?: number | null
  gps_captured_at?: Date | null
  gps_locked?: boolean
  gps_out_of_area?: boolean
  site_photo_url?: string
}

export interface InvoiceItem {
  product_id: string
  description: string
  quantity: number
  unit_price: number
  total: number
}

export interface Invoice {
  id: string
  invoice_number: string
  sale_id: string
  customer_id: string
  issue_date: Date
  due_date: Date
  status: 'draft' | 'sent' | 'paid' | 'overdue' | 'cancelled' | 'partial'
  total_amount: number
  paid_amount: number
  items: InvoiceItem[]
}

export interface Payment {
  id: string
  invoice_id: string
  sale_id: string
  customer_id: string
  installment_id?: string
  amount: number
  date: Date
  method: 'bank_transfer' | 'cash' | 'cheque' | 'card'
  reference: string
  bank?: string
  status: 'success' | 'pending' | 'failed'
  receipt?: string
  payment_type: PaymentType
  week_number?: number
}

export interface Installment {
  id: string
  week_number: number
  amount: number
  due_date: Date
  paid_date?: Date
  status: 'pending' | 'paid' | 'overdue'
  reminder?: boolean
}

export interface PaymentSchedule {
  id: string
  sale_id: string
  invoice_id: string
  customer_id: string
  payment_type: PaymentType
  installment_weeks?: number
  total_amount: number
  paid_amount: number
  installments: Installment[]
  next_due_date?: Date
}

export interface PaymentReminder {
  id: string
  sale_id: string
  customer_id: string
  installment_id: string
  week_number: number
  amount: number
  due_date: Date
  status: 'due_today' | 'due_soon' | 'overdue'
  message: string
}

export interface InventoryMovement {
  id: string
  product_id: string
  type: 'in' | 'out' | 'adjustment'
  quantity: number
  reference: string
  date: Date
  notes: string
}

export interface Warranty {
  id: string
  sale_id: string
  product_id: string
  customer_id: string
  serial_number: string
  warranty_period_months: number
  start_date: Date
  expiry_date: Date
  status: 'active' | 'expired' | 'claimed'
}

export interface WarrantyClaim {
  id: string
  warranty_id: string
  claim_date: Date
  issue_description: string
  status: 'pending' | 'approved' | 'rejected' | 'resolved'
  resolution: string
}

export type WarrantyDisplayStatus =
  | 'Needs serial'
  | 'Active'
  | 'Expiring Soon'
  | 'Expired'
  | 'Claimed'

export type RegisterWarrantyInput = {
  warranty_id: string
  serial_number: string
  warranty_period_months: 12 | 24 | 36
}

export type CreateWarrantyClaimInput = {
  warranty_id: string
  issue_description: string
}

export type UpdateWarrantyClaimInput = {
  claim_id: string
  status: 'pending' | 'approved' | 'rejected' | 'resolved'
  resolution?: string
}

export type CustomerInput = {
  name: string
  email: string
  phone: string
  nin?: string
  bvn?: string
  address: string
  city: string
  state: string
  lga?: string
  latitude?: number | null
  longitude?: number | null
  gps_captured_at?: Date | null
  gps_locked?: boolean
  gps_out_of_area?: boolean
  photo_url?: string
  business_type: string
  credit_limit: number
}

export type SaleLineInput = {
  product_id: string
  quantity: number
  serial_number?: string
}

export type SaleSiteGpsInput = {
  latitude: number
  longitude: number
  captured_at: string
  locked: boolean
  out_of_area: boolean
}

export type SaleInput = {
  customer_id?: string
  new_customer?: CustomerInput
  payment_type: PaymentType
  installment_weeks?: number
  discount_percent: number
  transport_cost: number
  notes: string
  items: SaleLineInput[]
  site_gps: SaleSiteGpsInput
  site_photo_url: string
}

export type ProductInput = {
  name: string
  sku: string
  category: string
  brand: string
  description: string
  price: number
  cost: number
  stock: number
  unit: string
}
