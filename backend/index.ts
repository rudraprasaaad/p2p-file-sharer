/* eslint-disable @typescript-eslint/no-explicit-any */
import express from "express";
import { createServer } from "http";
import dotenv from "dotenv";
import helmet from "helmet";
import cors from "cors";
import rateLimit from "express-rate-limit";
import cookieParser from "cookie-parser";

import { logger } from "./services/logger";
import { requestLogger } from "./middleware/requestLogger";
import { errorHandler } from "./middleware/errorHandler";

dotenv.config({ path: "../.env" });

class Application {
  public app: express.Application;
  public server: any;

  constructor() {
    this.app = express();
    this.server = createServer(this.app);
  }

  public async init(): Promise<void> {
    this.initializeMiddleware();
    this.initializeErrorHandling();
  }

  private initializeMiddleware(): void {
    const isProduction = process.env.NODE_ENV === "production";

    this.app.use(
      helmet({
        contentSecurityPolicy: isProduction ? undefined : false,
      })
    );

    this.app.use(
      cors({
        origin: process.env.FRONTEND_URL || "http://localhost:5173",
        credentials: true,
        methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
        allowedHeaders: ["Content-Type", "Authorization", "Cookie"],
      })
    );

    this.app.use(cookieParser());

    const limiter = rateLimit({
      windowMs: 15 * 60 * 1000, // 15 minutes
      max: isProduction ? 200 : 100, // More lenient in production for real usage
      message: "Too many requests from this IP, please try again later.",
      standardHeaders: true,
      legacyHeaders: false,
    });

    this.app.use(limiter);

    this.app.use(express.json({ limit: "10mb" }));
    this.app.use(express.urlencoded({ extended: true, limit: "10mb" }));
    this.app.use(requestLogger);

    this.app.get("/api/health", async (_req, res) => {
      try {
        res.json({
          status: "ok",
          timestamp: new Date().toISOString(),
          uptime: process.uptime(),
          environment: process.env.NODE_ENV,
        });
      } catch (err) {
        logger.error("Health check failed:", err);
        res.status(503).json({
          status: "error",
          timestamp: new Date().toISOString(),
          error: "Service unavailable",
        });
      }
    });
  }

  private initializeErrorHandling(): void {
    this.app.use(errorHandler);
  }

  public listen(): void {
    const port = process.env.PORT || 4000;
    const isProduction = process.env.NODE_ENV === "production";

    const host = isProduction ? "0.0.0.0" : "localhost";

    this.server.listen(port, host, () => {
      const baseUrl = isProduction
        ? `https://${process.env.RENDER_EXTERNAL_HOSTNAME}`
        : `http://localhost:${port}`;

      logger.info(`🚀 Server running on port ${port}`);
      logger.info(`📊 Environment: ${process.env.NODE_ENV}`);
      logger.info(`🔗 API URL: ${baseUrl}/`);
      logger.info(`🏥 Health Check: ${baseUrl}/api/health`);
    });

    process.on("SIGTERM", this.gracefulShutdown.bind(this));
    process.on("SIGINT", this.gracefulShutdown.bind(this));
  }

  private async gracefulShutdown(): Promise<void> {
    logger.info("🛑 Starting graceful shutdown...");

    this.server.close(() => {
      logger.info("🌐 HTTP server closed");
    });

    logger.info("✅ Graceful shutdown completed");
    process.exit(0);
  }
}

const app = new Application();

app
  .init()
  .then(() => {
    app.listen();
  })
  .catch((error) => {
    logger.error("❌ Failed to initialize application:", error);
    process.exit(1);
  });

export default app;
