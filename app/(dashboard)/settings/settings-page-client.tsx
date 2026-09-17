'use client'

import { useEffect, useMemo, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { KeyRound, Moon, Settings, Sun, UserPlus } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select } from '@/components/ui/select'
import { PageHeader } from '@/components/common/PageHeader'
import { PageShell } from '@/components/common/PageShell'
import { Panel } from '@/components/common/Panel'
import { SearchableSelect } from '@/components/common/SearchableSelect'
import { NIGERIAN_STATES } from '@/lib/constants/options'
import { getLgasForState } from '@/lib/constants/lgas'
import {
  createUserAction,
  resetUserPasswordAction,
  updateUserRoleAction,
  updateUserTerritoryAction,
} from '@/app/actions/users'
import { authClient } from '@/lib/auth-client'
import { clearCachedDashboardUser } from '@/lib/offline/app-shell'
import type { AppRole } from '@/lib/roles'

const THEME_KEY = 'sorapps-theme'

function applyTheme(isDark: boolean) {
  document.documentElement.classList.toggle('dark', isDark)
  document.documentElement.classList.toggle('light', !isDark)
}

type UserRow = {
  id: string
  name: string
  email: string
  phone: string
  role: AppRole
  assigned_state: string
  assigned_lga: string
  created_at: string
}

export function SettingsPageClient({
  isAdmin,
  currentUserId,
  users,
}: {
  isAdmin: boolean
  currentUserId: string
  users: UserRow[]
}) {
  const router = useRouter()
  const [isDark, setIsDark] = useState(false)
  const [mounted, setMounted] = useState(false)
  const [pending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState<string | null>(null)
  const [createdPassword, setCreatedPassword] = useState<string | null>(null)

  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [phone, setPhone] = useState('')
  const [state, setState] = useState('')
  const [lga, setLga] = useState('')
  const [password, setPassword] = useState('')
  const [sendSms, setSendSms] = useState(true)

  useEffect(() => {
    const stored = localStorage.getItem(THEME_KEY)
    const prefersDark =
      stored === 'dark' ||
      (stored === null && window.matchMedia('(prefers-color-scheme: dark)').matches)
    setIsDark(prefersDark)
    applyTheme(prefersDark)
    setMounted(true)
  }, [])

  const lgaOptions = useMemo(() => getLgasForState(state), [state])

  const setTheme = (dark: boolean) => {
    setIsDark(dark)
    applyTheme(dark)
    localStorage.setItem(THEME_KEY, dark ? 'dark' : 'light')
  }

  function refresh() {
    router.refresh()
  }

  function createAgent() {
    setError(null)
    setSuccess(null)
    setCreatedPassword(null)
    startTransition(async () => {
      const result = await createUserAction({
        name,
        email,
        phone,
        assigned_state: state,
        assigned_lga: lga,
        password: password || undefined,
        send_sms: sendSms,
        role: 'agent',
      })
      if (!result.success) {
        setError(result.error)
        return
      }
      setCreatedPassword(result.data.password)
      setSuccess(
        result.data.sms_sent
          ? `Agent created and login SMS sent to ${phone}.`
          : `Agent created.${result.data.sms_error ? ` SMS failed: ${result.data.sms_error}` : ' Copy the password below.'}`
      )
      setName('')
      setEmail('')
      setPhone('')
      setPassword('')
      refresh()
    })
  }

  return (
    <PageShell>
      <PageHeader
        title="Settings"
        description={
          isAdmin
            ? 'Theme preferences and agent user management'
            : 'Theme preferences for your account'
        }
      />

      <Panel title="Display" description="Choose light or dark mode">
        <div className="flex items-center justify-between gap-4">
          <div>
            <p className="font-medium">Theme</p>
            <p className="text-sm text-muted-foreground">Applies on this device</p>
          </div>
          <div className="flex gap-2">
            <Button
              variant={mounted && !isDark ? 'default' : 'outline'}
              size="sm"
              onClick={() => setTheme(false)}
              className="gap-2"
            >
              <Sun className="size-4" />
              Light
            </Button>
            <Button
              variant={mounted && isDark ? 'default' : 'outline'}
              size="sm"
              onClick={() => setTheme(true)}
              className="gap-2"
            >
              <Moon className="size-4" />
              Dark
            </Button>
          </div>
        </div>
      </Panel>

      {isAdmin && (
        <>
          <Panel
            title="Create agent"
            description="Assign state + LGA. Password is generated (or set) and can be SMS’d to their phone."
          >
            <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
              <div className="space-y-1.5">
                <Label htmlFor="agent-name">Full name</Label>
                <Input
                  id="agent-name"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="Agent name"
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="agent-email">Login email</Label>
                <Input
                  id="agent-email"
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="agent@company.com"
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="agent-phone">Phone (for SMS login)</Label>
                <Input
                  id="agent-phone"
                  type="tel"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value.replace(/\D/g, '').slice(0, 13))}
                  placeholder="08012345678"
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="agent-password">Password (optional)</Label>
                <Input
                  id="agent-password"
                  type="text"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="Leave blank to auto-generate"
                />
              </div>
              <div className="space-y-1.5">
                <Label>Assigned state</Label>
                <SearchableSelect
                  options={[...NIGERIAN_STATES]}
                  value={state}
                  onChange={(v) => {
                    setState(v)
                    setLga('')
                  }}
                  placeholder="Search state…"
                />
              </div>
              <div className="space-y-1.5">
                <Label>Assigned LGA</Label>
                <SearchableSelect
                  options={state ? lgaOptions : []}
                  value={lga}
                  onChange={setLga}
                  placeholder={state ? 'Search LGA…' : 'Select state first'}
                  disabled={!state}
                />
              </div>
            </div>
            <label className="mt-4 flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={sendSms}
                onChange={(e) => setSendSms(e.target.checked)}
              />
              Send login details by SMS
            </label>
            <div className="mt-4 flex flex-wrap gap-2">
              <Button
                type="button"
                className="gap-2"
                disabled={pending || !name || !email || !phone || !state || !lga}
                onClick={createAgent}
              >
                <UserPlus className="size-4" />
                Create agent
              </Button>
            </div>
            {error && (
              <p className="mt-3 rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
                {error}
              </p>
            )}
            {success && (
              <p className="mt-3 rounded-lg border border-emerald-500/30 bg-emerald-500/10 px-3 py-2 text-sm text-emerald-900 dark:text-emerald-200">
                {success}
              </p>
            )}
            {createdPassword && (
              <p className="mt-2 rounded-lg border border-border bg-secondary/40 px-3 py-2 font-mono text-sm">
                Password: {createdPassword}
              </p>
            )}
          </Panel>

          <Panel title="Users" description="Promote agents to admin or change territory">
            <div className="overflow-x-auto">
              <table className="w-full min-w-[720px] text-left text-sm">
                <thead>
                  <tr className="border-b border-border text-[11px] uppercase tracking-wide text-muted-foreground">
                    <th className="px-2 py-2 font-medium">Name</th>
                    <th className="px-2 py-2 font-medium">Email / phone</th>
                    <th className="px-2 py-2 font-medium">Role</th>
                    <th className="px-2 py-2 font-medium">Territory</th>
                    <th className="px-2 py-2 font-medium">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {users.map((u) => (
                    <UserAdminRow
                      key={u.id}
                      user={u}
                      isSelf={u.id === currentUserId}
                      pending={pending}
                      onDone={(msg) => {
                        setSuccess(msg)
                        setError(null)
                        refresh()
                      }}
                      onError={setError}
                    />
                  ))}
                </tbody>
              </table>
            </div>
          </Panel>
        </>
      )}

      {!isAdmin && (
        <Panel title="Account">
          <p className="text-sm text-muted-foreground">
            Your territory and role are managed by an admin.
          </p>
          <Button
            type="button"
            variant="outline"
            className="mt-4 gap-2"
            onClick={async () => {
              clearCachedDashboardUser()
              await authClient.signOut()
              router.push('/login')
              router.refresh()
            }}
          >
            Log out
          </Button>
        </Panel>
      )}
    </PageShell>
  )
}

function UserAdminRow({
  user,
  isSelf,
  pending,
  onDone,
  onError,
}: {
  user: UserRow
  isSelf: boolean
  pending: boolean
  onDone: (msg: string) => void
  onError: (msg: string) => void
}) {
  const [role, setRole] = useState<AppRole>(user.role)
  const [state, setState] = useState(user.assigned_state)
  const [lga, setLga] = useState(user.assigned_lga)
  const lgaOptions = useMemo(() => getLgasForState(state), [state])
  const [busy, startTransition] = useTransition()

  return (
    <tr className="border-b border-border/60 align-top">
      <td className="px-2 py-3 font-medium">
        {user.name}
        {isSelf ? <span className="ml-1 text-xs text-muted-foreground">(you)</span> : null}
      </td>
      <td className="px-2 py-3 text-muted-foreground">
        <div>{user.email}</div>
        <div className="text-xs">{user.phone || '—'}</div>
      </td>
      <td className="px-2 py-3">
        <Select
          value={role}
          disabled={busy || pending || isSelf}
          onChange={(e) => setRole(e.target.value as AppRole)}
          className="h-9"
        >
          <option value="agent">Agent</option>
          <option value="admin">Admin</option>
        </Select>
      </td>
      <td className="px-2 py-3">
        {role === 'agent' ? (
          <div className="space-y-2">
            <SearchableSelect
              options={[...NIGERIAN_STATES]}
              value={state}
              onChange={(v) => {
                setState(v)
                setLga('')
              }}
              placeholder="State"
            />
            <SearchableSelect
              options={state ? lgaOptions : []}
              value={lga}
              onChange={setLga}
              placeholder="LGA"
              disabled={!state}
            />
          </div>
        ) : (
          <span className="text-xs text-muted-foreground">All areas</span>
        )}
      </td>
      <td className="px-2 py-3">
        <div className="flex flex-col gap-2">
          <Button
            type="button"
            size="sm"
            variant="outline"
            disabled={busy || pending}
            onClick={() => {
              startTransition(async () => {
                if (role !== user.role || role === 'agent') {
                  const result = await updateUserRoleAction({
                    id: user.id,
                    role,
                    assigned_state: state,
                    assigned_lga: lga,
                  })
                  if (!result.success) {
                    onError(result.error)
                    return
                  }
                } else if (
                  user.role === 'agent' &&
                  (state !== user.assigned_state || lga !== user.assigned_lga)
                ) {
                  const result = await updateUserTerritoryAction({
                    id: user.id,
                    assigned_state: state,
                    assigned_lga: lga,
                  })
                  if (!result.success) {
                    onError(result.error)
                    return
                  }
                }
                onDone(`Updated ${user.name}`)
              })
            }}
          >
            <Settings className="size-3.5" />
            Save
          </Button>
          <Button
            type="button"
            size="sm"
            variant="outline"
            disabled={busy || pending}
            onClick={() => {
              startTransition(async () => {
                const result = await resetUserPasswordAction({ id: user.id, send_sms: true })
                if (!result.success) {
                  onError(result.error)
                  return
                }
                onDone(
                  `New password for ${user.name}: ${result.data.password}${
                    result.data.sms_sent ? ' (SMS sent)' : result.data.sms_error ? ` (SMS failed: ${result.data.sms_error})` : ''
                  }`
                )
              })
            }}
          >
            <KeyRound className="size-3.5" />
            Reset + SMS
          </Button>
        </div>
      </td>
    </tr>
  )
}
