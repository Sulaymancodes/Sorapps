export type OddyseaPeriod =
  | 'all'
  | 'day'
  | 'week'
  | 'month'
  | 'quarter'
  | 'year'
  | 'custom'

export type OddyseaFilters = {
  period: OddyseaPeriod
  from?: string
  to?: string
  state?: string
  lga?: string
  deployment_area?: string
}

export type OddyseaReport = {
  filters: OddyseaFilters
  range: { start: string; end: string; label: string }
  summary: {
    shs_connections: number
    eligible_claims: number
    pending_claims: number
    gps_verified: number
    gps_flagged: number
    payments_recorded: number
    outstanding_amount: number
    open_warranty_claims: number
    outstanding_issues: number
  }
  shs_connections: {
    beneficiary_id: string
    name: string
    phone: string
    alternate_phone: string
    gender: string
    customer_category: string
    customer_type: string
    nin: string
    bvn: string
    is_minor: boolean
    guardian_name: string
    guardian_phone: string
    address: string
    address_house_number: string
    address_building_features: string
    address_street: string
    address_landmark: string
    city: string
    lga: string
    state: string
    deployment_area: string
    subsidy_level: string
    sale_id: string
    sale_date: string
    payment_type: string
    dares_type_of_payment: string
    dares_payment_plan: string
    retail_cost_ngn: number
    cost_to_end_user_ngn: number
    downpayment_amount_ngn: number
    sale_status: string
    total_amount: number
  }[]
  subsidy_claim_summary: {
    by_tier: {
      subsidy_level: string
      subsidy_label: string
      connections: number
      eligible: number
      pending: number
      sales_value: number
    }[]
    by_state: {
      state: string
      subsidy_level: string
      connections: number
      eligible: number
      pending: number
      sales_value: number
    }[]
    monthly: {
      month: string
      connections: number
      eligible: number
      pending: number
      sales_value: number
    }[]
  }
  installation_evidence: {
    sale_id: string
    beneficiary_id: string
    beneficiary_name: string
    state: string
    lga: string
    site_photo_url: string
    has_site_photo: boolean
    kyc_documents: number
    sales_form_documents: number
    evidence_complete: boolean
    sale_date: string
  }[]
  gps_verification: {
    sale_id: string
    beneficiary_name: string
    state: string
    lga: string
    latitude: number | null
    longitude: number | null
    gps_captured_at: string | null
    gps_locked: boolean
    gps_out_of_area: boolean
    status: 'verified' | 'flagged' | 'missing'
  }[]
  sales_inventory: {
    sale_id: string
    beneficiary_name: string
    product_name: string
    product_sku: string
    model_number: string
    pv_capacity_wp: number
    serial_number: string
    warranty_id: string
    state: string
    sale_date: string
  }[]
  payment_tracking: {
    payment_id: string
    sale_id: string
    beneficiary_name: string
    amount: number
    date: string
    method: string
    payment_type: string
    is_partial: boolean
    validity_days: number | null
    reference: string
    status: string
  }[]
  claims_overview: {
    total_eligible_claims: number
    total_pending_claims: number
    warranty_claims_open: number
    payment_outstanding: number
    gps_issues: number
    missing_evidence: number
  }
  outstanding_issues: {
    issue_type: string
    severity: 'high' | 'medium' | 'low'
    sale_id: string
    beneficiary_id: string
    beneficiary_name: string
    detail: string
    state: string
    date: string
  }[]
}
