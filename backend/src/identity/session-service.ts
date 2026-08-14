import { createHash } from "node:crypto";
import type { SessionDto, UserDto } from "@gradion-folio/contracts";
import type { ApplicationDependencies } from "../runtime/dependencies.js";
import { unauthenticated } from "../http/api-errors.js";

type UserRow = {
  id: string;
  name: string;
  email_display: string;
};

type SessionRow = UserRow & {
  expires_at: number;
};

export type CreatedSession = {
  token: string;
  dto: SessionDto;
};

export function hashSessionToken(token: string): string {
  return createHash("sha256").update(token, "utf8").digest("hex");
}

function userDto(row: UserRow): UserDto {
  return { id: row.id, name: row.name, email: row.email_display };
}

export function createSession(
  dependencies: ApplicationDependencies,
  input: { name: string; email: string },
): CreatedSession {
  const normalizedEmail = input.email.trim().toLowerCase();
  const displayEmail = input.email.trim();
  const name = input.name.trim();
  const now = dependencies.clock.now().getTime();
  const expiresAt = now + dependencies.config.SESSION_TTL_SECONDS * 1_000;
  const token = dependencies.sessionTokens.generate();
  const tokenHash = hashSessionToken(token);

  const result = dependencies.database.transaction(() => {
    const user = dependencies.database.prepare(`
      INSERT INTO users (
        id, email_normalized, email_display, name, created_at, updated_at
      ) VALUES (
        @id, @emailNormalized, @emailDisplay, @name, @now, @now
      )
      ON CONFLICT(email_normalized) DO UPDATE SET
        email_display = excluded.email_display,
        name = excluded.name,
        updated_at = excluded.updated_at
      RETURNING id, name, email_display
    `).get({
      id: dependencies.ids.generate(),
      emailNormalized: normalizedEmail,
      emailDisplay: displayEmail,
      name,
      now,
    }) as UserRow;

    dependencies.database.prepare(`
      INSERT INTO sessions (token_hash, user_id, created_at, expires_at)
      VALUES (?, ?, ?, ?)
    `).run(tokenHash, user.id, now, expiresAt);

    return user;
  }).immediate();

  return {
    token,
    dto: {
      user: userDto(result),
      expiresAt: new Date(expiresAt).toISOString(),
    },
  };
}

export function requireSession(
  dependencies: ApplicationDependencies,
  rawToken: string | undefined,
): SessionDto {
  if (!rawToken) throw unauthenticated();

  const tokenHash = hashSessionToken(rawToken);
  const row = dependencies.database.prepare(`
    SELECT u.id, u.name, u.email_display, s.expires_at
    FROM sessions s
    JOIN users u ON u.id = s.user_id
    WHERE s.token_hash = ?
  `).get(tokenHash) as SessionRow | undefined;

  const now = dependencies.clock.now().getTime();
  if (!row || row.expires_at <= now) {
    dependencies.database.prepare("DELETE FROM sessions WHERE token_hash = ?").run(tokenHash);
    throw unauthenticated();
  }

  return {
    user: userDto(row),
    expiresAt: new Date(row.expires_at).toISOString(),
  };
}

export function deleteSession(
  dependencies: ApplicationDependencies,
  rawToken: string | undefined,
): void {
  requireSession(dependencies, rawToken);
  dependencies.database.prepare("DELETE FROM sessions WHERE token_hash = ?")
    .run(hashSessionToken(rawToken!));
}
