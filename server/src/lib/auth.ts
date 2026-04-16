import { usersTable } from "../db/schema";
import db from "../db";
import { and, eq, isNull } from "drizzle-orm";

export interface AuthTokenPayload {
  userId: number;
}

/**
 * Hash a password using Bun's built-in crypto
 */
export async function hashPassword(password: string): Promise<string> {
  return await Bun.password.hash(password);
}

/**
 * Verify a password against a hash
 */
export async function verifyPassword(password: string, hash: string): Promise<boolean> {
  return await Bun.password.verify(password, hash);
}

/**
 * Generate a single-user API key bundle (plaintext + hashed form).
 */
export async function generateApiKeyBundle(): Promise<{
  apiKey: string;
  apiKeyId: string;
  apiKeyHash: string;
}> {
  const apiKeyId = crypto.randomUUID().replace(/-/g, "").slice(0, 12);
  const apiKeySecret = crypto.randomUUID().replace(/-/g, "") + crypto.randomUUID().replace(/-/g, "");
  const apiKey = `pmk_${apiKeyId}_${apiKeySecret}`;
  const apiKeyHash = await Bun.password.hash(apiKey);

  return {
    apiKey,
    apiKeyId,
    apiKeyHash,
  };
}

/**
 * Verify plaintext API key against a stored hash.
 */
export async function verifyApiKey(apiKey: string, hash: string): Promise<boolean> {
  return await Bun.password.verify(apiKey, hash);
}

/**
 * Parse API key id from key format: pmk_<id>_<secret>
 */
function parseApiKeyId(apiKey: string): string | null {
  const parts = apiKey.split("_");
  if (parts.length !== 3 || parts[0] !== "pmk") {
    return null;
  }
  return parts[1] || null;
}

/**
 * Get user by API key value.
 */
export async function getUserByApiKey(apiKey: string): Promise<typeof usersTable.$inferSelect | null> {
  const apiKeyId = parseApiKeyId(apiKey);
  if (!apiKeyId) {
    return null;
  }

  const user = await db.query.usersTable.findFirst({
    where: and(
      eq(usersTable.apiKeyId, apiKeyId),
      isNull(usersTable.apiKeyRevokedAt),
    ),
  });

  if (!user?.apiKeyHash) {
    return null;
  }

  const isValid = await verifyApiKey(apiKey, user.apiKeyHash);
  if (!isValid) {
    return null;
  }

  return user;
}

/**
 * Track API key usage timestamps for audit/debug visibility.
 */
export async function touchApiKeyLastUsed(userId: number): Promise<void> {
  await db
    .update(usersTable)
    .set({ apiKeyLastUsedAt: new Date() })
    .where(eq(usersTable.id, userId));
}

/**
 * Get user by ID
 */
export async function getUserById(userId: number): Promise<typeof usersTable.$inferSelect | null> {
  const user = await db.query.usersTable.findFirst({ where: eq(usersTable.id, userId) });
  return user ?? null;
}
