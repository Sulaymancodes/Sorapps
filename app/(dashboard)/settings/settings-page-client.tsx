'use client'

import { useMemo, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { KeyRound, Settings, UserPlus, FileText } from 'lucide-react'
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
import { saveCachedOrgSettings } from '@/lib/offline/org-settings'
import { updateKycUploadsRequiredAction } from '@/app/actions/org-settings'
import type { AppRole } from '@/lib/roles'
import { cn } from '@/lib/utils'

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
  kycUploadsRequired,
}: {
  isAdmin: boolean
  currentUserId: string
  users: UserRow[]
  kycUploadsRequired: boolean
}) {
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState<string | null>(null)
  const [createdPassword, setCreatedPassword] = useState<string | null>(null)
  const [kycRequired, setKycRequired] = useState(kycUploadsRequired)

  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [phone, setPhone] = useState('')
  const [state, setState] = useState('')
  const [lga, setLga] = useState('')
  const [password, setPassword] = useState('')
  const [sendSms, setSendSms] = useState(true)

  const lgaOptions = useMemo(() => getLgasForState(state), [state])

  function refresh() {
    router.refresh()
  }

  function saveKycRequired(next: boolean) {
    if (next === kycRequired) return
    setError(null)
    setSuccess(null)
    startTransition(async () => {
      const result = await updateKycUploadsRequiredAction({ kyc_uploads_required: next })
      if (!result.success) {
        setError(result.error)
        return
      }
      setKycRequired(result.data.kyc_uploads_required)
      saveCachedOrgSettings(result.data)
      setSuccess(
        result.data.kyc_uploads_required
          ? 'KYC / sales form uploads are now compulsory on sale and customer forms.'
          : 'KYC / sales form uploads are now optional.'
      )
      refresh()
    })
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
          isAdmin ? 'Agent user management and account options' : 'Account options'
        }
      />

      {isAdmin && (
        <>
          <Panel
            title="KYC / sales form uploads"
            description="On New sale and customer forms, agents can skip these files unless you make them compulsory."
          >
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <button
                type="button"
                disabled={pending}
                onClick={() => saveKycRequired(false)}
                className={cn(
                  'flex items-start gap-3 rounded-xl border p-4 text-left transition-all',
                  !kycRequired
                    ? 'border-primary bg-primary/10 ring-2 ring-primary/20'
                    : 'border-border/80 hover:border-primary/40'
                )}
              >
                <FileText className="mt-0.5 size-5 text-primary" />
                <div>
                  <p className="font-medium">Optional</p>
                  <p className="mt-0.5 text-xs text-muted-foreground">
                    Agents may skip KYC / sales form uploads
                  </p>
                </div>
              </button>
              <button
                type="button"
                disabled={pending}
                onClick={() => saveKycRequired(true)}
                className={cn(
                  'flex items-start gap-3 rounded-xl border p-4 text-left transition-all',
                  kycRequired
                    ? 'border-primary bg-primary/10 ring-2 ring-primary/20'
                    : 'border-border/80 hover:border-primary/40'
                )}
              >
                <FileText className="mt-0.5 size-5 text-primary" />
                <div>
                  <p className="font-medium">Compulsory</p>
                  <p className="mt-0.5 text-xs text-muted-foreground">
                    Agents must upload a KYC or sales form before saving
                  </p>
                </div>
              </button>
            </div>
            {error && (
              <p className="mt-3 rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
                {error}
              </p>
            )}
            {success && (
              <p className="mt-3 rounded-lg border border-emerald-500/30 bg-emerald-500/10 px-3 py-2 text-sm text-emerald-900">
                {success}
              </p>
            )}
          </Panel>

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
