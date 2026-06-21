import { sql } from 'drizzle-orm';
import { serviceDrizzle } from './drizzle.js';

export interface RevokeTokenInput {
  jti?: string;
  user_id?: string;
  org_id?: string;
  tenant_id?: string;
  expires_at: Date;
  revoked_by?: string;
  reason?: string;
}

export interface IsTokenRevokedInput {
  jti: string;
  user_id?: string;
  org_id?: string;
  tenant_id?: string;
  /** JWT iat (issued-at) in seconds */
  issued_at?: number;
}

/**
 * Insert a revocation entry. One of jti/user_id/org_id/tenant_id is required.
 * Setting user_id/org_id/tenant_id performs bulk revocation of all tokens
 * issued before the revoked_at timestamp.
 */
export async function revokeToken(input: RevokeTokenInput): Promise<void> {
  const db = serviceDrizzle();
  await db.execute(sql`
    INSERT INTO iam.token_blocklist (jti, user_id, org_id, tenant_id, expires_at, revoked_by, reason)
    VALUES (
      ${input.jti ?? null},
      ${input.user_id ?? null}::uuid,
      ${input.org_id ?? null}::uuid,
      ${input.tenant_id ?? null}::uuid,
      ${input.expires_at.toISOString()},
      ${input.revoked_by ?? null}::uuid,
      ${input.reason ?? null}
    )
  `);
}

/**
 * Check whether a token is revoked. Returns true if any of these match:
 * 1. The specific JTI is in the blocklist.
 * 2. There is a user-level revocation issued after this token was minted.
 * 3. There is an org-level revocation issued after this token was minted.
 * 4. There is a tenant-level revocation issued after this token was minted.
 */
export async function isTokenRevoked(input: IsTokenRevokedInput): Promise<boolean> {
  const db = serviceDrizzle();
  const issuedAt = input.issued_at
    ? new Date(input.issued_at * 1000).toISOString()
    : new Date(0).toISOString();

  const result = await db.execute<{ revoked: boolean }>(sql`
    SELECT EXISTS (
      SELECT 1 FROM iam.token_blocklist
      WHERE expires_at > NOW()
        AND (
          -- Specific token revoked by JTI
          (jti = ${input.jti})
          -- All tokens for this user revoked since this token was issued
          OR (user_id   = ${input.user_id ?? null}::uuid   AND revoked_at > ${issuedAt}::timestamptz)
          -- All tokens for this org revoked since this token was issued
          OR (org_id    = ${input.org_id ?? null}::uuid    AND revoked_at > ${issuedAt}::timestamptz)
          -- All tokens for this tenant revoked since this token was issued
          OR (tenant_id = ${input.tenant_id ?? null}::uuid AND revoked_at > ${issuedAt}::timestamptz)
        )
    ) AS revoked
  `);

  return Boolean((result as unknown as Array<{ revoked: boolean }>)[0]?.revoked);
}
