import { Analytics } from '@vercel/analytics/next'
import type { Metadata, Viewport } from 'next'
import { Figtree, Syne } from 'next/font/google'
import Script from 'next/script'
import { PwaInstallPrompt } from '@/components/pwa/PwaInstallPrompt'
import { PwaProvider } from '@/components/pwa/PwaProvider'
import './globals.css'

const figtree = Figtree({
  subsets: ['latin'],
  variable: '--font-figtree',
  display: 'swap',
})

const syne = Syne({
  subsets: ['latin'],
  variable: '--font-syne',
  display: 'swap',
})

const APP_NAME = 'Sorapps CRM'
const APP_DESCRIPTION =
  'Enterprise CRM for solar distribution — customers, sales, inventory, and PAYGO field operations.'

export const metadata: Metadata = {
  applicationName: APP_NAME,
  title: {
    default: 'Sorapps CRM | Solar Distribution Management',
    template: '%s | Sorapps CRM',
  },
  description: APP_DESCRIPTION,
  generator: 'v0.app',
  manifest: '/manifest.webmanifest',
  appleWebApp: {
    capable: true,
    statusBarStyle: 'default',
    title: 'Sorapps',
  },
  formatDetection: {
    telephone: false,
  },
  icons: {
    icon: [
      {
        url: '/icon-light-32x32.png',
      },
      {
        url: '/icon.svg',
        type: 'image/svg+xml',
      },
      {
        url: '/icons/icon-192.png',
        sizes: '192x192',
        type: 'image/png',
      },
      {
        url: '/icons/icon-512.png',
        sizes: '512x512',
        type: 'image/png',
      },
    ],
    apple: [{ url: '/icons/apple-touch-icon.png', sizes: '180x180' }],
  },
  other: {
    'mobile-web-app-capable': 'yes',
  },
}

export const viewport: Viewport = {
  colorScheme: 'light',
  themeColor: '#1B4332',
  userScalable: true,
  width: 'device-width',
  initialScale: 1,
  viewportFit: 'cover',
}

const themeInitScript = `(function(){try{document.documentElement.classList.remove('dark');document.documentElement.classList.add('light');localStorage.setItem('sorapps-theme','light')}catch(e){}})();`

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  return (
    <html lang="en" suppressHydrationWarning className={`${figtree.variable} ${syne.variable} light bg-background`}>
      <body className="font-sans antialiased text-foreground">
        <Script id="sorapps-theme-init" strategy="beforeInteractive">
          {themeInitScript}
        </Script>
        <PwaProvider>
          {children}
          <PwaInstallPrompt />
        </PwaProvider>
        {process.env.NODE_ENV === 'production' && <Analytics />}
      </body>
    </html>
  )
}
