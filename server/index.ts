import "dotenv/config";
import express, { type Request, Response, NextFunction } from "express";
import { registerRoutes } from "./routes";
import { serveStatic } from "./static";
import { createServer } from "http";
import { createProxyMiddleware } from "http-proxy-middleware";

const app = express();
const httpServer = createServer(app);

declare module "http" {
  interface IncomingMessage {
    rawBody: unknown;
  }
}


// Proxy targets from environment variables
const QUIZ_SERVICE_URL = process.env.AI_QUIZ_URL || "http://127.0.0.1:8001";
const AI_SERVICE_URL = process.env.AI_RESUME_URL || "http://127.0.0.1:8000";
const NONVERBAL_SERVICE_URL = process.env.AI_NONVERBAL_URL || "http://127.0.0.1:8765";
const RAILS_BACKEND_URL = process.env.RAILS_BACKEND_URL || "http://127.0.0.1:3000";

// Proxy for Nonverbal Cues WebSocket Service
const nonverbalProxy = createProxyMiddleware({
  pathFilter: "/ws/nonverbal",
  target: NONVERBAL_SERVICE_URL,
  ws: true,
  changeOrigin: true,
});
app.use(nonverbalProxy);

// Proxy for Interview Feedback Quiz Service (FastAPI)

// Proxy for Interview Feedback Quiz Service (FastAPI)
app.use(
  createProxyMiddleware({
    pathFilter: "/api/quiz",
    target: QUIZ_SERVICE_URL,
    changeOrigin: true,
    pathRewrite: { "^/api/quiz": "/api/v1/quiz" },
  })
);

// Proxy for AI service (FastAPI)
app.use(
  createProxyMiddleware({
    pathFilter: "/api/ai",
    target: AI_SERVICE_URL,
    changeOrigin: true,
    pathRewrite: {
      "^/api/ai": "/api",
    },
  })
);

// Proxy for Main Backend (Rails)
app.use(
  createProxyMiddleware({
    pathFilter: (pathname: string) => pathname.startsWith("/api") && !pathname.startsWith("/api/ai") && !pathname.startsWith("/api/quiz"),
    target: RAILS_BACKEND_URL,
    changeOrigin: true,
  })
);

app.use(
  express.json({
    verify: (req, _res, buf) => {
      req.rawBody = buf;
    },
  }),
);

app.use(express.urlencoded({ extended: false }));

export function log(message: string, source = "express") {
  const formattedTime = new Date().toLocaleTimeString("en-US", {
    hour: "numeric",
    minute: "2-digit",
    second: "2-digit",
    hour12: true,
  });

  console.log(`${formattedTime} [${source}] ${message}`);
}

app.use((req, res, next) => {
  const start = Date.now();
  const path = req.path;
  let capturedJsonResponse: Record<string, any> | undefined = undefined;

  const originalResJson = res.json;
  res.json = function (bodyJson, ...args) {
    capturedJsonResponse = bodyJson;
    return originalResJson.apply(res, [bodyJson, ...args]);
  };

  res.on("finish", () => {
    const duration = Date.now() - start;
    if (path.startsWith("/api")) {
      let logLine = `${req.method} ${path} ${res.statusCode} in ${duration}ms`;
      if (capturedJsonResponse) {
        logLine += ` :: ${JSON.stringify(capturedJsonResponse)}`;
      }

      log(logLine);
    }
  });

  next();
});

(async () => {
  await registerRoutes(httpServer, app);

  app.use((err: any, _req: Request, res: Response, _next: NextFunction) => {
    const status = err.status || err.statusCode || 500;
    const message = err.message || "Internal Server Error";

    res.status(status).json({ message });
    throw err;
  });

  // importantly only setup vite in development and after
  // setting up all the other routes so the catch-all route
  // doesn't interfere with the other routes
  if (process.env.NODE_ENV === "production") {
    serveStatic(app);
  } else {
    const { setupVite } = await import("./vite");
    await setupVite(httpServer, app);
  }

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

  // Handle WebSocket upgrades for nonverbal cues
  httpServer.on("upgrade", (req, socket, head) => {
    if (req.url?.startsWith("/ws/nonverbal")) {
      nonverbalProxy.upgrade(req, socket as any, head);
    }
  });
})();
