import { createHmac, timingSafeEqual } from "crypto";
import type { IncomingMessage } from "http";
import type { Request, Response, NextFunction } from "express";

// Rails signs tokens with HS256 using JWT_SECRET (see Backend/app/lib/json_web_token.rb).
// The gateway verifies the same token before proxying to the AI services, which
// have no auth of their own, and forwards the user id as a trusted header.
const JWT_SECRET = process.env.JWT_SECRET || "";

if (!JWT_SECRET) {
  console.warn(
    "[auth] JWT_SECRET is not set — AI, quiz and nonverbal routes will reject every request.",
  );
}

function base64UrlDecode(input: string): Buffer {
  return Buffer.from(input.replace(/-/g, "+").replace(/_/g, "/"), "base64");
}

export function verifyToken(token: string | undefined | null): string | null {
  if (!token || !JWT_SECRET) return null;
  const parts = token.split(".");
  if (parts.length !== 3) return null;
  const [header, payload, signature] = parts;

  try {
    const { alg } = JSON.parse(base64UrlDecode(header).toString("utf8"));
    if (alg !== "HS256") return null;

    const expected = createHmac("sha256", JWT_SECRET).update(`${header}.${payload}`).digest();
    const actual = base64UrlDecode(signature);
    if (actual.length !== expected.length || !timingSafeEqual(actual, expected)) return null;

    const claims = JSON.parse(base64UrlDecode(payload).toString("utf8"));
    if (typeof claims.exp !== "number" || claims.exp * 1000 < Date.now()) return null;
    if (claims.user_id === undefined || claims.user_id === null) return null;
    return String(claims.user_id);
  } catch {
    return null;
  }
}

function bearerToken(req: IncomingMessage): string | null {
  const header = req.headers.authorization;
  if (!header) return null;
  const [scheme, value] = header.split(" ");
  return scheme?.toLowerCase() === "bearer" ? value : null;
}

// Express middleware: requires a valid Rails JWT and sets X-User-Id for the upstream service.
export function requireUser(req: Request, res: Response, next: NextFunction) {
  delete req.headers["x-user-id"];
  const userId = verifyToken(bearerToken(req));
  if (!userId) {
    return res.status(401).json({ error: "Your session has expired. Please sign in again." });
  }
  req.headers["x-user-id"] = userId;
  (req as any).userId = userId;
  next();
}

// WebSockets can't send headers from the browser, so the token travels as ?token=.
export function userFromUpgrade(req: IncomingMessage): string | null {
  const url = new URL(req.url || "/", "http://gateway.local");
  return verifyToken(url.searchParams.get("token"));
}

// Fixed-window in-memory limiter keyed by user id. Good enough for a single gateway
// instance; swap for Redis if the gateway is ever scaled horizontally.
export function rateLimit({ windowMs, max }: { windowMs: number; max: number }) {
  const hits = new Map<string, { count: number; resetAt: number }>();

  setInterval(() => {
    const now = Date.now();
    hits.forEach((entry, key) => {
      if (entry.resetAt <= now) hits.delete(key);
    });
  }, windowMs).unref();

  return (req: Request, res: Response, next: NextFunction) => {
    const key = (req as any).userId || req.ip || "anonymous";
    const now = Date.now();
    const entry = hits.get(key);
    if (!entry || entry.resetAt <= now) {
      hits.set(key, { count: 1, resetAt: now + windowMs });
      return next();
    }
    entry.count += 1;
    if (entry.count > max) {
      res.setHeader("Retry-After", Math.ceil((entry.resetAt - now) / 1000));
      return res.status(429).json({ error: "Too many requests. Please wait a moment and try again." });
    }
    next();
  };
}
