import express from "express";
import cors from "cors";
import rateLimit from "express-rate-limit";
import cookieSession from "cookie-session";
import dotenv from "dotenv";

import authRoutes from "./routes/auth.js";
import reportsRoutes from "./routes/reports.js";
import adminRoutes from "./routes/admin.js";
import analyzeRoutes from "./routes/analyze.js";
import chatRoutes from "./routes/chat.js";
import gmailRoutes from "./routes/gmail.js";
import sseRoutes from "./routes/sse.js";
import { getDatabase } from "./db/sqlite.js";

dotenv.config();

// Initialize Open Source SQLite Database
getDatabase();

const app = express();

app.set("trust proxy", 1);

let allowedOrigin: string | boolean = true;
if (process.env.APP_URL) {
  allowedOrigin = process.env.APP_URL.endsWith("/")
    ? process.env.APP_URL.slice(0, -1)
    : process.env.APP_URL;
}

app.use(
  cors({
    origin: allowedOrigin,
    credentials: true,
  })
);

app.use(express.json({ limit: "50mb" }));
app.use(express.urlencoded({ limit: "50mb", extended: true }));

const apiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10000,
  standardHeaders: true,
  legacyHeaders: false,
  handler: (_req, res) => {
    res.status(429).json({ error: "Too many requests, please try again later." });
  },
});

app.use("/api/", apiLimiter);

app.use(
  cookieSession({
    name: "session",
    keys: [process.env.SESSION_SECRET || "mailverifier_open_source_secret_key_8923"],
    maxAge: 24 * 60 * 60 * 1000,
    secure: process.env.NODE_ENV === "production",
    sameSite: process.env.NODE_ENV === "production" ? "none" : "lax",
    httpOnly: true,
  })
);

// Health check endpoint
app.get("/api/health", (_req, res) => {
  res.json({
    status: "ok",
    engine: "Open Source Forensic Engine + SQLite Database",
    timestamp: new Date().toISOString(),
  });
});

// Mount Routes
app.use("/api/auth", authRoutes);
app.use("/api/reports", reportsRoutes);
app.use("/api/admin", adminRoutes);
app.use("/api/analyze", analyzeRoutes);
app.use("/api/chat-message", chatRoutes);
app.use("/api/sse", sseRoutes);
app.use("/api", gmailRoutes);

// Direct root callback handles OAuth redirects from Google
app.use("/", gmailRoutes);

export default app;
