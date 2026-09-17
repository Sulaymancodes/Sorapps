import withSerwistInit from '@serwist/next'
import { spawnSync } from 'node:child_process'
import { randomUUID } from 'node:crypto'

const revision =
  spawnSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf-8' }).stdout?.trim() ||
  randomUUID()

const withSerwist = withSerwistInit({
  swSrc: 'app/sw.ts',
  swDest: 'public/sw.js',
  disable: process.env.NODE_ENV === 'development',
  register: false,
  cacheOnNavigation: true,
  reloadOnOnline: false,
  additionalPrecacheEntries: [
    { url: '/~offline', revision },
    { url: '/login', revision },
  ],
  globPublicPatterns: ['icons/**/*.{png,svg}', 'icon.svg', 'apple-icon.png'],
})

/** @type {import('next').NextConfig} */
const nextConfig = {
  typescript: {
    ignoreBuildErrors: true,
  },
  images: {
    unoptimized: true,
  },
  serverExternalPackages: ['postgres'],
}

export default withSerwist(nextConfig)
