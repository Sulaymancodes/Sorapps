import { TWA_PACKAGE_NAME, twaSha256Fingerprints } from '@/lib/twa'

export const dynamic = 'force-dynamic'

export function GET() {
  const body = [
    {
      relation: ['delegate_permission/common.handle_all_urls'],
      target: {
        namespace: 'android_app',
        package_name: TWA_PACKAGE_NAME,
        sha256_cert_fingerprints: twaSha256Fingerprints(),
      },
    },
  ]

  return Response.json(body, {
    headers: {
      'Cache-Control': 'public, max-age=300',
      'Content-Type': 'application/json; charset=utf-8',
    },
  })
}
