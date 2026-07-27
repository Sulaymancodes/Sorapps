import Link from 'next/link'

export function AuthShell({
  title,
  subtitle,
  children,
  footer,
}: {
  title: string
  subtitle: string
  children: React.ReactNode
  footer?: React.ReactNode
}) {
  return (
    <div className="relative flex min-h-dvh items-center justify-center overflow-hidden px-4 py-10">
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_20%_10%,rgba(34,120,80,0.22),transparent_55%),radial-gradient(ellipse_at_90%_80%,rgba(245,158,11,0.14),transparent_50%),linear-gradient(160deg,#f3f7f4_0%,#e8f0ea_45%,#f7f3eb_100%)] dark:bg-[radial-gradient(ellipse_at_20%_10%,rgba(62,207,142,0.12),transparent_55%),radial-gradient(ellipse_at_90%_80%,rgba(245,158,11,0.08),transparent_50%),linear-gradient(160deg,#0c1510_0%,#121a15_50%,#16140f_100%)]"
      />
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 opacity-[0.35] [background-image:linear-gradient(rgba(27,94,63,0.06)_1px,transparent_1px),linear-gradient(90deg,rgba(27,94,63,0.06)_1px,transparent_1px)] [background-size:48px_48px] dark:opacity-20"
      />

      <div className="relative w-full max-w-[420px]">
        <div className="mb-8 text-center">
          <Link
            href="/login"
            className="mx-auto mb-4 flex size-12 items-center justify-center rounded-2xl bg-gradient-to-br from-primary to-emerald-600 text-primary-foreground shadow-lg shadow-emerald-900/20"
          >
            <svg viewBox="0 0 24 24" className="size-6" fill="none" aria-hidden>
              <path
                d="M12 3v2.5M12 18.5V21M4.9 4.9l1.8 1.8M17.3 17.3l1.8 1.8M3 12h2.5M18.5 12H21M4.9 19.1l1.8-1.8M17.3 6.7l1.8-1.8"
                stroke="currentColor"
                strokeWidth="1.8"
                strokeLinecap="round"
              />
              <circle cx="12" cy="12" r="3.5" fill="currentColor" />
            </svg>
          </Link>
          <h1 className="font-display text-3xl font-semibold tracking-tight text-foreground">
            {title}
          </h1>
          <p className="mt-1.5 text-sm text-muted-foreground">{subtitle}</p>
        </div>

        <div className="rounded-2xl border border-border/70 bg-card/90 p-6 shadow-xl shadow-emerald-950/5 backdrop-blur-sm sm:p-8">
          {children}
        </div>

        {footer && (
          <div className="mt-6 text-center text-sm text-muted-foreground">{footer}</div>
        )}
      </div>
    </div>
  )
}
