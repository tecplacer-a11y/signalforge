import type { Express, Request, Response } from "express";
import { createClient } from "@supabase/supabase-js";
import { z } from "zod";
import { storage } from "./storage";
import { seedOrgDefaults } from "./seed";
import {
  authEnabled, requireAuth, REFRESH_COOKIE,
  SUPABASE_URL, SUPABASE_ANON_KEY, SUPABASE_SERVICE_ROLE_KEY,
} from "./auth";

// ─────────────────────────────────────────────────────────────
// Auth API endpoints (roadmap Task 1.6)
//   POST /api/auth/signup   — create Supabase user + org + seed defaults
//   POST /api/auth/login    — password login, sets httpOnly cookies
//   POST /api/auth/refresh  — rotate tokens from refresh cookie
//   POST /api/auth/logout   — clear cookies
//   GET  /api/auth/me       — current user + org + plan
// Tokens are issued by Supabase Auth; this server never stores passwords.
// ─────────────────────────────────────────────────────────────

const ACCESS_COOKIE = "sf_access_token";

// service-role client: admin user creation (bypasses email confirmation)
const adminClient = () =>
  createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false, autoRefreshToken: false } });
// anon client: password grant + refresh
const anonClient = () =>
  createClient(SUPABASE_URL, SUPABASE_ANON_KEY, { auth: { persistSession: false, autoRefreshToken: false } });

function setSessionCookies(res: Response, session: { access_token: string; refresh_token: string; expires_in?: number }) {
  const secure = process.env.NODE_ENV === "production";
  res.cookie(ACCESS_COOKIE, session.access_token, {
    httpOnly: true, secure, sameSite: "lax", path: "/",
    maxAge: (session.expires_in ?? 3600) * 1000,
  });
  res.cookie(REFRESH_COOKIE, session.refresh_token, {
    httpOnly: true, secure, sameSite: "lax", path: "/api/auth",
    maxAge: 30 * 24 * 3600 * 1000,
  });
}

function clearSessionCookies(res: Response) {
  res.clearCookie(ACCESS_COOKIE, { path: "/" });
  res.clearCookie(REFRESH_COOKIE, { path: "/api/auth" });
}

const slugify = (s: string) =>
  s.toLowerCase().trim().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 40) || "org";

const signupSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8, "password must be at least 8 characters"),
  name: z.string().min(1),
  orgName: z.string().min(1),
});

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

function requireAuthConfigured(res: Response): boolean {
  if (!authEnabled) {
    res.status(503).json({
      error: "auth is not configured on this deployment (SUPABASE_URL missing)",
    });
    return false;
  }
  return true;
}

export function registerAuthRoutes(app: Express) {
  app.post("/api/auth/signup", async (req: Request, res: Response) => {
    if (!requireAuthConfigured(res)) return;
    const parsed = signupSchema.safeParse(req.body);
    if (!parsed.success) return res.status(422).json({ error: parsed.error.issues[0]?.message || "invalid input" });
    const { email, password, name, orgName } = parsed.data;

    // unique slug: base, base-2, base-3, ...
    const base = slugify(orgName);
    let slug = base;
    for (let i = 2; await storage.getOrganizationBySlug(slug); i++) slug = `${base}-${i}`;

    const admin = adminClient();
    const { data: created, error: createErr } = await admin.auth.admin.createUser({
      email, password, email_confirm: true, user_metadata: { name },
    });
    if (createErr || !created?.user) {
      const msg = createErr?.message || "could not create user";
      return res.status(/already|exists/i.test(msg) ? 409 : 400).json({ error: msg });
    }

    const org = await storage.createOrganization({ name: orgName, slug });
    await storage.addOrgMember({ orgId: org.id, userId: created.user.id, role: "owner" });
    await seedOrgDefaults(org.id);

    // log the new user in so the client gets a session immediately
    const { data: signIn, error: signInErr } = await anonClient().auth.signInWithPassword({ email, password });
    if (signInErr || !signIn?.session) {
      return res.status(201).json({ user: { id: created.user.id, email }, org, session: null });
    }
    setSessionCookies(res, signIn.session);
    res.status(201).json({
      user: { id: created.user.id, email, name },
      org: { id: org.id, name: org.name, slug: org.slug, plan: org.plan },
      role: "owner",
    });
  });

  app.post("/api/auth/login", async (req: Request, res: Response) => {
    if (!requireAuthConfigured(res)) return;
    const parsed = loginSchema.safeParse(req.body);
    if (!parsed.success) return res.status(422).json({ error: "email and password required" });

    const { data, error } = await anonClient().auth.signInWithPassword(parsed.data);
    if (error || !data?.session || !data.user) {
      return res.status(401).json({ error: "invalid email or password" });
    }
    const memberships = await storage.listMembershipsByUser(data.user.id);
    if (memberships.length === 0) {
      return res.status(403).json({ error: "no organization membership" });
    }
    const org = await storage.getOrganization(memberships[0].orgId);
    setSessionCookies(res, data.session);
    res.json({
      user: { id: data.user.id, email: data.user.email, name: data.user.user_metadata?.name },
      org: org ? { id: org.id, name: org.name, slug: org.slug, plan: org.plan } : null,
      role: memberships[0].role,
    });
  });

  app.post("/api/auth/refresh", async (req: Request, res: Response) => {
    if (!requireAuthConfigured(res)) return;
    const refreshToken = (req as any).cookies?.[REFRESH_COOKIE] || req.body?.refresh_token;
    if (!refreshToken) return res.status(401).json({ error: "no refresh token" });

    const { data, error } = await anonClient().auth.refreshSession({ refresh_token: refreshToken });
    if (error || !data?.session) {
      clearSessionCookies(res);
      return res.status(401).json({ error: "refresh failed — log in again" });
    }
    setSessionCookies(res, data.session);
    res.json({ ok: true });
  });

  app.post("/api/auth/logout", async (_req: Request, res: Response) => {
    clearSessionCookies(res);
    res.json({ ok: true });
  });

  // Protected: requireAuth only skips the public endpoints above, so it
  // fully verifies the token here (or attaches the default-org context when
  // auth is disabled).
  app.get("/api/auth/me", requireAuth, async (req: Request, res: Response) => {
    const ctx = req.auth!;
    const org = await storage.getOrganization(ctx.orgId);
    res.json({
      user: { id: ctx.userId, email: ctx.email },
      org: org ? { id: org.id, name: org.name, slug: org.slug, plan: org.plan, status: org.status } : null,
      role: ctx.role,
      authEnabled,
    });
  });
}
