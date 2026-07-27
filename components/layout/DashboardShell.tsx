'use client'

import { useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import {
  BarChart3,
  Users,
  ShoppingCart,
  Package,
  CreditCard,
  Shield,
  TrendingUp,
  Calendar,
  Settings,
  Menu,
  X,
  LogOut,
  Bell,
  ChevronLeft,
  PanelLeft,
  Receipt,
  Boxes,
  AlertCircle,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { GlobalSearch } from '@/components/layout/GlobalSearch'
import { formatCurrency, formatDate } from '@/lib/utils/formatting'
import { authClient } from '@/lib/auth-client'

export type DashboardUser = {
  name: string
  email: string
  role?: string | null
  image?: string | null
}

export type ShellReminder = {
  id: string
  sale_id: string
  customer_id: string
  amount: number
  due_date: string
  status: 'due_today' | 'due_soon' | 'overdue'
  message: string
  week_number: number
}

function initials(name: string) {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? '')
    .join('')
}

const navGroups = [
  {
    label: 'Overview',
    items: [
      { name: 'Dashboard', href: '/dashboard', icon: BarChart3 },
      { name: 'Reports', href: '/reports', icon: TrendingUp },
      { name: 'Calendar', href: '/calendar', icon: Calendar },
    ],
  },
  {
    label: 'Sales',
    items: [
      { name: 'Customers', href: '/customers', icon: Users },
      { name: 'Sales', href: '/sales', icon: ShoppingCart },
    ],
  },
  {
    label: 'Finance',
    items: [
      { name: 'Invoices', href: '/invoices', icon: Receipt },
      { name: 'Payments', href: '/payments', icon: CreditCard },
    ],
  },
  {
    label: 'Operations',
    items: [
      { name: 'Products', href: '/products', icon: Package },
      { name: 'Inventory', href: '/inventory', icon: Boxes },
      { name: 'Warranty', href: '/warranty', icon: Shield },
    ],
  },
]

function LogoMark({ compact = false }: { compact?: boolean }) {
  return (
    <div className="flex items-center gap-2.5 overflow-hidden">
      <div className="relative flex size-9 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-sidebar-primary to-emerald-600 text-sidebar-primary-foreground shadow-lg shadow-emerald-900/30">
        <svg viewBox="0 0 24 24" className="size-5" fill="none" aria-hidden>
          <path
            d="M12 3v2.5M12 18.5V21M4.9 4.9l1.8 1.8M17.3 17.3l1.8 1.8M3 12h2.5M18.5 12H21M4.9 19.1l1.8-1.8M17.3 6.7l1.8-1.8"
            stroke="currentColor"
            strokeWidth="1.8"
            strokeLinecap="round"
          />
          <circle cx="12" cy="12" r="3.5" fill="currentColor" />
        </svg>
      </div>
      {!compact && (
        <div className="min-w-0 leading-tight">
          <p className="font-display text-lg font-semibold tracking-tight text-sidebar-foreground">Sorapps</p>
          <p className="text-[11px] font-medium uppercase tracking-[0.14em] text-sidebar-foreground/50">
            Solar CRM
          </p>
        </div>
      )}
    </div>
  )
}

export function DashboardShell({
  children,
  user,
  reminders = [],
}: {
  children: React.ReactNode
  user: DashboardUser
  reminders?: ShellReminder[]
}) {
  const [collapsed, setCollapsed] = useState(false)
  const [mobileOpen, setMobileOpen] = useState(false)
  const [remindersOpen, setRemindersOpen] = useState(false)
  const [signingOut, setSigningOut] = useState(false)
  const remindersRef = useRef<HTMLDivElement>(null)
  const pathname = usePathname()
  const router = useRouter()

  useEffect(() => {
    setMobileOpen(false)
    setRemindersOpen(false)
  }, [pathname])

  useEffect(() => {
    if (!remindersOpen) return
    function onPointerDown(event: MouseEvent) {
      if (!remindersRef.current?.contains(event.target as Node)) {
        setRemindersOpen(false)
      }
    }
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') setRemindersOpen(false)
    }
    document.addEventListener('mousedown', onPointerDown)
    document.addEventListener('keydown', onKeyDown)
    return () => {
      document.removeEventListener('mousedown', onPointerDown)
      document.removeEventListener('keydown', onKeyDown)
    }
  }, [remindersOpen])

  const isActive = (href: string) => pathname === href || pathname.startsWith(`${href}/`)
  const urgentCount = reminders.filter(
    (r) => r.status === 'overdue' || r.status === 'due_today'
  ).length
  const badgeCount = urgentCount > 0 ? urgentCount : reminders.length

  async function handleSignOut() {
    setSigningOut(true)
    await authClient.signOut()
    router.push('/login')
    router.refresh()
  }

  const roleLabel = user.role
    ? user.role.charAt(0).toUpperCase() + user.role.slice(1)
    : 'Staff'

  const sidebarContent = (compact: boolean) => (
    <>
      <div className={cn('flex h-16 items-center border-b border-sidebar-border', compact ? 'justify-center px-2' : 'justify-between px-4')}>
        <LogoMark compact={compact} />
        {!compact && (
          <Button
            variant="ghost"
            size="icon-sm"
            onClick={() => setCollapsed(true)}
            className="hidden text-sidebar-foreground/70 hover:bg-sidebar-accent hover:text-sidebar-foreground md:inline-flex"
            aria-label="Collapse sidebar"
          >
            <ChevronLeft className="size-4" />
          </Button>
        )}
      </div>

      <nav className="flex-1 space-y-5 overflow-y-auto px-2 py-4">
        {navGroups.map((group) => (
          <div key={group.label}>
            {!compact && (
              <p className="mb-1.5 px-3 text-[10px] font-semibold uppercase tracking-[0.16em] text-sidebar-foreground/40">
                {group.label}
              </p>
            )}
            <div className="space-y-0.5">
              {group.items.map((item) => {
                const Icon = item.icon
                const active = isActive(item.href)
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    title={compact ? item.name : undefined}
                    className={cn(
                      'group relative flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors',
                      compact && 'justify-center px-2',
                      active
                        ? 'bg-sidebar-accent text-sidebar-foreground shadow-sm'
                        : 'text-sidebar-foreground/70 hover:bg-sidebar-accent/70 hover:text-sidebar-foreground'
                    )}
                  >
                    {active && (
                      <span className="absolute left-0 top-1/2 h-5 w-0.5 -translate-y-1/2 rounded-full bg-sidebar-primary" />
                    )}
                    <Icon className={cn('size-[18px] shrink-0', active && 'text-sidebar-primary')} />
                    {!compact && <span>{item.name}</span>}
                  </Link>
                )
              })}
            </div>
          </div>
        ))}
      </nav>

      <div className={cn('border-t border-sidebar-border p-3', compact && 'flex justify-center')}>
        <Link
          href="/settings"
          className={cn(
            'mb-2 flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium text-sidebar-foreground/70 transition-colors hover:bg-sidebar-accent/70 hover:text-sidebar-foreground',
            compact && 'justify-center px-2',
            isActive('/settings') && 'bg-sidebar-accent text-sidebar-foreground'
          )}
          title={compact ? 'Settings' : undefined}
        >
          <Settings className="size-[18px]" />
          {!compact && <span>Settings</span>}
        </Link>
        {!compact && (
          <Button
            variant="ghost"
            disabled={signingOut}
            onClick={handleSignOut}
            className="w-full justify-start gap-2 text-sidebar-foreground/70 hover:bg-sidebar-accent hover:text-sidebar-foreground"
          >
            <LogOut className="size-4" />
            {signingOut ? 'Signing out…' : 'Logout'}
          </Button>
        )}
      </div>
    </>
  )

  return (
    <div className="flex min-h-dvh">
      {/* Desktop sidebar */}
      <aside
        className={cn(
          'sticky top-0 hidden h-dvh shrink-0 flex-col bg-sidebar text-sidebar-foreground transition-[width] duration-300 md:flex',
          collapsed ? 'w-[72px]' : 'w-[260px]'
        )}
      >
        {collapsed && (
          <div className="flex h-16 items-center justify-center border-b border-sidebar-border">
            <Button
              variant="ghost"
              size="icon-sm"
              onClick={() => setCollapsed(false)}
              className="text-sidebar-foreground/70 hover:bg-sidebar-accent hover:text-sidebar-foreground"
              aria-label="Expand sidebar"
            >
              <PanelLeft className="size-4" />
            </Button>
          </div>
        )}
        {sidebarContent(collapsed)}
      </aside>

      {/* Mobile drawer */}
      <div
        className={cn(
          'fixed inset-0 z-50 md:hidden',
          mobileOpen ? 'pointer-events-auto' : 'pointer-events-none'
        )}
      >
        <div
          className={cn(
            'absolute inset-0 bg-black/50 backdrop-blur-[2px] transition-opacity',
            mobileOpen ? 'opacity-100' : 'opacity-0'
          )}
          onClick={() => setMobileOpen(false)}
        />
        <aside
          className={cn(
            'absolute inset-y-0 left-0 flex w-[280px] flex-col bg-sidebar text-sidebar-foreground shadow-2xl transition-transform duration-300',
            mobileOpen ? 'translate-x-0' : '-translate-x-full'
          )}
        >
          <div className="absolute right-3 top-3">
            <Button
              variant="ghost"
              size="icon-sm"
              onClick={() => setMobileOpen(false)}
              className="text-sidebar-foreground/70 hover:bg-sidebar-accent hover:text-sidebar-foreground"
              aria-label="Close menu"
            >
              <X className="size-4" />
            </Button>
          </div>
          {sidebarContent(false)}
        </aside>
      </div>

      {/* Main */}
      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-30 flex h-16 items-center gap-3 border-b border-border/70 bg-surface/80 px-4 backdrop-blur-md sm:px-6">
          <Button
            variant="ghost"
            size="icon"
            className="md:hidden"
            onClick={() => setMobileOpen(true)}
            aria-label="Open menu"
          >
            <Menu className="size-5" />
          </Button>

          <GlobalSearch className="hidden md:block" />

          <div className="ml-auto flex items-center gap-2">
            <div className="relative" ref={remindersRef}>
              <Button
                variant="ghost"
                size="icon"
                className="relative"
                aria-label="Payment reminders"
                aria-expanded={remindersOpen}
                onClick={() => setRemindersOpen((open) => !open)}
              >
                <Bell className="size-5" />
                {reminders.length > 0 && (
                  <span className="absolute -right-0.5 -top-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-accent px-1 text-[10px] font-semibold text-accent-foreground ring-2 ring-surface">
                    {badgeCount > 9 ? '9+' : badgeCount}
                  </span>
                )}
              </Button>

              {remindersOpen && (
                <div className="absolute right-0 top-11 z-50 w-[min(100vw-2rem,360px)] overflow-hidden rounded-xl border border-border/80 bg-card shadow-xl">
                  <div className="border-b border-border/70 px-4 py-3">
                    <p className="font-display text-sm font-semibold">Payment Reminders</p>
                    <p className="text-xs text-muted-foreground">
                      {reminders.length === 0
                        ? 'No upcoming installments'
                        : `${reminders.length} unpaid installment${reminders.length === 1 ? '' : 's'}`}
                    </p>
                  </div>
                  <div className="max-h-80 overflow-y-auto">
                    {reminders.length === 0 ? (
                      <p className="px-4 py-8 text-center text-sm text-muted-foreground">
                        Create installment sales to see due dates here
                      </p>
                    ) : (
                      reminders.slice(0, 8).map((reminder) => (
                        <Link
                          key={reminder.id}
                          href="/calendar"
                          onClick={() => setRemindersOpen(false)}
                          className="block border-b border-border/50 px-4 py-3 transition-colors last:border-0 hover:bg-muted/60"
                        >
                          <div className="flex gap-2">
                            <AlertCircle
                              className={cn(
                                'mt-0.5 size-4 shrink-0',
                                reminder.status === 'overdue' && 'text-red-600',
                                reminder.status === 'due_today' && 'text-amber-600',
                                reminder.status === 'due_soon' && 'text-sky-600'
                              )}
                            />
                            <div className="min-w-0">
                              <p className="text-sm font-medium leading-snug">{reminder.message}</p>
                              <p className="mt-1 text-xs text-muted-foreground">
                                {formatCurrency(reminder.amount)} ·{' '}
                                {formatDate(new Date(reminder.due_date))}
                                {reminder.status === 'overdue' ? ' · Overdue' : ''}
                              </p>
                            </div>
                          </div>
                        </Link>
                      ))
                    )}
                  </div>
                  <div className="flex items-center justify-between border-t border-border/70 px-4 py-2">
                    <Link
                      href="/calendar"
                      className="text-xs font-medium text-primary hover:underline"
                      onClick={() => setRemindersOpen(false)}
                    >
                      Open calendar
                    </Link>
                    <Link
                      href="/payments"
                      className="text-xs font-medium text-muted-foreground hover:text-foreground hover:underline"
                      onClick={() => setRemindersOpen(false)}
                    >
                      View payments
                    </Link>
                  </div>
                </div>
              )}
            </div>
            <div className="flex items-center gap-2.5 rounded-full border border-border/70 bg-card py-1 pl-1 pr-3 shadow-sm">
              <div className="flex size-8 items-center justify-center rounded-full bg-primary font-display text-xs font-semibold text-primary-foreground">
                {initials(user.name)}
              </div>
              <div className="hidden min-w-0 leading-tight sm:block">
                <p className="truncate text-sm font-medium">{user.name}</p>
                <p className="text-[11px] text-muted-foreground">{roleLabel}</p>
              </div>
            </div>
          </div>
        </header>

        <main className="flex-1 overflow-y-auto">{children}</main>
      </div>
    </div>
  )
}
