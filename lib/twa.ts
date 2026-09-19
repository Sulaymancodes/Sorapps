/**
 * Digital Asset Links for the Sorapps Agent TWA (package com.sorapps.agent).
 * Chrome uses this to hide the URL bar. Extra release fingerprints can be
 * appended with TWA_SHA256_FINGERPRINTS (comma-separated SHA-256 values).
 */
export const TWA_PACKAGE_NAME = 'com.sorapps.agent'

/** Fingerprint of android-agent/keystore/debug.keystore (internal sideload builds). */
export const TWA_SIDELOAD_SHA256 =
  '9F:6E:31:E0:45:D4:F7:61:95:60:9A:F7:8B:9A:80:34:C2:9F:E6:EE:73:2C:A1:8E:6A:43:FF:B1:23:BA:A2:EC'

function normalizeFingerprint(value: string) {
  return value.trim().replace(/ /g, '').toUpperCase()
}

export function twaSha256Fingerprints() {
  const extra = (process.env.TWA_SHA256_FINGERPRINTS ?? '')
    .split(',')
    .map(normalizeFingerprint)
    .filter(Boolean)

  return [...new Set([TWA_SIDELOAD_SHA256, ...extra])]
}
