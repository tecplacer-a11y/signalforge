import type { Request, Response, NextFunction } from "express";
import { createRemoteJWKSet, jwtVerify, type JWTPayload } from "jose";
import { storage } from "./storage";

// ─────────────────────────────────────────────────────────────
// Supabase Auth — JWT verification middleware (roadmap Task 1.4)
//
// Verification strategy:
//   1. If SUPABASE_JWT_SECRET is set → verify HS256 locally (legacy Supabase
//      projects sign access tokens with a shared secret).
//   2. Otherwise → verify against the project's public JWKS endpoint
//      (new Supabase projects use asymmetric signing keys).
//
// Tenant resolution:
//   - Fast path: org_id / role claims in app_metadata (set via Supabase
//     custom-claims auth hook).
//   - Fallback: org_members lookup by the token's sub (user UUID).
//
// If SUPABASE_URL is not configured, auth is DISABLED and every request is
// attributed to the default org — preserves the current single-tenant
// deployment until the Supabase project is provisioned. A warning is logged
// once at startup.
// ─────────────────────────────────────────────────────────────

export const SUPABASE_URL = (process.env.SUPABASE_URL || "").replace(/\/+$/, "");
export const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY || "";
export const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || "";
const SUPABASE_JWT_SECRET = process.env.SUPABASE_JWT_SECRET || "";

export const authEnabled = !!SUPABASE_URL;

export interface AuthContext {
  userId: string;
  orgId: string;
  role: string; // owner | admin | member | viewer
  email?: string;
}

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      auth?: AuthContext;
    }
  }
}

const ACCESS_COOKIE = "sf_access_token";
export const REFRESH_COOKIE = "sf_refresh_token";

let jwks: ReturnType<typeof createRemoteJWKSet> | null = null;
function getJwks() {
  if (!jwks) jwks = createRemoteJWKSet(new URL(`${SUPABASE_URL}/auth/v1/.well-known/jwks.json`));
  return jwks;
}

export async function verifyJwt(token: string): Promise<JWTPayload> {
  if (SUPABASE_JWT_SECRET) {
    const secret = new TextEncoder().encode(SUPABASE_JWT_SECRET);
    const { payload } = await jwtVerify(token, secret, { algorithms: ["HS256"] });
    return payload;
  }
  const { payload } = await jwtVerify(token, getJwks());
  return payload;
}

function extractToken(req: Request): string | null {
  const header = req.headers.authorization;
  if (header?.startsWith("Bearer ")) return header.slice(7);
  const cookie = (req as any).cookies?.[ACCESS_COOKIE];
  return typeof cookie === "string" && cookie ? cookie : null;
}

// Resolve {orgId, role} for a verified user: prefer JWT custom claims,
// fall back to an org_members lookup.
export async function resolveOrgContext(payload: JWTPayload): Promise<{ orgId: string; role: string } | null> {
  const meta = (payload.app_metadata ?? {}) as Record<string, unknown>;
  if (typeof meta.org_id === "string" && meta.org_id) {
    return { orgId: meta.org_id, role: typeof meta.org_role === "string" ? meta.org_role : "member" };
  }
  const userId = payload.sub;
  if (!userId) return null;
  const memberships = await storage.listMembershipsByUser(userId);
  if (memberships.length === 0) return null;
  return { orgId: memberships[0].orgId, role: memberships[0].role };
}

let warnedDisabled = false;
let _defaultOrgId: string | null = null;
async function defaultOrgContext(): Promise<AuthContext> {
  if (!_defaultOrgId) _defaultOrgId = (await storage.getOrCreateDefaultOrg()).id;
  return { userId: "00000000-0000-0000-0000-000000000000", orgId: _defaultOrgId, role: "owner" };
}

// Public auth endpoints — the only /api routes that skip the guard.
// (/healthz is registered before this middleware and never reaches it.)
const PUBLIC_PATHS = new Set(["/api/auth/signup", "/api/auth/login", "/api/auth/refresh", "/api/auth/logout"]);

export async function requireAuth(req: Request, res: Response, next: NextFunction) {
  if (!req.path.startsWith("/api/")) return next();
  if (PUBLIC_PATHS.has(req.path)) return next();

  if (!authEnabled) {
    if (!warnedDisabled) {
      warnedDisabled = true;
      console.warn(
        "[auth] SUPABASE_URL not set — auth is DISABLED; all requests use the default org. " +
        "Set SUPABASE_URL (+ SUPABASE_ANON_KEY / SUPABASE_SERVICE_ROLE_KEY) to enable.",
      );
    }
    req.auth = await defaultOrgContext();
    return next();
  }

  const token = extractToken(req);
  if (!token) return res.status(401).json({ error: "authentication required" });

  let payload: JWTPayload;
  try {
    payload = await verifyJwt(token);
  } catch {
    return res.status(401).json({ error: "invalid or expired token" });
  }

  const org = await resolveOrgContext(payload);
  if (!org) return res.status(403).json({ error: "no organization membership" });

  req.auth = {
    userId: payload.sub!,
    orgId: org.orgId,
    role: org.role,
    email: typeof payload.email === "string" ? payload.email : undefined,
  };
  return next();
}
