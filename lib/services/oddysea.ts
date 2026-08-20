import 'server-only'
import { format } from 'date-fns'
import { desc, eq } from 'drizzle-orm'
import { db } from '@/lib/db'
import {
  customers,
  customerDocuments,
  invoices,
  payments,
  products,
  sales,
  warranties,
  warrantyClaims,
} from '@/lib/db/schema'
import {
  APPROVED_DEPLOYMENT_AREAS,
  SUBSIDY_LABELS,
  type SubsidyLevel,
} from '@/lib/constants/deployment-areas'
import {
  parseDashboardFilters,
  resolveDashboardRange,
} from '@/lib/services/dashboard'
import type { OddyseaFilters, OddyseaReport } from '@/lib/types/oddysea'

export type { OddyseaFilters, OddyseaReport }

function subsidyForState(state: string): {
  area_id: string
  area_name: string
  subsidy_level: SubsidyLevel
  subsidy_label: string
} {
  const area = APPROVED_DEPLOYMENT_AREAS.find(
    (a) => a.state.toLowerCase() === (state || '').trim().toLowerCase()
  )
  if (!area) {
    return {
      area_id: '',
      area_name: '',
      subsidy_level: 'none',
      subsidy_label: SUBSIDY_LABELS.none,
    }
  }
  return {
    area_id: area.id,
    area_name: area.name,
    subsidy_level: area.subsidy_level,
    subsidy_label: SUBSIDY_LABELS[area.subsidy_level],
  }
}

function inRange(date: Date, start: Date, end: Date) {
  return date >= start && date <= end
}

function normalize(value?: string | null) {
  return (value || '').trim().toLowerCase()
}

export function parseOddyseaFilters(
  raw: Record<string, string | string[] | undefined>
): OddyseaFilters {
  const parsed = parseDashboardFilters(raw)
  return {
    period: parsed.period,
    from: parsed.from,
    to: parsed.to,
    state: parsed.state,
    lga: parsed.lga,
    deployment_area: parsed.deployment_area,
  }
}

export async function getOddyseaReport(filters: OddyseaFilters): Promise<OddyseaReport> {
  const range = resolveDashboardRange(filters)
  const area = filters.deployment_area
    ? APPROVED_DEPLOYMENT_AREAS.find((a) => a.id === filters.deployment_area)
    : undefined
  const effectiveState = filters.state || area?.state || ''
  const effectiveLga = filters.lga || ''

  const [saleRows, invoiceRows, paymentRows, warrantyRows, claimRows, documentRows, productRows] =
    await Promise.all([
      db
        .select({ sale: sales, customer: customers })
        .from(sales)
        .innerJoin(customers, eq(sales.customerId, customers.id))
        .orderBy(desc(sales.date)),
      db.select().from(invoices),
      db.select().from(payments).orderBy(desc(payments.date)),
      db
        .select({
          warranty: warranties,
          productName: products.name,
          productSku: products.sku,
        })
        .from(warranties)
        .leftJoin(products, eq(warranties.productId, products.id)),
      db.select().from(warrantyClaims),
      db.select().from(customerDocuments),
      db.select().from(products),
    ])

  void productRows

  const matchesGeo = (state: string, lga: string) => {
    if (effectiveState && normalize(state) !== normalize(effectiveState)) return false
    if (effectiveLga && normalize(lga) !== normalize(effectiveLga)) return false
    if (area?.lgas?.length) {
      return area.lgas.some((x) => normalize(x) === normalize(lga))
    }
    return true
  }

  const periodSales = saleRows.filter((row) => {
    const d = row.sale.date instanceof Date ? row.sale.date : new Date(row.sale.date)
    if (!inRange(d, range.start, range.end)) return false
    return matchesGeo(row.customer.state, row.customer.lga)
  })

  const saleIds = new Set(periodSales.map((r) => r.sale.id))
  const customerBySale = new Map(periodSales.map((r) => [r.sale.id, r.customer]))

  const docsByCustomer = new Map<string, typeof documentRows>()
  for (const doc of documentRows) {
    const list = docsByCustomer.get(doc.customerId) || []
    list.push(doc)
    docsByCustomer.set(doc.customerId, list)
  }

  const invoicesBySale = new Map(invoiceRows.map((inv) => [inv.saleId, inv]))

  const isEligible = (row: (typeof periodSales)[number]) => {
    const hasPhoto = Boolean(row.sale.sitePhotoUrl?.trim())
    const gpsOk = row.sale.gpsLocked && !row.sale.gpsOutOfArea && row.sale.latitude != null
    return hasPhoto && gpsOk && row.sale.status !== 'cancelled'
  }

  const isPendingClaim = (row: (typeof periodSales)[number]) => {
    if (row.sale.status === 'cancelled') return false
    return !isEligible(row)
  }

  const shs_connections = periodSales.map((row) => {
    const sub = subsidyForState(row.customer.state)
    return {
      beneficiary_id: row.customer.id,
      name: row.customer.name,
      phone: row.customer.phone || row.customer.guardianPhone,
      nin: row.customer.nin,
      bvn: row.customer.bvn,
      is_minor: row.customer.isMinor,
      guardian_name: row.customer.guardianName,
      guardian_phone: row.customer.guardianPhone,
      address: row.customer.address,
      city: row.customer.city,
      lga: row.customer.lga,
      state: row.customer.state,
      deployment_area: sub.area_name,
      subsidy_level: sub.subsidy_level,
      sale_id: row.sale.id,
      sale_date: (row.sale.date instanceof Date ? row.sale.date : new Date(row.sale.date)).toISOString(),
      payment_type: row.sale.paymentType,
      sale_status: row.sale.status,
      total_amount: row.sale.totalAmount,
    }
  })

  const tierMap = new Map<
    string,
    { subsidy_level: string; subsidy_label: string; connections: number; eligible: number; pending: number; sales_value: number }
  >()
  const stateMap = new Map<
    string,
    { state: string; subsidy_level: string; connections: number; eligible: number; pending: number; sales_value: number }
  >()
  const monthMap = new Map<
    string,
    { month: string; connections: number; eligible: number; pending: number; sales_value: number }
  >()

  for (const row of periodSales) {
    const sub = subsidyForState(row.customer.state)
    const eligible = isEligible(row)
    const pending = isPendingClaim(row)
    const amount = row.sale.totalAmount

    const tier = tierMap.get(sub.subsidy_level) || {
      subsidy_level: sub.subsidy_level,
      subsidy_label: sub.subsidy_label,
      connections: 0,
      eligible: 0,
      pending: 0,
      sales_value: 0,
    }
    tier.connections += 1
    if (eligible) tier.eligible += 1
    if (pending) tier.pending += 1
    tier.sales_value += amount
    tierMap.set(sub.subsidy_level, tier)

    const st = stateMap.get(row.customer.state) || {
      state: row.customer.state,
      subsidy_level: sub.subsidy_level,
      connections: 0,
      eligible: 0,
      pending: 0,
      sales_value: 0,
    }
    st.connections += 1
    if (eligible) st.eligible += 1
    if (pending) st.pending += 1
    st.sales_value += amount
    stateMap.set(row.customer.state, st)

    const monthKey = format(
      row.sale.date instanceof Date ? row.sale.date : new Date(row.sale.date),
      'yyyy-MM'
    )
    const mo = monthMap.get(monthKey) || {
      month: monthKey,
      connections: 0,
      eligible: 0,
      pending: 0,
      sales_value: 0,
    }
    mo.connections += 1
    if (eligible) mo.eligible += 1
    if (pending) mo.pending += 1
    mo.sales_value += amount
    monthMap.set(monthKey, mo)
  }

  const installation_evidence = periodSales.map((row) => {
    const docs = docsByCustomer.get(row.customer.id) || []
    const kyc = docs.filter((d) => d.docType === 'kyc').length
    const salesForms = docs.filter((d) => d.docType === 'sales_form').length
    const hasPhoto = Boolean(row.sale.sitePhotoUrl?.trim())
    return {
      sale_id: row.sale.id,
      beneficiary_id: row.customer.id,
      beneficiary_name: row.customer.name,
      state: row.customer.state,
      lga: row.customer.lga,
      site_photo_url: row.sale.sitePhotoUrl || '',
      has_site_photo: hasPhoto,
      kyc_documents: kyc,
      sales_form_documents: salesForms,
      evidence_complete: hasPhoto && (kyc > 0 || salesForms > 0),
      sale_date: (row.sale.date instanceof Date ? row.sale.date : new Date(row.sale.date)).toISOString(),
    }
  })

  const gps_verification = periodSales.map((row) => {
    let status: 'verified' | 'flagged' | 'missing' = 'missing'
    if (row.sale.gpsLocked && row.sale.latitude != null && row.sale.longitude != null) {
      status = row.sale.gpsOutOfArea ? 'flagged' : 'verified'
    }
    return {
      sale_id: row.sale.id,
      beneficiary_name: row.customer.name,
      state: row.customer.state,
      lga: row.customer.lga,
      latitude: row.sale.latitude,
      longitude: row.sale.longitude,
      gps_captured_at: row.sale.gpsCapturedAt
        ? row.sale.gpsCapturedAt.toISOString()
        : null,
      gps_locked: row.sale.gpsLocked,
      gps_out_of_area: row.sale.gpsOutOfArea,
      status,
    }
  })

  const sales_inventory = warrantyRows
    .filter((w) => w.warranty.saleId && saleIds.has(w.warranty.saleId))
    .map((w) => {
      const customer = customerBySale.get(w.warranty.saleId!)
      const sale = periodSales.find((r) => r.sale.id === w.warranty.saleId)?.sale
      return {
        sale_id: w.warranty.saleId || '',
        beneficiary_name: customer?.name || '',
        product_name: w.productName || '',
        product_sku: w.productSku || '',
        serial_number: w.warranty.serialNumber,
        warranty_id: w.warranty.id,
        state: customer?.state || '',
        sale_date: sale
          ? (sale.date instanceof Date ? sale.date : new Date(sale.date)).toISOString()
          : '',
      }
    })

  const payment_tracking = paymentRows
    .filter((p) => {
      if (!saleIds.has(p.saleId)) return false
      const d = p.date instanceof Date ? p.date : new Date(p.date)
      // Include payments for period sales even if paid slightly outside — still show all for those sales
      void d
      return true
    })
    .map((p) => {
      const customer = customerBySale.get(p.saleId)
      return {
        payment_id: p.id,
        sale_id: p.saleId,
        beneficiary_name: customer?.name || '',
        amount: p.amount,
        date: (p.date instanceof Date ? p.date : new Date(p.date)).toISOString(),
        method: p.method,
        payment_type: p.paymentType,
        is_partial: p.isPartial,
        validity_days: p.validityDays,
        reference: p.reference,
        status: p.status,
      }
    })

  const openClaims = claimRows.filter((c) => {
    const w = warrantyRows.find((x) => x.warranty.id === c.warrantyId)
    if (!w?.warranty.saleId || !saleIds.has(w.warranty.saleId)) return false
    return c.status === 'pending' || c.status === 'in_progress' || c.status === 'open'
  })

  const outstanding_issues: OddyseaReport['outstanding_issues'] = []

  for (const row of periodSales) {
    const date = (row.sale.date instanceof Date ? row.sale.date : new Date(row.sale.date)).toISOString()
    if (!row.sale.sitePhotoUrl?.trim()) {
      outstanding_issues.push({
        issue_type: 'missing_site_photo',
        severity: 'high',
        sale_id: row.sale.id,
        beneficiary_id: row.customer.id,
        beneficiary_name: row.customer.name,
        detail: 'Installation site photo missing',
        state: row.customer.state,
        date,
      })
    }
    if (!row.sale.gpsLocked || row.sale.latitude == null) {
      outstanding_issues.push({
        issue_type: 'missing_gps',
        severity: 'high',
        sale_id: row.sale.id,
        beneficiary_id: row.customer.id,
        beneficiary_name: row.customer.name,
        detail: 'GPS not captured or not locked',
        state: row.customer.state,
        date,
      })
    } else if (row.sale.gpsOutOfArea) {
      outstanding_issues.push({
        issue_type: 'gps_out_of_area',
        severity: 'high',
        sale_id: row.sale.id,
        beneficiary_id: row.customer.id,
        beneficiary_name: row.customer.name,
        detail: 'GPS flagged outside approved deployment area',
        state: row.customer.state,
        date,
      })
    }
    const inv = invoicesBySale.get(row.sale.id)
    if (inv && inv.paidAmount < inv.totalAmount) {
      outstanding_issues.push({
        issue_type: 'payment_outstanding',
        severity: inv.dueDate < new Date() ? 'high' : 'medium',
        sale_id: row.sale.id,
        beneficiary_id: row.customer.id,
        beneficiary_name: row.customer.name,
        detail: `Outstanding ₦${(inv.totalAmount - inv.paidAmount).toLocaleString()}`,
        state: row.customer.state,
        date,
      })
    }
    const docs = docsByCustomer.get(row.customer.id) || []
    if (!docs.some((d) => d.docType === 'kyc' || d.docType === 'sales_form')) {
      outstanding_issues.push({
        issue_type: 'missing_kyc_form',
        severity: 'medium',
        sale_id: row.sale.id,
        beneficiary_id: row.customer.id,
        beneficiary_name: row.customer.name,
        detail: 'No KYC / sales form document uploaded',
        state: row.customer.state,
        date,
      })
    }
  }

  for (const claim of openClaims) {
    const w = warrantyRows.find((x) => x.warranty.id === claim.warrantyId)
    const customer = w?.warranty.saleId ? customerBySale.get(w.warranty.saleId) : undefined
    outstanding_issues.push({
      issue_type: 'warranty_claim',
      severity: 'medium',
      sale_id: w?.warranty.saleId || '',
      beneficiary_id: customer?.id || w?.warranty.customerId || '',
      beneficiary_name: customer?.name || '',
      detail: claim.issueDescription?.slice(0, 120) || `Warranty claim ${claim.status}`,
      state: customer?.state || '',
      date: (claim.claimDate instanceof Date ? claim.claimDate : new Date(claim.claimDate)).toISOString(),
    })
  }

  const eligibleCount = periodSales.filter(isEligible).length
  const pendingCount = periodSales.filter(isPendingClaim).length
  const gpsVerified = gps_verification.filter((g) => g.status === 'verified').length
  const gpsFlagged = gps_verification.filter((g) => g.status === 'flagged').length
  const outstandingAmount = periodSales.reduce((sum, row) => {
    const inv = invoicesBySale.get(row.sale.id)
    if (!inv) return sum
    return sum + Math.max(0, inv.totalAmount - inv.paidAmount)
  }, 0)

  return {
    filters,
    range: {
      start: range.start.toISOString(),
      end: range.end.toISOString(),
      label: range.label,
    },
    summary: {
      shs_connections: periodSales.length,
      eligible_claims: eligibleCount,
      pending_claims: pendingCount,
      gps_verified: gpsVerified,
      gps_flagged: gpsFlagged,
      payments_recorded: payment_tracking.length,
      outstanding_amount: outstandingAmount,
      open_warranty_claims: openClaims.length,
      outstanding_issues: outstanding_issues.length,
    },
    shs_connections,
    subsidy_claim_summary: {
      by_tier: [...tierMap.values()].sort((a, b) => a.subsidy_level.localeCompare(b.subsidy_level)),
      by_state: [...stateMap.values()].sort((a, b) => b.connections - a.connections),
      monthly: [...monthMap.values()].sort((a, b) => a.month.localeCompare(b.month)),
    },
    installation_evidence,
    gps_verification,
    sales_inventory,
    payment_tracking,
    claims_overview: {
      total_eligible_claims: eligibleCount,
      total_pending_claims: pendingCount,
      warranty_claims_open: openClaims.length,
      payment_outstanding: outstanding_issues.filter((i) => i.issue_type === 'payment_outstanding')
        .length,
      gps_issues: outstanding_issues.filter(
        (i) => i.issue_type === 'gps_out_of_area' || i.issue_type === 'missing_gps'
      ).length,
      missing_evidence: outstanding_issues.filter(
        (i) => i.issue_type === 'missing_site_photo' || i.issue_type === 'missing_kyc_form'
      ).length,
    },
    outstanding_issues: outstanding_issues.sort((a, b) => {
      const rank = { high: 0, medium: 1, low: 2 }
      return rank[a.severity] - rank[b.severity]
    }),
  }
}
