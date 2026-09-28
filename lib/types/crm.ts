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
  address_house_number: string
  address_building_features: string
  address_street: string
  address_landmark: string
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
  gender: string
  customer_category: string
  customer_type: string
  alternate_phone: string
  credit_limit: number
  total_purchases: number
  outstanding_balance: number
  created_at: Date
  avatar?: string
  is_minor: boolean
  guardian_name: string
  guardian_phone: string
  guardian_relationship: string
  next_of_kin_name: string
  next_of_kin_phone: string
  next_of_kin_relationship: string
}

export interface Product {
  id: string
  sku: string
  name: string
  category: string
  brand: string
  description: string
  model_number: string
  pv_capacity_wp: number
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
  payment_method: 'bank_transfer' | 'cash' | 'cheque' | 'card'
  installment_weeks?: number
  installment_interval_days?: number
  plan_end_date?: Date
  total_amount: number
  amount_paid: number
  discount_percent: number
  vat_amount: number
  transport_cost: number
  items: SaleItem[]
  profit: number
  notes: string
  dares_type_of_payment?: string
  dares_payment_plan?: string
  retail_cost_ngn?: number
  cost_to_end_user_ngn?: number
  downpayment_amount_ngn?: number
  latitude?: number | null
  longitude?: number | null
  gps_captured_at?: Date | null
  gps_locked?: boolean
  gps_out_of_area?: boolean
  site_photo_url?: string
  unlock_pin?: string
  created_by_user_id?: string
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

export type InvoiceDetail = {
  invoice: Invoice
  customer: Customer
  sale: {
    id: string
    payment_type: PaymentType
    payment_method: Sale['payment_method']
    status: SaleStatus
    notes: string
  }
  payments: Array<{
    id: string
    amount: number
    date: Date
    method: string
    reference: string
    status: string
  }>
}

export interface Payment {
  id: string
  invoice_id: string
  sale_id: string
  customer_id: string
  schedule_id?: string
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
  is_partial?: boolean
  expected_amount?: number
  validity_days?: number
  activation_id?: string
  notes?: string
}

export interface Installment {
  id: string
  week_number: number
  amount: number
  paid_amount?: number
  due_date: Date
  paid_date?: Date
  status: 'pending' | 'partial' | 'paid' | 'overdue'
  reminder?: boolean
}

export interface PaymentSchedule {
  id: string
  sale_id: string
  invoice_id: string
  customer_id: string
  payment_type: PaymentType
  installment_weeks?: number
  installment_interval_days?: number
  plan_end_date?: Date
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
  address_house_number?: string
  address_building_features?: string
  address_street?: string
  address_landmark?: string
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
  gender?: string
  customer_category?: string
  customer_type?: string
  alternate_phone?: string
  credit_limit: number
  is_minor?: boolean
  guardian_name?: string
  guardian_phone?: string
  guardian_relationship?: string
  next_of_kin_name?: string
  next_of_kin_phone?: string
  next_of_kin_relationship?: string
}

export type DocumentDocType = 'kyc' | 'sales_form' | 'other'

export type CustomerDocument = {
  id: string
  customer_id: string
  sale_id?: string
  doc_type: DocumentDocType
  file_name: string
  content_type: string
  file_url: string
  storage_key: string
  page_number: number
  uploaded_by_user_id?: string
  created_at: Date
}

export type DocumentUploadInput = {
  file_url: string
  file_name: string
  content_type: string
  storage_key?: string
  doc_type: DocumentDocType
  page_number?: number
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
  deployment_area_id?: string | null
  deployment_area_name?: string | null
  subsidy_level?: string | null
  out_of_area_reason?: string | null
}

export type SaleInput = {
  customer_id?: string
  new_customer?: CustomerInput
  payment_type: PaymentType
  payment_method: 'bank_transfer' | 'cash' | 'cheque' | 'card'
  installment_weeks?: number
  installment_interval_days?: number
  plan_end_date?: string
  discount_percent: number
  transport_cost: number
  notes: string
  dares_type_of_payment?: string
  dares_payment_plan?: string
  retail_cost_ngn?: number
  cost_to_end_user_ngn?: number
  downpayment_amount_ngn?: number
  items: SaleLineInput[]
  site_gps: SaleSiteGpsInput
  site_photo_url: string
  documents?: DocumentUploadInput[]
  created_by_user_id?: string
}

export type ProductInput = {
  name: string
  sku: string
  category: string
  brand: string
  description: string
  model_number: string
  pv_capacity_wp: number
  price: number
  cost: number
  stock: number
  unit: string
}
