import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import bcrypt from "bcryptjs";
import { prisma } from "./db";
import { requestCache } from "./requestCache";

const SESSION_COOKIE = "oc_session";
const SESSION_TTL_DAYS = 14;

export async function hashPassword(plain: string) {
  return bcrypt.hash(plain, 10);
}

export async function verifyPassword(plain: string, hash: string) {
  return bcrypt.compare(plain, hash);
}

function newToken() {
  // crypto-grade random hex string
  return [...crypto.getRandomValues(new Uint8Array(32))]
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

export async function createSession(userId: string) {
  const token = newToken();
  const expiresAt = new Date(Date.now() + SESSION_TTL_DAYS * 24 * 60 * 60 * 1000);
  await prisma.session.create({ data: { userId, token, expiresAt } });
  cookies().set(SESSION_COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    expires: expiresAt,
    path: "/",
  });
  return token;
}

export async function destroySession() {
  const c = cookies();
  const token = c.get(SESSION_COOKIE)?.value;
  if (token) await prisma.session.deleteMany({ where: { token } });
  c.delete(SESSION_COOKIE);
}

export type CurrentUser = Awaited<ReturnType<typeof getCurrentUser>>;

/**
 * Wrapped in `requestCache` — React's request-scoped `cache()` where it's
 * actually available (ACTION_PLAN.md G4.3): every one of the 24 app pages
 * calls `requireUser`, which calls this, in addition to `(app)/layout.tsx`
 * calling it once already — a `session.findUnique` with a four-level nested
 * `include` (session → user → roles → role → permissions → permission),
 * which Prisma resolves as roughly five or six round trips, was therefore
 * paid twice on every single authenticated page view. `cache()` dedupes
 * calls with the same arguments (none, here) within one render pass, so the
 * layout and the page now share one result.
 */
export const getCurrentUser = requestCache(async () => {
  const token = cookies().get(SESSION_COOKIE)?.value;
  if (!token) return null;
  const session = await prisma.session.findUnique({
    where: { token },
    include: {
      user: {
        include: {
          roles: { include: { role: { include: { permissions: { include: { permission: true } } } } } },
        },
      },
    },
  });
  if (!session || session.expiresAt < new Date() || !session.user.active) return null;
  const user = session.user;
  const roleKeys = user.roles.map((r) => r.role.key);
  const permissions = new Set<string>(
    user.roles.flatMap((r) => r.role.permissions.map((p) => p.permission.key))
  );
  return {
    id: user.id,
    email: user.email,
    name: user.name,
    roles: user.roles,
    roleKeys,
    permissions,
  };
});

export async function requireUser() {
  const u = await getCurrentUser();
  if (!u) redirect("/login");
  return u;
}
