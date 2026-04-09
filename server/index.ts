/**
 * server/index.ts
 *
 * Application entry point.  Bootstraps the Express server, registers all
 * middleware and routes, then binds to the configured port.
 *
 * Execution flow:
 *  1. Create Express app + raw HTTP server
 *  2. Attach JSON body parser (with rawBody capture for webhook signature verification)
 *  3. Attach URL-encoded body parser
 *  4. Attach request-logging middleware
 *  5. Register all API routes (auth + business logic)
 *  6. Attach global error handler
 *  7. Serve static assets / Vite dev server
 *  8. Start listening on PORT (default 5000)
 *
 * Impact if changed:
 *  - Moving `registerRoutes` after `setupVite` would break API routes because
 *    Vite's catch-all would intercept /api/* requests first
 *  - Changing the port requires matching changes in Replit's port config
 */

import express, { type Request, Response, NextFunction } from "express";
import { registerRoutes } from "./routes";
import { serveStatic } from "./static";
import { createServer } from "http";

const app = express();

/**
 * httpServer
 *
 * The raw Node.js HTTP server wrapping the Express app.
 * Passed to `registerRoutes` so auth middleware can attach WebSocket
 * handlers or other server-level listeners if needed in the future.
 *
 * Impact if changed:
 *  - `createServer(app)` vs `app.listen()` — using createServer gives us
 *    access to the raw server object required for WebSocket (ws, socket.io)
 */
const httpServer = createServer(app);

/**
 * Module augmentation for IncomingMessage.rawBody
 *
 * Adds the `rawBody` property to Node's IncomingMessage so that the JSON
 * body parser's `verify` callback can store the raw Buffer.
 * Used for webhook signature verification (e.g. Stripe, GitHub).
 * Type is `unknown` to accommodate both Buffer and string forms.
 *
 * Impact if changed:
 *  - Removing this augmentation causes TypeScript errors wherever `req.rawBody` is accessed
 */
declare module "http" {
  interface IncomingMessage {
    rawBody: unknown;
  }
}

/**
 * JSON body parser middleware
 *
 * Parses `application/json` request bodies into `req.body`.
 * The `verify` callback captures the raw request Buffer in `req.rawBody`
 * before it is parsed, which is required for HMAC signature verification
 * in webhook handlers.
 *
 * Impact if changed:
 *  - Removing `verify` breaks any webhook signature checking
 *  - Raising the body size limit (default 100kb) allows larger payloads
 *    but increases memory exposure risk
 */
app.use(
  express.json({
    verify: (req, _res, buf) => {
      req.rawBody = buf;
    },
  }),
);

/**
 * URL-encoded body parser middleware
 *
 * Parses `application/x-www-form-urlencoded` bodies (HTML forms).
 * `extended: false` uses the simpler `querystring` library instead of `qs`.
 *
 * Impact if changed:
 *  - Switching to `extended: true` supports nested objects in form data
 *  - Removing this would break any traditional HTML form POST endpoints
 */
app.use(express.urlencoded({ extended: false }));

/**
 * log
 *
 * Formats and prints a timestamped log line to stdout.
 * Used by the request-logging middleware and the startup message.
 *
 * @param message — The log message to display
 * @param source  — Label shown in brackets (defaults to "express")
 *
 * Impact if changed:
 *  - This is the only logging utility in the server; replacing it would
 *    require updating every call site or switching to a logging library
 *  - The format `HH:MM:SS AM/PM [source] message` is relied on by
 *    Replit's log viewer for display
 */
export function log(message: string, source = "express") {
  const formattedTime = new Date().toLocaleTimeString("en-US", {
    hour: "numeric",
    minute: "2-digit",
    second: "2-digit",
    hour12: true,
  });
  console.log(`${formattedTime} [${source}] ${message}`);
}

/**
 * Request logging middleware
 *
 * Intercepts every request that hits an /api/* path and logs:
 *   METHOD PATH STATUS in Xms [:: JSON body if present]
 *
 * Implementation detail: monkey-patches `res.json` to capture the response
 * body before it is sent, then logs it on the `finish` event.
 *
 * Impact if changed:
 *  - Removing the res.json patch means the response body won't appear in logs
 *  - This only logs /api/* paths; static asset and frontend requests are silent
 *  - In production this could be replaced by a structured logger (pino, winston)
 */
app.use((req, res, next) => {
  const start = Date.now();
  const path = req.path;
  let capturedJsonResponse: Record<string, any> | undefined = undefined;

  // Patch res.json to capture the outgoing body for logging
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
  /**
   * Route registration
   *
   * Attaches all API route handlers and auth middleware to the Express app.
   * Must complete before Vite/static middleware is attached so that /api/*
   * routes are matched first (Express routes in registration order).
   *
   * Impact if changed:
   *  - Calling after setupVite would make Vite's catch-all swallow API calls
   */
  await registerRoutes(httpServer, app);

  /**
   * Global error handler middleware
   *
   * Catches any error thrown inside route handlers (or passed via `next(err)`).
   * Returns a JSON error response with the error's status code and message.
   * The `throw err` re-throw is intentional — it triggers Node's uncaught
   * exception handler for visibility in logs even after a response is sent.
   *
   * Impact if changed:
   *  - Removing `throw err` would silence unhandled errors in logs
   *  - This must be the LAST middleware registered (Express convention)
   */
  app.use((err: any, _req: Request, res: Response, _next: NextFunction) => {
    const status = err.status || err.statusCode || 500;
    const message = err.message || "Internal Server Error";
    res.status(status).json({ message });
    throw err;
  });

  /**
   * Static file / Vite dev server setup
   *
   * In production: serves the pre-built frontend from the dist directory.
   * In development: proxies requests through Vite's HMR dev server so the
   *   frontend gets hot-module-replacement.
   *
   * This MUST come after route registration so Vite's catch-all (`*`) doesn't
   * intercept /api/* paths.
   *
   * Impact if changed:
   *  - Serving static files in development would prevent HMR from working
   *  - The conditional check (`NODE_ENV === "production"`) is set by the
   *    workflow command (`npm run dev` vs `npm run start`)
   */
  if (process.env.NODE_ENV === "production") {
    serveStatic(app);
  } else {
    const { setupVite } = await import("./vite");
    await setupVite(httpServer, app);
  }

  /**
   * HTTP server bind
   *
   * Binds to `0.0.0.0` (all interfaces) on PORT (default 5000).
   * Replit firewalls all ports except the one declared in the repl config,
   * so 5000 is the only externally accessible port.
   *
   * `reusePort: true` allows multiple processes to bind the same port (useful
   * for worker cluster scenarios but harmless in single-process mode).
   *
   * Impact if changed:
   *  - Binding to `127.0.0.1` instead of `0.0.0.0` would make the server
   *    unreachable from Replit's public proxy
   *  - Changing the port requires matching Replit workflow configuration
   */
  const port = parseInt(process.env.PORT || "5000", 10);
  httpServer.listen(
    { port, host: "0.0.0.0", reusePort: true },
    () => { log(`serving on port ${port}`); },
  );
})();
