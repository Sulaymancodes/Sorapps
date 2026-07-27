'use client'

import { useEffect, useState } from 'react'
import { Settings, Moon, Sun } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { PageHeader } from '@/components/common/PageHeader'
import { PageShell } from '@/components/common/PageShell'
import { Panel } from '@/components/common/Panel'

const THEME_KEY = 'sorapps-theme'

function applyTheme(isDark: boolean) {
  document.documentElement.classList.toggle('dark', isDark)
  document.documentElement.classList.toggle('light', !isDark)
}

export default function SettingsPage() {
  const [isDark, setIsDark] = useState(false)
  const [mounted, setMounted] = useState(false)

  useEffect(() => {
    const stored = localStorage.getItem(THEME_KEY)
    const prefersDark =
      stored === 'dark' ||
      (stored === null && window.matchMedia('(prefers-color-scheme: dark)').matches)
    setIsDark(prefersDark)
    applyTheme(prefersDark)
    setMounted(true)
  }, [])

  const setTheme = (dark: boolean) => {
    setIsDark(dark)
    applyTheme(dark)
    localStorage.setItem(THEME_KEY, dark ? 'dark' : 'light')
  }

  const inputClass =
    'mt-1.5 h-10 w-full rounded-lg border border-border/80 bg-background px-3 text-sm outline-none focus:border-ring focus:ring-3 focus:ring-ring/30'

  return (
    <PageShell>
      <PageHeader title="Settings" description="Manage application preferences" />

      <Panel>
        <div className="space-y-6">
          <div className="border-b border-border/70 pb-6">
            <h3 className="mb-4 flex items-center gap-2 font-display text-base font-semibold">
              <Settings className="size-5" />
              Display Settings
            </h3>
            <div className="flex items-center justify-between gap-4">
              <div>
                <p className="font-medium">Theme</p>
                <p className="text-sm text-muted-foreground">Choose between light and dark mode</p>
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
          </div>

          <div className="border-b border-border/70 pb-6">
            <h3 className="mb-4 font-display text-base font-semibold">Account</h3>
            <p className="text-sm text-muted-foreground">
              Profile editing will connect to the user database in the next backend phase.
              Use Logout in the sidebar to end your session.
            </p>
          </div>

          <div>
            <h3 className="mb-4 font-display text-base font-semibold">Company</h3>
            <div className="space-y-4">
              <div>
                <label className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                  Company Name
                </label>
                <input type="text" placeholder="Sorapps" className={inputClass} />
              </div>
              <div>
                <label className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                  Currency
                </label>
                <select className={inputClass}>
                  <option>NGN - Nigerian Naira</option>
                  <option>USD - US Dollar</option>
                </select>
              </div>
            </div>
          </div>
        </div>
      </Panel>

      <div className="flex gap-4">
        <Button>Save Changes</Button>
        <Button variant="outline">Cancel</Button>
      </div>
    </PageShell>
  )
}
