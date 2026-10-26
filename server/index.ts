import "dotenv/config";
import express, { type Request, Response, NextFunction } from "express";
import { serveStatic } from "./static";
import { createServer } from "http";
import { createProxyMiddleware } from "http-proxy-middleware";
import { requireUser, rateLimit, userFromUpgrade } from "./auth";

const app = express();
const httpServer = createServer(app);
const isProduction = process.env.NODE_ENV === "production";

app.disable("x-powered-by");
app.set("trust proxy", 1);

// Proxy targets from environment variables
const QUIZ_SERVICE_URL = process.env.AI_QUIZ_URL || "http://127.0.0.1:8001";
const AI_SERVICE_URL = process.env.AI_RESUME_URL || "http://127.0.0.1:8000";
const NONVERBAL_SERVICE_URL = process.env.AI_NONVERBAL_URL || "http://127.0.0.1:8765";
const RAILS_BACKEND_URL = process.env.RAILS_BACKEND_URL || "http://127.0.0.1:3000";

export function log(message: string, source = "express") {
  const formattedTime = new Date().toLocaleTimeString("en-US", {
    hour: "numeric",
    minute: "2-digit",
    second: "2-digit",
    hour12: true,
  });

  console.log(`${formattedTime} [${source}] ${message}`);
}

// Security headers. CSP only in production: Vite's dev server injects inline scripts.
app.use((_req, res, next) => {
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("X-Frame-Options", "DENY");
  res.setHeader("Referrer-Policy", "strict-origin-when-cross-origin");
  res.setHeader("Permissions-Policy", "camera=(self), microphone=(self), geolocation=()");
  if (isProduction) {
    res.setHeader(
      "Content-Security-Policy",
      [
        "default-src 'self'",
        "script-src 'self'",
        "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
        "font-src 'self' https://fonts.gstatic.com",
        "img-src 'self' data: blob:",
        "media-src 'self' blob:",
        "connect-src 'self' ws: wss:",
        "frame-ancestors 'none'",
        "base-uri 'self'",
        "form-action 'self'",
      ].join("; "),
    );
  }
  next();
});

// Request log: method, path, status and timing only — never bodies, they carry PII.
app.use((req, res, next) => {
  const start = Date.now();
  const path = req.path;
  res.on("finish", () => {
    if (path.startsWith("/api")) {
      log(`${req.method} ${path} ${res.statusCode} in ${Date.now() - start}ms`);
    }
  });
  next();
});

// Calls that hit paid LLM / speech APIs get a tighter budget than plain reads.
const generalLimit = rateLimit({ windowMs: 60_000, max: 120 });
const expensiveLimit = rateLimit({ windowMs: 10 * 60_000, max: 60 });
const isExpensive = (req: Request) =>
  (req.method === "POST" && /^\/(v1\/(interviews|parse-resume|transcribe)|)$/.test(req.path)) ||
  /\/(answer|evaluate)$/.test(req.path);

function aiGuard(req: Request, res: Response, next: NextFunction) {
  requireUser(req, res, () => {
    generalLimit(req, res, () => {
      if (isExpensive(req)) return expensiveLimit(req, res, next);
      next();
    });
  });
}

// Proxy for Interview Feedback Quiz Service (FastAPI)
app.use(
  "/api/quiz",
  aiGuard,
  createProxyMiddleware({
    target: QUIZ_SERVICE_URL,
    changeOrigin: true,
    pathRewrite: (path) => `/api/v1/quiz${path === "/" ? "" : path}`,
  }),
);

// Proxy for AI service (FastAPI)
app.use(
  "/api/ai",
  aiGuard,
  createProxyMiddleware({
    target: AI_SERVICE_URL,
    changeOrigin: true,
    pathRewrite: (path) => `/api${path}`,
  }),
);

// Proxy for Main Backend (Rails) — Rails does its own JWT auth.
app.use(
  "/api",
  createProxyMiddleware({
    target: RAILS_BACKEND_URL,
    changeOrigin: true,
    // Rails rate-limits login by client IP, so it needs the real one.
    xfwd: true,
    on: {
      proxyRes: (proxyRes, req) => {
        if (!(req.socket as any).encrypted && req.headers["x-forwarded-proto"] !== "https") {
          delete proxyRes.headers["strict-transport-security"];
        }
      },
    },
    pathRewrite: (path) => `/api${path}`,
  }),
);

// Nonverbal cues WebSocket — handled only on upgrade, after verifying the token.
const nonverbalProxy = createProxyMiddleware({
  target: NONVERBAL_SERVICE_URL,
  ws: true,
  changeOrigin: true,
});

(async () => {
  if (isProduction) {
    serveStatic(app);
  } else {
    const { setupVite } = await import("./vite");
    await setupVite(httpServer, app);
  }

  app.use((err: any, _req: Request, res: Response, _next: NextFunction) => {
    const status = err.status || err.statusCode || 500;
    console.error(err);
    if (!res.headersSent) {
      res.status(status).json({ error: status >= 500 ? "Internal Server Error" : err.message });
    }
  });

  // ALWAYS serve the app on the port specified in the environment variable PORT
  // Other ports are firewalled. Default to 5000 if not specified.
  // this serves both the API and the client.
  // It is the only port that is not firewalled.
  const port = parseInt(process.env.PORT || "5000", 10);
  httpServer.listen(
    {
      port,
      host: "0.0.0.0",
    },
    () => {
      log(`serving on port ${port}`);
    },
  );

  httpServer.on("upgrade", (req, socket, head) => {
    if (!req.url?.startsWith("/ws/nonverbal")) return;

    const origin = req.headers.origin;
    const host = req.headers.host;
    const sameOrigin = !origin || (host !== undefined && new URL(origin).host === host);
    const userId = userFromUpgrade(req);
    if (!sameOrigin || !userId) {
      socket.write("HTTP/1.1 401 Unauthorized\r\nConnection: close\r\n\r\n");
      socket.destroy();
      return;
    }

    // Don't leak the token to the upstream service's logs.
    req.url = "/ws/nonverbal";
    nonverbalProxy.upgrade(req, socket as any, head);
  });
})();
