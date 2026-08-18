import 'server-only'
import { PutObjectCommand, S3Client } from '@aws-sdk/client-s3'
import { getSignedUrl } from '@aws-sdk/s3-request-presigner'

function requireEnv(name: string): string {
  const value = process.env[name]?.trim()
  if (!value) throw new Error(`${name} is not configured`)
  return value
}

export function isR2Configured(): boolean {
  return Boolean(
    process.env.R2_ACCOUNT_ID?.trim() &&
      process.env.R2_ACCESS_KEY_ID?.trim() &&
      process.env.R2_SECRET_ACCESS_KEY?.trim() &&
      process.env.R2_BUCKET_NAME?.trim() &&
      process.env.R2_PUBLIC_URL?.trim()
  )
}

function getR2Client() {
  const accountId = requireEnv('R2_ACCOUNT_ID')
  return new S3Client({
    region: 'auto',
    endpoint: `https://${accountId}.r2.cloudflarestorage.com`,
    credentials: {
      accessKeyId: requireEnv('R2_ACCESS_KEY_ID'),
      secretAccessKey: requireEnv('R2_SECRET_ACCESS_KEY'),
    },
  })
}

export function publicUrlForKey(key: string): string {
  const base = requireEnv('R2_PUBLIC_URL').replace(/\/$/, '')
  return `${base}/${key}`
}

export async function createSitePhotoUploadUrl(input: {
  contentType: string
  extension: string
}): Promise<{ uploadUrl: string; key: string; publicUrl: string }> {
  if (!isR2Configured()) {
    throw new Error(
      'Cloudflare R2 is not configured. Set R2_ACCOUNT_ID, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY, R2_BUCKET_NAME, and R2_PUBLIC_URL.'
    )
  }

  const allowed = ['image/jpeg', 'image/png', 'image/webp', 'image/heic', 'image/heif']
  if (!allowed.includes(input.contentType)) {
    throw new Error('Only JPEG, PNG, WebP, or HEIC images are allowed')
  }

  const ext = input.extension.replace(/^\./, '').toLowerCase() || 'jpg'
  const key = `site-photos/${new Date().toISOString().slice(0, 10)}/${crypto.randomUUID()}.${ext}`
  const bucket = requireEnv('R2_BUCKET_NAME')
  const command = new PutObjectCommand({
    Bucket: bucket,
    Key: key,
    ContentType: input.contentType,
  })

  const uploadUrl = await getSignedUrl(getR2Client(), command, { expiresIn: 300 })
  return {
    uploadUrl,
    key,
    publicUrl: publicUrlForKey(key),
  }
}
