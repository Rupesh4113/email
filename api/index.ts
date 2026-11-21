import express from "express";
import { google } from "googleapis";
import { GoogleGenAI, ThinkingLevel } from "@google/genai";
import dotenv from "dotenv";
import cookieSession from "cookie-session";
import bcrypt from "bcryptjs";
import { dbService, SUPER_ADMIN_EMAIL, ReportAppeal } from "./db.js";
import { runForensicAnalysis, runInboxScan, runRealtimeAlert } from "../backend/engine/forensic-engine.js";
import { answerEmailChatQuery } from "../backend/ai/ollama-provider.js";

function isAdminUser(user: any): boolean {
  return Boolean(
    user?.isAdmin ||
    user?.isSuperAdmin ||
    user?.email?.toLowerCase().trim() === SUPER_ADMIN_EMAIL
  );
}

function isSuperAdminUser(user: any): boolean {
  return Boolean(
    user?.isSuperAdmin ||
    user?.email?.toLowerCase().trim() === SUPER_ADMIN_EMAIL
  );
}

function sanitizePublicReport(rep: any) {
  const { submittedByUserId, submittedByUserEmail, ...rest } = rep;
  return {
    ...rest,
    submittedByUserEmail: rep.isAnonymous ? undefined : submittedByUserEmail,
    appeal: rep.appeal
      ? {
          status: rep.appeal.status,
          reason: rep.appeal.reason,
          submittedAt: rep.appeal.submittedAt,
          reviewedAt: rep.appeal.reviewedAt,
          reviewNotes: rep.appeal.reviewNotes
        }
      : undefined
  };
}

dotenv.config();

import cors from "cors";
import rateLimit from "express-rate-limit";

const app = express();

app.set('trust proxy', 1);

if (!process.env.APP_URL) {
  console.warn("WARNING: APP_URL must be set in environment variables. Falling back to permissive CORS for development.");
}

let allowedOrigin: string | boolean = true;
if (process.env.APP_URL) {
  allowedOrigin = process.env.APP_URL;
  if (typeof allowedOrigin === 'string' && allowedOrigin.endsWith('/')) {
    allowedOrigin = allowedOrigin.slice(0, -1);
  }
}


app.use(cors({
  origin: allowedOrigin,
  credentials: true
}));

app.use(express.json({ limit: "50mb" }));
app.use(express.urlencoded({ limit: "50mb", extended: true }));

const apiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 10000, // Limit each IP to 10000 requests per `window` (here, per 15 minutes)
  standardHeaders: true,
  legacyHeaders: false,
  handler: (req, res) => {
    res.status(429).json({ error: "Too many requests, please try again later." });
  }
});

const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 2000,
  standardHeaders: true,
  legacyHeaders: false,
  handler: (req, res) => {
    res.status(429).json({ error: "Too many authentication requests, please try again later." });
  }
});

const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 5,
  standardHeaders: true,
  legacyHeaders: false,
  handler: (req, res) => {
    res.status(429).json({ error: "Too many login attempts. Please try again in 15 minutes." });
  }
});

app.use("/api/", apiLimiter);

import crypto from "crypto";

// Use a static fallback secret so serverless instances don't invalidate each other's sessions
app.use(cookieSession({
  name: 'session',
  keys: [process.env.SESSION_SECRET || 'mailverifier_fallback_secret_123'],
  maxAge: 24 * 60 * 60 * 1000, // 1 day default
  secure: true,
  sameSite: 'none',
  httpOnly: true,
}));

let ai: GoogleGenAI | null = null;
function getAiClient() {
  if (!ai) {
    ai = new GoogleGenAI({ 
      apiKey: process.env.GEMINI_API_KEY,
      httpOptions: {
        headers: {
          'User-Agent': 'aistudio-build'
        }
      }
    });
  }
  return ai;
}

const oauth2ClientShared = new google.auth.OAuth2(
  process.env.GOOGLE_CLIENT_ID,
  process.env.GOOGLE_CLIENT_SECRET,
  // Not passing redirectUri here since it's only needed for generating auth URL and exchanging code
);

const userGmailTokens: Record<string, any> = {};

async function getGmailTokenForUser(uid: string): Promise<string | null> {
  let tokenData = userGmailTokens[uid];
  if (!tokenData) {
    tokenData = await dbService.getGmailToken(uid);
    if (tokenData) {
      userGmailTokens[uid] = tokenData;
    }
  }

  if (!tokenData) return null;

  if (tokenData.expiry_date && Date.now() >= tokenData.expiry_date - 60000) {
    if (tokenData.refresh_token) {
      try {
        oauth2ClientShared.setCredentials({
          refresh_token: tokenData.refresh_token
        });
        const { credentials } = await oauth2ClientShared.refreshAccessToken();
        tokenData = {
          ...tokenData,
          access_token: credentials.access_token!,
          expiry_date: credentials.expiry_date || null
        };
        userGmailTokens[uid] = tokenData;
        await dbService.saveGmailToken(uid, tokenData);
      } catch (e: any) {
        console.error("Failed to refresh Gmail access token:", e.message);
        return null; // Return null if refresh fails
      }
    } else {
      // Token expired and no refresh token
      return null;
    }
  }

  return tokenData.access_token;
}
const SYSTEM_INSTRUCTION = `You are Mail Verifier AI, a real-time email security assistant embedded inside a mobile and web application.
You operate as part of a full system that continuously scans user emails after secure OAuth permission.
Your responsibilities include: Classifying emails, Detecting phishing patterns, Performing risk scoring, and Explaining reasoning clearly.
You do not access emails yourself. You only analyze structured email data sent to you.

GLOBAL RULES - MUST BE STRICTLY ADHERED TO:
1. NO EMOJIS: Do NOT use any emojis anywhere in your response. No icons, no emoticons. Use clean, plain text and markdown.
2. STRICTLY FACTUAL: Base your analysis strictly and solely on the actual facts, headers, links, and text content present in the received email. Absolutely no hallucinations, self-generated speculations, or unproved claims.
3. ESTABLISH UNCERTAINTY & ANALYZE CONTENT: You will be given pre-verified technical data. Do not invent technical values (like IPs or DKIM) — use only the verified data provided. However, you MUST deeply analyze the EMAIL BODY content to detect social engineering, urgency tactics, and tone. Do not just output "Safe" statically; provide a unique analysis based on the actual message content.
4. CONSISTENT & PROFESSIONAL ARRANGEMENT: Ensure a highly structured, objective, analytical, and professional tone. Your outputs must be clean, neat, and formatted perfectly with standard Markdown, avoiding any conversational filler, casual language, or marketing hype.
5. USER-SAFETY DRIVEN: Focus on objective security risk assessment.
`;


// SSE for real-time alerts
const clients = new Map<string, any>();

app.get("/api/sse", (req, res) => {
  const uid = req.session?.userId || req.query.uid as string;
  if (!uid) return res.status(401).send("Unauthorized");

  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection", "keep-alive");

  clients.set(uid, res);

  req.on("close", () => {
    clients.delete(uid);
  });
});

export function sendRealtimeAlert(uid: string, alertData: any) {
  const client = clients.get(uid);
  if (client) {
    client.write(`data: ${JSON.stringify(alertData)}\n\n`);
  }
}

// Start Gmail Watch
app.post("/api/gmail/watch", async (req, res) => {
  const uid = req.session?.userId || req.headers['x-firebase-uid'] as string;
  if (!uid) return res.status(401).json({ error: "Unauthorized" });

  const token = await getGmailTokenForUser(uid);
  if (!token) return res.status(401).json({ error: "No valid Gmail token" });

  const auth = new google.auth.OAuth2(
    process.env.GOOGLE_CLIENT_ID,
    process.env.GOOGLE_CLIENT_SECRET
  );
  auth.setCredentials({ access_token: token });
  const gmail = google.gmail({ version: "v1", auth });

  try {
    const topicName = process.env.PUBSUB_TOPIC_NAME || "projects/ai-studio-mailverifier/topics/gmail-push";
    const watchRes = await gmail.users.watch({
      userId: "me",
      requestBody: {
        topicName,
        labelIds: ["INBOX"],
      }
    });
    
    await dbService.updateUser(uid, { gmailHistoryId: watchRes.data.historyId } as any);
    res.json({ success: true, historyId: watchRes.data.historyId });
  } catch (err: any) {
    console.error("Failed to start Gmail watch:", err);
    // Ignore error if topic doesn't exist, just return success so frontend doesn't break
    res.json({ success: false, error: err.message });
  }
});

// Pub/Sub Webhook for Gmail Push Notifications
app.post("/api/gmail/webhook", async (req, res) => {
  try {
    const message = req.body.message;
    if (!message || !message.data) {
      return res.status(400).send("Bad Request");
    }

    const data = JSON.parse(Buffer.from(message.data, 'base64').toString('utf8'));
    const emailAddress = data.emailAddress;
    const newHistoryId = data.historyId;

    if (!emailAddress) return res.status(200).send("OK");

    const user = await dbService.getUserByEmail(emailAddress);
    if (!user) return res.status(200).send("User not found");

    const token = await getGmailTokenForUser(user.id);
    if (!token) return res.status(200).send("OK");

    const auth = new google.auth.OAuth2(
      process.env.GOOGLE_CLIENT_ID,
      process.env.GOOGLE_CLIENT_SECRET
    );
    auth.setCredentials({ access_token: token });
    const gmail = google.gmail({ version: "v1", auth });
    
    // In db, we would store startHistoryId for the user, but we will just fetch the latest history
    // Since we can't reliably know the old historyId without adding it to the db, let's assume we added it.
    const oldHistoryId = (user as any).gmailHistoryId || Math.max(0, parseInt(newHistoryId) - 100).toString();
    
    const historyRes = await gmail.users.history.list({
      userId: "me",
      startHistoryId: oldHistoryId,
      historyTypes: ["messageAdded"]
    });

    if (historyRes.data.history) {
      for (const historyItem of historyRes.data.history) {
        if (historyItem.messagesAdded) {
          for (const msgAdded of historyItem.messagesAdded) {
            const msg = await gmail.users.messages.get({
              userId: "me",
              id: msgAdded.message!.id!,
              format: "full"
            });
            
            // Extract basic fields
            const headers = msg.data.payload?.headers || [];
            const getHeader = (name: string) => headers.find(h => h.name.toLowerCase() === name.toLowerCase())?.value || "";
            
            const emailData = {
              subject: getHeader("subject"),
              senderName: getHeader("from").split("<")[0].trim() || getHeader("from"),
              senderEmail: getHeader("from").match(/<([^>]+)>/)?.[1] || getHeader("from"),
              body: msg.data.snippet || "",
              headers: JSON.stringify(headers)
            };

            // Run analysis
            const aiData = await analyzeEmailHelper(emailData, "SINGLE_EMAIL_VIEW", user.id);
            if (aiData?.ai_risk_engine?.final_risk_classification && 
                ["Suspicious", "Likely Phishing", "Phishing"].includes(aiData.ai_risk_engine.final_risk_classification)) {
              
              sendRealtimeAlert(user.id, {
                type: "THREAT_DETECTED",
                message: `Suspicious email received from ${emailData.senderEmail}`,
                classification: aiData.ai_risk_engine.final_risk_classification
              });
            }
          }
        }
      }
    }

    await dbService.updateUser(user.id, { gmailHistoryId: newHistoryId } as any);
    res.status(200).send("OK");
  } catch (err: any) {
    console.error("Webhook error:", err);
    res.status(200).send("OK"); // Acknowledge pub/sub to prevent retries
  }
});

// Cron Endpoint to renew watches
app.get("/api/cron/renew-watches", async (req, res) => {
  const users = await dbService.getAllUsers();
  for (const user of users) {
    const token = await getGmailTokenForUser(user.id);
    if (token) {
      try {
        const auth = new google.auth.OAuth2(
          process.env.GOOGLE_CLIENT_ID,
          process.env.GOOGLE_CLIENT_SECRET
        );
        auth.setCredentials({ access_token: token });
        const gmail = google.gmail({ version: "v1", auth });
        const topicName = process.env.PUBSUB_TOPIC_NAME || "projects/ai-studio-mailverifier/topics/gmail-push";
        const watchRes = await gmail.users.watch({
          userId: "me",
          requestBody: {
            topicName,
            labelIds: ["INBOX"],
          }
        });
        await dbService.updateUser(user.id, { gmailHistoryId: watchRes.data.historyId } as any);
      } catch(e) {
        // ignore
      }
    }
  }
  res.send("Watches renewed");
});

// Custom Local Auth routes
app.get("/api/health", (req, res) => {
  res.json({ status: "ok", env: process.env.VERCEL ? "vercel" : "local" });
});

app.post("/api/auth/register", authLimiter, async (req, res) => {
  const { email, password, name } = req.body;
  if (!email || !password || !name) {
    return res.status(400).json({ error: "Email, password, and name are required" });
  }

  try {
    const existingUser = await dbService.getUserByEmail(email);
    if (existingUser) {
      return res.status(400).json({ error: "An account with this email already exists" });
    }

    const salt = await bcrypt.genSalt(10);
    const passwordHash = await bcrypt.hash(password, salt);

    const newUser = await dbService.createUser(email, passwordHash, name);

    // Generate verification token
    const token = crypto.randomBytes(32).toString("hex");
    await dbService.updateUser(newUser.id, { verificationToken: token, isVerified: false });
    console.log("\n\n=== ACTION REQUIRED ===\nPlease verify your email by opening this link:");
    console.log(`http://localhost:3000/api/auth/verify?token=${token}&email=${encodeURIComponent(email)}`);
    console.log("=======================\n\n");
    res.json({ success: true, message: "Please check your email to verify your account before logging in." });
  } catch (error: any) {
    res.status(500).json({ error: error?.message || "Failed to register user" });
  }
});

app.get("/api/auth/verify", async (req, res) => {
  const { email, token } = req.query;
  if (!email || !token || typeof email !== 'string' || typeof token !== 'string') {
    return res.status(400).send("Invalid verification link.");
  }
  try {
    const user = await dbService.getUserByEmail(email);
    if (!user) {
      return res.status(400).send("User not found.");
    }
    if (user.isVerified) {
      return res.send("Account already verified. You can now log in.");
    }
    if (user.verificationToken !== token) {
      return res.status(400).send("Invalid verification token.");
    }
    await dbService.updateUser(user.id, { isVerified: true, verificationToken: undefined });
    res.send("Email verified successfully! You can now log in.");
  } catch (error) {
    res.status(500).send("Failed to verify email.");
  }
});
app.post("/api/auth/login", loginLimiter, async (req, res) => {
  const { email, password, rememberMe } = req.body;
  if (!email || !password) {
    return res.status(400).json({ error: "Email and password are required" });
  }

  try {
    const user = await dbService.getUserByEmail(email);
    if (!user) {
      return res.status(400).json({ error: "Invalid email or password" });
    }

    if (user.lockedUntil && new Date(user.lockedUntil) > new Date()) {
      return res.status(403).json({ error: "Account is temporarily locked due to too many failed attempts. Try again later." });
    }

    const isMatch = await bcrypt.compare(password, user.passwordHash);
    if (!isMatch) {
      const attempts = (user.failedLoginAttempts || 0) + 1;
      let lockedUntil = null;
      if (attempts >= 5) {
        lockedUntil = new Date(Date.now() + 15 * 60 * 1000).toISOString();
      }
      await dbService.updateUser(user.id, { failedLoginAttempts: attempts, lockedUntil });
      return res.status(400).json({ error: "Invalid email or password" });
    }

    if (user.isVerified === false) {
      return res.status(403).json({ error: "Please verify your email address before logging in." });
    }

    // Reset failed attempts on success
    if (user.failedLoginAttempts! > 0) {
      await dbService.updateUser(user.id, { failedLoginAttempts: 0, lockedUntil: null });
    }

    // Check if user has a pending admin invite
    let activeUser = user;
    const invites = await dbService.getAdminInvites();
    const hasInvite = invites.some(inv => inv.email.toLowerCase() === activeUser.email.toLowerCase().trim());
    if (hasInvite && !activeUser.isAdmin) {
      const promoted = await dbService.updateUser(activeUser.id, { isAdmin: true });
      if (promoted) activeUser = promoted;
      await dbService.syncAdminDoc(activeUser.id, activeUser.email, true, isSuperAdminUser(activeUser));
      await dbService.removeAdminInvite(activeUser.email);
    }

    req.session!.userId = activeUser.id;

    res.json({
      success: true,
      user: {
        id: activeUser.id,
        email: activeUser.email,
        name: activeUser.name,
        subscription: activeUser.subscription,
        isAdmin: isAdminUser(activeUser),
        isSuperAdmin: isSuperAdminUser(activeUser)
      }
    });
  } catch (error: any) {
    console.error("Login error:", error);
    res.status(500).json({ error: error?.message || "Failed to login" });
  }
});

app.post("/api/auth/logout", (req, res) => {
  req.session = null;
  res.json({ success: true });
});

app.get("/api/auth/me", async (req, res) => {
  const userId = req.session?.userId || req.headers['x-firebase-uid'] as string;
  if (!userId) {
    return res.json({ user: null });
  }

  const user = await dbService.getUserById(userId);
  if (!user) {
    req.session = null;
    return res.json({ user: null });
  }

  res.json({
    user: {
      id: user.id,
      email: user.email,
      name: user.name,
      subscription: user.subscription,
      isAdmin: isAdminUser(user),
      isSuperAdmin: isSuperAdminUser(user)
    }
  });
});

app.post("/api/auth/subscription", async (req, res) => {
  const userId = req.session?.userId || req.headers['x-firebase-uid'] as string;
  if (!userId) return res.status(401).json({ error: "Unauthorized" });

  const { subscription } = req.body;
  if (!subscription) return res.status(400).json({ error: "Missing subscription data" });

  const updatedUser = await dbService.updateUserSubscription(userId, subscription);
  if (!updatedUser) return res.status(404).json({ error: "User not found" });

  res.json({ success: true, subscription: updatedUser.subscription });
});

// Admin management endpoints
app.get("/api/admin/users", async (req, res) => {
  const currentUid = req.session?.userId || req.headers['x-firebase-uid'] as string;
  if (!currentUid) return res.status(401).json({ error: "Unauthorized" });
  const requestingUser = await dbService.getUserById(currentUid);
  if (!isAdminUser(requestingUser)) return res.status(403).json({ error: "Forbidden" });

  const users = await dbService.getAllUsers();
  const safeUsers = users.map(u => ({
    id: u.id,
    email: u.email,
    name: u.name,
    subscription: u.subscription,
    createdAt: u.createdAt,
    isAdmin: isAdminUser(u),
    isSuperAdmin: isSuperAdminUser(u),
    status: u.subscription ? "active" : "inactive"
  }));
  res.json(safeUsers);
});

app.delete("/api/admin/users/:id", async (req, res) => {
  const currentUid = req.session?.userId || req.headers['x-firebase-uid'] as string;
  if (!currentUid) return res.status(401).json({ error: "Unauthorized" });
  const requestingUser = await dbService.getUserById(currentUid);
  if (!isAdminUser(requestingUser)) return res.status(403).json({ error: "Forbidden" });

  const { id } = req.params;
  const targetUser = await dbService.getUserById(id);
  if (!targetUser) {
    return res.status(404).json({ error: "User not found" });
  }
  if (isSuperAdminUser(targetUser)) {
    return res.status(403).json({ error: "Super Admin account cannot be deleted." });
  }
  if (isAdminUser(targetUser) && !isSuperAdminUser(requestingUser)) {
    return res.status(403).json({ error: "Only the Super Admin can delete another admin account." });
  }

  const deleted = await dbService.deleteUser(id);
  if (!deleted) {
    return res.status(404).json({ error: "User not found" });
  }
  await dbService.syncAdminDoc(id, targetUser.email, false);
  res.json({ success: true });
});

app.post("/api/admin/users/:id/subscription", async (req, res) => {
  const currentUid = req.session?.userId || req.headers['x-firebase-uid'] as string;
  if (!currentUid) return res.status(401).json({ error: "Unauthorized" });
  const requestingUser = await dbService.getUserById(currentUid);
  if (!isAdminUser(requestingUser)) return res.status(403).json({ error: "Forbidden" });

  const { id } = req.params;
  const { subscription } = req.body;
  if (!subscription) return res.status(400).json({ error: "Missing subscription data" });

  const updatedUser = await dbService.updateUserSubscription(id, subscription);
  if (!updatedUser) {
    return res.status(404).json({ error: "User not found" });
  }

  res.json({ success: true, subscription: updatedUser.subscription });
});

// Super Admin: Manage Admins
app.get("/api/admin/admins", async (req, res) => {
  try {
    const currentUid = req.session?.userId || req.headers['x-firebase-uid'] as string;
    if (!currentUid) return res.status(401).json({ error: "Unauthorized" });
    const requestingUser = await dbService.getUserById(currentUid);
    if (!isAdminUser(requestingUser)) return res.status(403).json({ error: "Forbidden" });

    const allUsers = await dbService.getAllUsers();
    const admins = allUsers
      .filter(u => isAdminUser(u))
      .map(u => ({
        id: u.id,
        email: u.email,
        name: u.name,
        isAdmin: true,
        isSuperAdmin: isSuperAdminUser(u),
        createdAt: u.createdAt
      }));
    const invites = await dbService.getAdminInvites();
    res.json({
      admins,
      invites,
      superAdminEmail: SUPER_ADMIN_EMAIL
    });
  } catch (err: any) {
    console.error("Error fetching admins:", err);
    res.status(500).json({ error: "Failed to fetch admins" });
  }
});

app.post("/api/admin/admins", async (req, res) => {
  try {
    const currentUid = req.session?.userId || req.headers['x-firebase-uid'] as string;
    if (!currentUid) return res.status(401).json({ error: "Unauthorized" });
    const requestingUser = await dbService.getUserById(currentUid);
    if (!isSuperAdminUser(requestingUser)) {
      return res.status(403).json({ error: "Forbidden: Only the Super Admin can add other admins." });
    }

    const { email } = req.body;
    if (!email || typeof email !== "string" || !email.includes("@")) {
      return res.status(400).json({ error: "Please provide a valid email address." });
    }

    const normalizedEmail = email.toLowerCase().trim();
    const existingUser = await dbService.getUserByEmail(normalizedEmail);

    if (existingUser) {
      const updated = await dbService.updateUser(existingUser.id, {
        isAdmin: true,
        isSuperAdmin: normalizedEmail === SUPER_ADMIN_EMAIL
      });
      await dbService.syncAdminDoc(existingUser.id, normalizedEmail, true, normalizedEmail === SUPER_ADMIN_EMAIL);
      await dbService.removeAdminInvite(normalizedEmail);
      return res.json({
        success: true,
        mode: "promoted",
        admin: {
          id: existingUser.id,
          email: existingUser.email,
          name: existingUser.name,
          isAdmin: true,
          isSuperAdmin: isSuperAdminUser(updated || existingUser)
        }
      });
    } else {
      const invite = await dbService.addAdminInvite(normalizedEmail, requestingUser!.email);
      return res.json({
        success: true,
        mode: "invited",
        invite
      });
    }
  } catch (err: any) {
    console.error("Error adding admin:", err);
    res.status(500).json({ error: "Failed to add admin" });
  }
});

app.delete("/api/admin/admins/:identifier", async (req, res) => {
  try {
    const currentUid = req.session?.userId || req.headers['x-firebase-uid'] as string;
    if (!currentUid) return res.status(401).json({ error: "Unauthorized" });
    const requestingUser = await dbService.getUserById(currentUid);
    if (!isSuperAdminUser(requestingUser)) {
      return res.status(403).json({ error: "Forbidden: Only the Super Admin can remove admins." });
    }

    const identifier = decodeURIComponent(req.params.identifier).trim();
    if (identifier.toLowerCase() === SUPER_ADMIN_EMAIL || identifier === requestingUser?.id) {
      return res.status(400).json({ error: "The Super Admin cannot be removed." });
    }

    if (identifier.includes("@")) {
      const targetUser = await dbService.getUserByEmail(identifier);
      if (targetUser) {
        if (isSuperAdminUser(targetUser)) {
          return res.status(400).json({ error: "The Super Admin cannot be removed." });
        }
        await dbService.updateUser(targetUser.id, { isAdmin: false, isSuperAdmin: false });
        await dbService.syncAdminDoc(targetUser.id, targetUser.email, false);
      }
      await dbService.removeAdminInvite(identifier);
      return res.json({ success: true });
    } else {
      const targetUser = await dbService.getUserById(identifier);
      if (!targetUser) {
        return res.status(404).json({ error: "Admin user not found" });
      }
      if (isSuperAdminUser(targetUser)) {
        return res.status(400).json({ error: "The Super Admin cannot be removed." });
      }
      await dbService.updateUser(targetUser.id, { isAdmin: false, isSuperAdmin: false });
      await dbService.syncAdminDoc(targetUser.id, targetUser.email, false);
      return res.json({ success: true });
    }
  } catch (err: any) {
    console.error("Error removing admin:", err);
    res.status(500).json({ error: "Failed to remove admin" });
  }
});

// Community Email Reports Endpoints
app.post("/api/reports", async (req, res) => {
  try {
    const currentUid = req.session?.userId || req.headers['x-firebase-uid'] as string;
    const {
      senderDisplayName,
      senderEmail,
      subject,
      recipientEmail,
      dateReceived,
      emailProvider,
      bodyExcerpt,
      suspiciousUrls,
      headers,
      screenshotUrl,
      reasons,
      userNotes,
      redFlagsObserved,
      targetBrand,
      isAnonymous
    } = req.body;

    if (!senderEmail || !subject || !reasons || !Array.isArray(reasons) || reasons.length === 0) {
      return res.status(400).json({ error: "Missing required fields: senderEmail, subject, and at least one reason are required." });
    }

    if (!screenshotUrl || typeof screenshotUrl !== "string" || !screenshotUrl.trim()) {
      return res.status(400).json({ error: "A screenshot of the email is required as evidence before reporting." });
    }

    let userEmail: string | undefined = undefined;
    if (currentUid && !isAnonymous) {
      const u = await dbService.getUserById(currentUid);
      userEmail = u?.email;
    }

    const report = await dbService.createReport({
      senderDisplayName: senderDisplayName || "",
      senderEmail: senderEmail.trim(),
      subject: subject.trim(),
      recipientEmail: recipientEmail ? recipientEmail.trim() : undefined,
      dateReceived: dateReceived || new Date().toISOString().split("T")[0],
      emailProvider: emailProvider || "Other",
      bodyExcerpt: bodyExcerpt ? bodyExcerpt.substring(0, 5000) : "",
      suspiciousUrls: Array.isArray(suspiciousUrls) ? suspiciousUrls : [],
      headers: headers ? headers.substring(0, 10000) : "",
      screenshotUrl: screenshotUrl.trim(),
      reasons,
      userNotes: userNotes || "",
      redFlagsObserved: Array.isArray(redFlagsObserved) ? redFlagsObserved : [],
      targetBrand: targetBrand || "",
      isAnonymous: !!isAnonymous,
      submittedByUserId: currentUid || undefined,
      submittedByUserEmail: userEmail,
      status: "pending_review"
    });

    res.json({ success: true, report });
  } catch (err: any) {
    console.error("Error creating community report:", err);
    res.status(500).json({ error: "Failed to submit report" });
  }
});

app.get("/api/reports/public", async (req, res) => {
  try {
    const q = req.query.q as string | undefined;
    const category = req.query.category as string | undefined;
    const reports = await dbService.getPublicReports(q, category);
    res.json({ reports: reports.map(sanitizePublicReport) });
  } catch (err: any) {
    console.error("Error fetching public community reports:", err);
    res.status(500).json({ error: "Failed to fetch community reports" });
  }
});

// Check if a specific sender email has approved community reports
app.get("/api/reports/check", async (req, res) => {
  try {
    const email = (req.query.email as string || "").toLowerCase().trim();
    if (!email) return res.json({ reported: false, count: 0, reports: [] });

    const allApproved = await dbService.getPublicReports();
    const matches = allApproved.filter(r => r.senderEmail?.toLowerCase().trim() === email);
    res.json({
      reported: matches.length > 0,
      count: matches.length,
      reports: matches.map(sanitizePublicReport)
    });
  } catch (err: any) {
    console.error("Error checking reported email:", err);
    res.status(500).json({ error: "Failed to check reported email" });
  }
});

// Reported Email Owner Appeal Endpoint
app.post("/api/reports/:id/appeal", async (req, res) => {
  try {
    const { id } = req.params;
    const currentUid = req.session?.userId || req.headers['x-firebase-uid'] as string;
    const {
      appellantName,
      appellantEmail,
      appellantRole,
      reason,
      explanation,
      evidenceLinksOrText
    } = req.body;

    if (!appellantName?.trim() || !appellantEmail?.trim() || !reason?.trim() || !explanation?.trim()) {
      return res.status(400).json({
        error: "Appellant name, owner contact email, appeal reason, and detailed explanation are required."
      });
    }

    const report = await dbService.getReportById(id);
    if (!report) {
      return res.status(404).json({ error: "Report not found" });
    }

    if (report.hasAppeal && report.appeal?.status === "pending") {
      return res.status(400).json({
        error: "An appeal for this report is already pending administrator review."
      });
    }

    let isVerifiedSenderMatch = false;
    if (currentUid) {
      const currentUser = await dbService.getUserById(currentUid);
      if (
        currentUser?.email &&
        report.senderEmail &&
        currentUser.email.toLowerCase().trim() === report.senderEmail.toLowerCase().trim()
      ) {
        isVerifiedSenderMatch = true;
      }
    }

    const appeal: ReportAppeal = {
      appellantName: appellantName.trim(),
      appellantEmail: appellantEmail.trim(),
      appellantRole: (appellantRole || "Email / Domain Owner").trim(),
      reason: reason.trim(),
      explanation: explanation.trim().substring(0, 5000),
      evidenceLinksOrText: evidenceLinksOrText ? evidenceLinksOrText.trim().substring(0, 3000) : "",
      isVerifiedSenderMatch,
      status: "pending",
      submittedAt: new Date().toISOString()
    };

    const updated = await dbService.updateReport(id, {
      hasAppeal: true,
      appeal
    });

    if (!updated) return res.status(404).json({ error: "Failed to save appeal" });

    res.json({
      success: true,
      report: sanitizePublicReport(updated)
    });
  } catch (err: any) {
    console.error("Error submitting report appeal:", err);
    res.status(500).json({ error: "Failed to submit appeal" });
  }
});

app.get("/api/admin/reports", async (req, res) => {
  try {
    const currentUid = req.session?.userId || req.headers['x-firebase-uid'] as string;
    if (!currentUid) return res.status(401).json({ error: "Unauthorized" });
    const requestingUser = await dbService.getUserById(currentUid);
    if (!isAdminUser(requestingUser)) return res.status(403).json({ error: "Forbidden: Admin privileges required" });

    const reports = await dbService.getAllReports();
    res.json({ reports });
  } catch (err: any) {
    console.error("Error fetching admin reports:", err);
    res.status(500).json({ error: "Failed to fetch admin reports" });
  }
});

app.patch("/api/admin/reports/:id", async (req, res) => {
  try {
    const currentUid = req.session?.userId || req.headers['x-firebase-uid'] as string;
    if (!currentUid) return res.status(401).json({ error: "Unauthorized" });
    const requestingUser = await dbService.getUserById(currentUid);
    if (!isAdminUser(requestingUser)) return res.status(403).json({ error: "Forbidden: Only admins can approve or moderate reports." });

    const { id } = req.params;
    const { status, moderationNotes } = req.body;
    if (!["approved", "rejected", "pending_review"].includes(status)) {
      return res.status(400).json({ error: "Invalid status" });
    }

    const updated = await dbService.updateReport(id, {
      status,
      moderationNotes: moderationNotes || "",
      reviewedAt: new Date().toISOString(),
      reviewedBy: requestingUser!.email || requestingUser!.id
    });

    if (!updated) return res.status(404).json({ error: "Report not found" });
    res.json({ success: true, report: updated });
  } catch (err: any) {
    console.error("Error updating report status:", err);
    res.status(500).json({ error: "Failed to update report" });
  }
});

app.patch("/api/admin/reports/:id/appeal", async (req, res) => {
  try {
    const currentUid = req.session?.userId || req.headers['x-firebase-uid'] as string;
    if (!currentUid) return res.status(401).json({ error: "Unauthorized" });
    const requestingUser = await dbService.getUserById(currentUid);
    if (!isAdminUser(requestingUser)) return res.status(403).json({ error: "Forbidden: Only admins can resolve appeals." });

    const { id } = req.params;
    const { decision, reviewNotes, deleteReport } = req.body;
    if (!["approved", "rejected"].includes(decision)) {
      return res.status(400).json({ error: "Decision must be 'approved' (uphold appeal) or 'rejected' (dismiss appeal)." });
    }

    const report = await dbService.getReportById(id);
    if (!report || !report.appeal) {
      return res.status(404).json({ error: "Report or appeal not found" });
    }

    if (decision === "approved" && deleteReport) {
      await dbService.deleteReport(id);
      return res.json({ success: true, deleted: true, id });
    }

    const updatedAppeal: ReportAppeal = {
      ...report.appeal,
      status: decision,
      reviewNotes: reviewNotes || (decision === "approved" ? "Appeal upheld by administrator. Report removed from public directory." : "Appeal reviewed and dismissed; report remains active."),
      reviewedBy: requestingUser!.email || requestingUser!.id,
      reviewedAt: new Date().toISOString()
    };

    const updates: any = {
      hasAppeal: true,
      appeal: updatedAppeal
    };

    // If appeal is upheld ("approved"), remove report from public visibility
    if (decision === "approved") {
      updates.status = "rejected";
      updates.moderationNotes = `Appeal Upheld (${requestingUser!.email}): ${updatedAppeal.reviewNotes}`;
      updates.reviewedAt = new Date().toISOString();
      updates.reviewedBy = requestingUser!.email || requestingUser!.id;
    }

    const updated = await dbService.updateReport(id, updates);
    if (!updated) return res.status(404).json({ error: "Report not found" });

    res.json({ success: true, report: updated });
  } catch (err: any) {
    console.error("Error resolving appeal:", err);
    res.status(500).json({ error: "Failed to resolve appeal" });
  }
});

app.delete("/api/admin/reports/:id", async (req, res) => {
  try {
    const currentUid = req.session?.userId || req.headers['x-firebase-uid'] as string;
    if (!currentUid) return res.status(401).json({ error: "Unauthorized" });
    const requestingUser = await dbService.getUserById(currentUid);
    if (!isAdminUser(requestingUser)) return res.status(403).json({ error: "Forbidden: Only admins can delete reports." });

    const { id } = req.params;
    const success = await dbService.deleteReport(id);
    if (!success) return res.status(404).json({ error: "Report not found" });
    res.json({ success: true });
  } catch (err: any) {
    console.error("Error deleting report:", err);
    res.status(500).json({ error: "Failed to delete report" });
  }
});

app.get("/api/auth/google/url", (req, res) => {
  const userId = req.session?.userId || req.headers['x-firebase-uid'] as string || req.query.uid as string;
  const isLoginFlow = !userId;

  // Construct Redirect URI
  let appUrl = (process.env.APP_URL || `${req.protocol}://${req.get('host')}`) as string;
  if (appUrl.endsWith("/")) {
    appUrl = appUrl.slice(0, -1);
  }
  // Use /api/auth/callback to align with GOOGLE_API_SETUP.md and solve redirect_uri_mismatch
  const redirectUri = `${appUrl}/api/auth/callback`;

  if (!process.env.GOOGLE_CLIENT_ID || !process.env.GOOGLE_CLIENT_SECRET) {
    return res.status(500).json({ error: "Google OAuth credentials are not configured on the server." });
  }

  const oauth2Client = new google.auth.OAuth2(
    process.env.GOOGLE_CLIENT_ID,
    process.env.GOOGLE_CLIENT_SECRET,
    redirectUri
  );

  const scope = [
    "https://www.googleapis.com/auth/gmail.modify",
    "https://www.googleapis.com/auth/gmail.send",
    "https://www.googleapis.com/auth/userinfo.email",
    "https://www.googleapis.com/auth/userinfo.profile"
  ];

  const stateNonce = crypto.randomBytes(16).toString('hex');
  req.session!.oauthState = stateNonce;
  req.session!.oauthTargetUserId = userId;
  req.session!.oauthIsLoginFlow = isLoginFlow;

  const authUrl = oauth2Client.generateAuthUrl({
    access_type: "offline",
    scope,
    prompt: "consent",
    state: stateNonce
  });

  res.json({ url: authUrl });
});

app.get(["/auth/callback", "/auth/callback/", "/api/auth/callback", "/api/auth/callback/"], async (req, res) => {
  const { code, state } = req.query;
  if (!code) {
    return res.status(400).send("No authentication code received.");
  }

  if (!state || state !== req.session?.oauthState) {
    return res.status(400).send("Invalid state parameter (CSRF detected).");
  }

  let appUrl = (process.env.APP_URL || `${req.protocol}://${req.get('host')}`) as string;
  if (appUrl.endsWith("/")) {
    appUrl = appUrl.slice(0, -1);
  }
  // Determine path to match the current request path (either /auth/callback or /api/auth/callback)
  const pathUsed = req.path.includes("/api/") ? "/api/auth/callback" : "/auth/callback";
  const redirectUri = `${appUrl}${pathUsed}`;

  if (!process.env.GOOGLE_CLIENT_ID || !process.env.GOOGLE_CLIENT_SECRET) {
    return res.status(500).send("Google OAuth credentials are not configured on the server.");
  }

  try {
    const oauth2Client = new google.auth.OAuth2(
      process.env.GOOGLE_CLIENT_ID,
      process.env.GOOGLE_CLIENT_SECRET,
      redirectUri
    );

    const { tokens } = await oauth2Client.getToken(code as string);
    oauth2Client.setCredentials(tokens);

    let finalUserId: string | null = null;
    let safeUser: any = null;

    const isLoginFlow = req.session?.oauthIsLoginFlow;
    let targetUserId = req.session?.oauthTargetUserId;

    // Fetch user info from Google
    let email = "";
    let name = "Secure Agent";
    try {
      const oauth = google.oauth2({
        auth: oauth2Client,
        version: "v2"
      });
      const userInfo = await oauth.userinfo.get();
      email = userInfo.data.email || "";
      name = userInfo.data.name || "Secure Agent";
    } catch (e) {
      console.error("Failed to get Google user info in callback:", e);
    }

    if (isLoginFlow || !targetUserId) {
      if (!email) {
        return res.status(400).send("Failed to retrieve your email address from Google. Please try again.");
      }
      // Check if user already exists in db by email
      let existingUser = await dbService.getUserByEmail(email);
      if (!existingUser) {
        // Create user if not registered yet
        const salt = await bcrypt.genSalt(10);
        const passwordHash = await bcrypt.hash("google-auth-pwd-" + Math.random().toString(36), salt);
        existingUser = await dbService.createUser(email, passwordHash, name);
      } else {
        // Check if existing user has a pending admin invite
        const invites = await dbService.getAdminInvites();
        const hasInvite = invites.some(inv => inv.email.toLowerCase() === email.toLowerCase().trim());
        if (hasInvite && !existingUser.isAdmin) {
          const promoted = await dbService.updateUser(existingUser.id, { isAdmin: true });
          if (promoted) existingUser = promoted;
          await dbService.syncAdminDoc(existingUser.id, existingUser.email, true, isSuperAdminUser(existingUser));
          await dbService.removeAdminInvite(email);
        }
      }
      finalUserId = existingUser.id;
      safeUser = {
        id: existingUser.id,
        email: existingUser.email,
        name: existingUser.name,
        subscription: existingUser.subscription,
        isAdmin: isAdminUser(existingUser),
        isSuperAdmin: isSuperAdminUser(existingUser)
      };
    } else {
      finalUserId = targetUserId;
      const existingUser = await dbService.getUserById(finalUserId);
      if (existingUser) {
        safeUser = {
          id: existingUser.id,
          email: existingUser.email,
          name: existingUser.name,
          subscription: existingUser.subscription,
          isAdmin: isAdminUser(existingUser),
          isSuperAdmin: isSuperAdminUser(existingUser)
        };
      }
    }

    if (!finalUserId) {
      return res.status(400).send("No valid user session or ID found. Please try connecting again.");
    }

    // Set the cookie session to log them in securely
    req.session!.userId = finalUserId;

    if (tokens && tokens.access_token) {
      const tokenData = {
        access_token: tokens.access_token,
        refresh_token: tokens.refresh_token,
        expiry_date: tokens.expiry_date
      };
      await dbService.saveGmailToken(finalUserId, tokenData);
      
      // Also store in userGmailTokens in memory to avoid reading from disk on every route call
      userGmailTokens[finalUserId] = tokenData;
    }

    res.redirect("/");
  } catch (error: any) {
    console.error("Google Auth Callback Error:", error);
    res.status(500).send("Failed to exchange Google authentication code: " + (error.message || error));
  }
});

app.use(express.json({ limit: "50mb" }));
app.use(express.urlencoded({ limit: "50mb", extended: true }));

function buildMimeMessage({
  to,
  subject,
  body,
  attachments = [],
  inReplyTo = "",
  references = ""
}: {
  to: string;
  subject: string;
  body: string;
  attachments?: { name: string; type: string; data: string }[];
  inReplyTo?: string;
  references?: string;
}) {
  const boundary = "FOO_BAR_BOUNDARY";
  const nl = "\r\n";

  let headerArr = [
    `To: ${to}`,
    `Subject: ${subject}`,
    `MIME-Version: 1.0`
  ];
  if (inReplyTo) {
    headerArr.push(`In-Reply-To: ${inReplyTo}`);
  }
  if (references) {
    headerArr.push(`References: ${references}`);
  }
  headerArr.push(`Content-Type: multipart/mixed; boundary="${boundary}"`);
  headerArr.push("");
  headerArr.push("");
  let header = headerArr.join(nl);

  let bodyPart = [
    `--${boundary}`,
    `Content-Type: text/plain; charset="utf-8"`,
    `Content-Transfer-Encoding: 7bit`,
    "",
    body,
    ""
  ].join(nl);

  let attachmentParts = attachments.map(att => {
    let base64Data = att.data;
    if (base64Data.includes(";base64,")) {
      base64Data = base64Data.split(";base64,")[1];
    }
    return [
      `--${boundary}`,
      `Content-Type: ${att.type}; name="${att.name}"`,
      `Content-Disposition: attachment; filename="${att.name}"`,
      `Content-Transfer-Encoding: base64`,
      "",
      base64Data,
      ""
    ].join(nl);
  }).join("");

  let footer = `--${boundary}--`;

  const fullMime = header + bodyPart + attachmentParts + footer;
  
  const encoded = Buffer.from(fullMime)
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");

  return encoded;
}

app.post("/api/gmail/mark-read", async (req, res) => {
  const uid = req.session?.userId || req.headers['x-firebase-uid'] as string;
  if (!uid) return res.status(401).json({ error: "No UID provided" });
  
  const { messageId } = req.body;
  if (!messageId) return res.status(400).json({ error: "Missing messageId" });

  const token = await getGmailTokenForUser(uid);
  if (!token) return res.status(401).json({ error: "No Gmail token found." });

  const client = new google.auth.OAuth2();
  client.setCredentials({ access_token: token });
  const gmail = google.gmail({ version: "v1", auth: client });

  try {
    await gmail.users.messages.modify({
      userId: "me",
      id: messageId,
      requestBody: {
        removeLabelIds: ["UNREAD"],
      },
    });
    res.json({ success: true });
  } catch (error: any) {
    // Ignore or log softly if scope is insufficient
    if (error?.message?.includes("insufficient authentication scopes")) {
      console.log("mark-read skipped due to insufficient scopes (user needs to re-auth)");
    } else {
      console.error("Gmail mark-read error:", error?.message);
    }
    res.status(500).json({ error: error?.message || "Failed to mark as read" });
  }
});

app.post("/api/gmail/send", async (req, res) => {
  const uid = req.session?.userId || req.headers['x-firebase-uid'] as string;
  if (!uid) return res.status(401).json({ error: "No UID provided" });

  const token = await getGmailTokenForUser(uid);
  if (!token) return res.status(401).json({ error: "No Gmail token found. Please reconnect Google account." });

  const { to, subject, body, attachments, replyToMessageId } = req.body;
  if (!to || !subject || !body) {
    return res.status(400).json({ error: "Missing required fields (to, subject, body)" });
  }

  const client = new google.auth.OAuth2();
  client.setCredentials({ access_token: token });

  const gmail = google.gmail({ version: "v1", auth: client });

  try {
    let inReplyTo = "";
    let references = "";
    let threadId = "";
    if (replyToMessageId) {
      try {
        const origMsg = await gmail.users.messages.get({ userId: "me", id: replyToMessageId, format: "metadata", metadataHeaders: ["Message-ID", "References"] });
        const headers = origMsg.data.payload?.headers || [];
        const msgIdHeader = headers.find(h => h.name.toLowerCase() === "message-id");
        const refsHeader = headers.find(h => h.name.toLowerCase() === "references");
        if (msgIdHeader && msgIdHeader.value) {
          inReplyTo = msgIdHeader.value;
          references = refsHeader && refsHeader.value ? refsHeader.value + " " + inReplyTo : inReplyTo;
        }
        if (origMsg.data.threadId) {
          threadId = origMsg.data.threadId;
        }
      } catch (e) {
        console.warn("Could not fetch original message for threading", e);
      }
    }
    const rawMessage = buildMimeMessage({ to, subject, body, attachments, inReplyTo, references });
    const response = await gmail.users.messages.send({
      userId: "me",
      requestBody: {
        raw: rawMessage,
        ...(threadId ? { threadId } : {})
      },
    });

    res.json({ success: true, messageId: response.data.id });
  } catch (error: any) {
    console.error("Gmail send error:", error);
    res.status(500).json({ error: error?.message || "Failed to send email" });
  }
});

app.post("/api/auth/store-token", async (req, res) => {
  const uid = req.session?.userId || req.headers['x-firebase-uid'] as string;
  const { token } = req.body;
  if (!token || !uid) return res.status(400).json({ error: "Missing fields or unauthorized" });
  userGmailTokens[uid] = token;
  await dbService.saveGmailToken(uid, token);
  res.json({ success: true });
});

const messagesCache: Record<string, any> = {};

app.get("/api/gmail/messages", async (req, res) => {
  const uid = req.session?.userId || req.headers['x-firebase-uid'] as string;
  if (!uid) return res.status(401).json({ error: "No UID provided" });
  
  const token = await getGmailTokenForUser(uid);
  if (!token) return res.status(401).json({ error: "No Gmail token found. Please reconnect Google account." });
  
  const client = new google.auth.OAuth2();
  client.setCredentials({ access_token: token });
  
  const gmail = google.gmail({ version: "v1", auth: client });
  
  try {
    const maxResults = Math.min(parseInt(req.query.maxResults as string) || 10, 25);
    const q = req.query.q as string || undefined;
    const pageToken = req.query.pageToken as string || undefined;

    const response = await gmail.users.messages.list({
      userId: "me",
      maxResults,
      q,
      pageToken,
    });
    
    const messages = await Promise.all(
      (response.data.messages || []).map(async (msg) => {
        const cacheKey = `${uid}_${msg.id}`;
        if (messagesCache[cacheKey]) {
          return messagesCache[cacheKey];
        }

        const detail = await gmail.users.messages.get({
          userId: "me",
          id: msg.id!,
          format: "full",
        });
        
        const headers = detail.data.payload?.headers || [];
        const subject = headers.find((h) => h.name === "Subject")?.value || "(No Subject)";
        const from = headers.find((h) => h.name === "From")?.value || "Unknown";
        const date = headers.find((h) => h.name === "Date")?.value || "";
        
        let snippet = detail.data.snippet || "";
        
        const parsedMsg = {
          id: msg.id,
          subject,
          from,
          date,
          snippet,
          fullData: detail.data
        };
        messagesCache[cacheKey] = parsedMsg;
        return parsedMsg;
      })
    );
    
    res.json({
      messages,
      nextPageToken: response.data.nextPageToken || null
    });
  } catch (error: any) {
    console.error("Gmail fetch error:", error);
    const errStr = (error?.message || "").toLowerCase();
    if (
      errStr.includes("invalid_grant") || 
      errStr.includes("invalid credentials") || 
      errStr.includes("invalid key") || 
      error?.code === 401 || 
      error?.status === 401
    ) {
      return res.status(401).json({ error: "No Gmail token found. Please reconnect Google account." });
    }
    res.status(500).json({ error: "Failed to fetch emails" });
  }
});


// In-memory analysis cache keyed by email identifier/hash
const emailAnalysisCache = new Map<string, { timestamp: string; result: any }>();

async function resolveTechnicalData(headersStr: string, bodyStr: string = "", senderEmailStr: string = "") {
  const verified: any = {
    spf: "NOT VERIFIED",
    dkim: "NOT VERIFIED",
    dmarc: "NOT VERIFIED",
    arc: "NOT VERIFIED",
    ip: "NOT VERIFIED",
    country: "NOT VERIFIED",
    city: "NOT VERIFIED",
    isp: "NOT VERIFIED",
    asn: "NOT VERIFIED",
    hosting_provider: "NOT VERIFIED",
    vpn_detected: false,
    proxy_detected: false,
    return_path: "NOT VERIFIED",
    reply_to: "NOT VERIFIED",
    message_id: "NOT VERIFIED",
    sender_domain: "NOT VERIFIED",
    dkim_domain: "NOT VERIFIED",
    domain_alignment: "NOT VERIFIED",
    reply_to_mismatch: false,
    attachments_found: [] as string[],
    links_found: [] as Array<{ url: string; domain: string; is_shortener: boolean; is_ip_host: boolean; is_lookalike: boolean }>
  };

  // 1. Extract sender domain
  if (senderEmailStr) {
    const sDomain = senderEmailStr.split("@")[1]?.toLowerCase().trim();
    if (sDomain) verified.sender_domain = sDomain;
  }

  // 2. Parse headers if present (handles both raw RFC headers and JSON-stringified Gmail header arrays)
  if (headersStr) {
    let normalizedHeaders = headersStr;
    try {
      const trimmed = headersStr.trim();
      if (trimmed.startsWith("[")) {
        const parsedHeaders = JSON.parse(trimmed);
        if (Array.isArray(parsedHeaders)) {
          normalizedHeaders = parsedHeaders
            .filter((h: any) => h && typeof h.name === "string" && typeof h.value === "string")
            .map((h: any) => `${h.name}: ${h.value}`)
            .join("\n");
        }
      }
    } catch {}

    const spfMatch =
      normalizedHeaders.match(/(?:^|[\s;:])spf=(pass|fail|softfail|neutral|none)/i) ||
      normalizedHeaders.match(/^Received-SPF:\s*(pass|fail|softfail|neutral|none)/im);
    if (spfMatch) verified.spf = spfMatch[1].toUpperCase();

    const dkimMatch = normalizedHeaders.match(/(?:^|[\s;:])dkim=(pass|fail|neutral|none|temperror|permerror)/i);
    if (dkimMatch) verified.dkim = dkimMatch[1].toUpperCase();

    const dmarcMatch = normalizedHeaders.match(/(?:^|[\s;:])dmarc=(pass|fail|neutral|none|bestguesspass)/i);
    if (dmarcMatch) verified.dmarc = dmarcMatch[1].toUpperCase();

    const arcMatch = normalizedHeaders.match(/(?:^|[\s;:])arc=(pass|fail|none)/i);
    if (arcMatch) verified.arc = arcMatch[1].toUpperCase();

    const returnPathMatch = normalizedHeaders.match(/^return-path:\s*<?([^>\r\n]+)>?/im);
    if (returnPathMatch) verified.return_path = returnPathMatch[1].trim();

    const replyToMatch = normalizedHeaders.match(/^reply-to:\s*<?([^>\r\n]+)>?/im);
    if (replyToMatch) {
      verified.reply_to = replyToMatch[1].trim();
      const rtEmailMatch = verified.reply_to.match(/([a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,})/);
      const rtAddr = rtEmailMatch ? rtEmailMatch[1] : verified.reply_to;
      const rtDomain = rtAddr.split("@")[1]?.toLowerCase().trim();
      if (verified.sender_domain !== "NOT VERIFIED" && rtDomain && rtDomain !== verified.sender_domain) {
        verified.reply_to_mismatch = true;
      }
    }

    const msgIdMatch = normalizedHeaders.match(/^message-id:\s*<?([^>\r\n]+)>?/im);
    if (msgIdMatch) verified.message_id = msgIdMatch[1].trim();

    const dkimDomainMatch =
      normalizedHeaders.match(/header\.i=@([^\s;]+)/i) ||
      normalizedHeaders.match(/header\.d=([a-zA-Z0-9.\-_]+)/i) ||
      normalizedHeaders.match(/\bd=([a-zA-Z0-9.\-_]+)/i);
    if (dkimDomainMatch) {
      verified.dkim_domain = dkimDomainMatch[1].toLowerCase().trim();
    }

    // Check domain alignment
    if (verified.sender_domain !== "NOT VERIFIED" && verified.dkim_domain !== "NOT VERIFIED") {
      verified.domain_alignment =
        verified.sender_domain === verified.dkim_domain ||
        verified.sender_domain.endsWith("." + verified.dkim_domain) ||
        verified.dkim_domain.endsWith("." + verified.sender_domain);
    }

    // Check attachments
    const attachmentMatches = normalizedHeaders.match(/filename="?([^"\r\n]+)"?/gi);
    if (attachmentMatches) {
      verified.attachments_found = attachmentMatches.map((m) =>
        m.replace(/filename="?/i, "").replace(/"$/, "").trim()
      );
    }

    // Extract IP from Authentication-Results or Received headers
    const ipMatch =
      normalizedHeaders.match(/client-ip=([0-9]{1,3}\.[0-9]{1,3}\.[0-9]{1,3}\.[0-9]{1,3})/i) ||
      normalizedHeaders.match(/designates\s+([0-9]{1,3}\.[0-9]{1,3}\.[0-9]{1,3}\.[0-9]{1,3})/i) ||
      normalizedHeaders.match(/sender IP is ([0-9]{1,3}\.[0-9]{1,3}\.[0-9]{1,3}\.[0-9]{1,3})/i) ||
      normalizedHeaders.match(/Received:\s*from [^\r\n]*\[([0-9]{1,3}\.[0-9]{1,3}\.[0-9]{1,3}\.[0-9]{1,3})\]/i) ||
      normalizedHeaders.match(/\[([0-9]{1,3}\.[0-9]{1,3}\.[0-9]{1,3}\.[0-9]{1,3})\]/);

    if (ipMatch) {
      const candidateIp = ipMatch[1];
      // Exclude private/loopback IP ranges
      if (
        !candidateIp.startsWith("127.") &&
        !candidateIp.startsWith("10.") &&
        !candidateIp.startsWith("192.168.")
      ) {
        verified.ip = candidateIp;
        try {
          const controller = new AbortController();
          const timeoutId = setTimeout(() => controller.abort(), 1800);
          const geoRes = await fetch(
            `http://ip-api.com/json/${verified.ip}?fields=status,country,city,isp,as,hosting,proxy`,
            { signal: controller.signal }
          );
          clearTimeout(timeoutId);
          if (geoRes.ok) {
            const geoData = await geoRes.json();
            if (geoData.status === "success") {
              verified.country = geoData.country || "NOT VERIFIED";
              verified.city = geoData.city || "NOT VERIFIED";
              verified.isp = geoData.isp || "NOT VERIFIED";
              verified.asn = geoData.as || "NOT VERIFIED";
              verified.hosting_provider = geoData.hosting ? "Hosting/Datacenter" : "NOT VERIFIED";
              verified.vpn_detected = !!geoData.proxy;
              verified.proxy_detected = !!geoData.proxy;
            }
          }
        } catch (e) {
          // Timeout or abort, ignore gracefully
        }
      }
    }
  }

  // 3. Extract and inspect embedded URLs strictly from message body
  const rawUrls = Array.from(
    new Set(
      (bodyStr.match(/https?:\/\/[^\s"'<>]+/gi) || [])
        .map((u) => u.replace(/[.,;)\]"'>]+$/, ""))
        .filter(Boolean)
    )
  ).slice(0, 15);
  const shorteners = ["bit.ly", "tinyurl.com", "t.co", "is.gd", "buff.ly", "ow.ly", "cutt.ly", "shorturl.at"];
  const lookalikes = ["paypa1", "micros0ft", "amaz0n", "app1e", "g00gle", "sec-chase", "netflix-verify", "bankofamer1ca", "wellsfarg0"];

  for (const u of rawUrls) {
    try {
      const parsed = new URL(u);
      const host = parsed.hostname.toLowerCase();
      const isShort = shorteners.some((s) => host.includes(s));
      const isIp = /^[0-9]{1,3}\.[0-9]{1,3}\.[0-9]{1,3}\.[0-9]{1,3}$/.test(host);
      const isLook = lookalikes.some((l) => host.includes(l));
      verified.links_found.push({
        url: u,
        domain: host,
        is_shortener: isShort,
        is_ip_host: isIp,
        is_lookalike: isLook,
      });
    } catch (e) {}
  }

  return verified;
}

// Consistent Rule-Based Scoring Methodology
function calculateRiskScore(tech: any, socialSignals: any) {
  let score = 10; // Baseline neutral score
  const rulesApplied: string[] = [];

  // Technical deductions
  if (tech.spf === "FAIL") { score += 20; rulesApplied.push("SPF authentication failed (+20)"); }
  else if (tech.spf === "SOFTFAIL") { score += 10; rulesApplied.push("SPF authentication softfail (+10)"); }
  else if (tech.spf === "PASS") { score -= 10; rulesApplied.push("SPF authentication passed (-10)"); }

  if (tech.dkim === "FAIL") { score += 20; rulesApplied.push("DKIM cryptographic signature failed (+20)"); }
  else if (tech.dkim === "PASS") { score -= 10; rulesApplied.push("DKIM signature valid and verified (-10)"); }

  if (tech.dmarc === "FAIL") { score += 25; rulesApplied.push("DMARC policy check failed (+25)"); }
  else if (tech.dmarc === "PASS") { score -= 10; rulesApplied.push("DMARC alignment verified (-10)"); }

  if (tech.domain_alignment === false) { score += 20; rulesApplied.push("Domain alignment mismatch between From header and mail server (+20)"); }
  else if (tech.domain_alignment === true) { score -= 10; rulesApplied.push("Domain alignment verified (-10)"); }

  if (tech.reply_to_mismatch) { score += 15; rulesApplied.push("Reply-To address domain differs from sender address domain (+15)"); }

  // Links & Attachments
  if (tech.links_found?.some((l: any) => l.is_ip_host)) { score += 25; rulesApplied.push("Direct IP address embedded in message link (+25)"); }
  if (tech.links_found?.some((l: any) => l.is_lookalike)) { score += 30; rulesApplied.push("Known look-alike / typo-squatted domain detected in link (+30)"); }
  if (tech.links_found?.some((l: any) => l.is_shortener)) { score += 15; rulesApplied.push("URL shortener masking true destination (+15)"); }

  const dangerousExts = [".exe", ".scr", ".vbs", ".bat", ".iso", ".html", ".js"];
  if (tech.attachments_found?.some((f: string) => dangerousExts.some(ext => f.toLowerCase().endsWith(ext)))) {
    score += 35;
    rulesApplied.push("Executable or high-risk attachment file type detected (+35)");
  }

  // Content & Social Engineering Signals (from deep analysis)
  if (socialSignals?.urgency_tactics) { score += 20; rulesApplied.push("Artificial urgency / account suspension deadline (+20)"); }
  if (socialSignals?.credential_theft_attempt) { score += 25; rulesApplied.push("Credential harvesting / account verification prompt (+25)"); }
  if (socialSignals?.payment_fraud_attempt || socialSignals?.invoice_scam) { score += 25; rulesApplied.push("Payment, invoice, or wire fraud pressure (+25)"); }
  if (socialSignals?.brand_impersonation || socialSignals?.authority_impersonation) { score += 25; rulesApplied.push("Brand or executive authority impersonation (+25)"); }
  if (socialSignals?.fear_tactics) { score += 20; rulesApplied.push("Fear / legal intimidation tactics (+20)"); }

  const clampedScore = Math.max(0, Math.min(100, score));

  let classification: "Phishing" | "Likely Phishing" | "Suspicious" | "Likely Safe" | "Safe";
  let severity: "Low" | "Medium" | "High" | "Critical";

  if (clampedScore >= 80) {
    classification = "Phishing";
    severity = "Critical";
  } else if (clampedScore >= 60) {
    classification = "Likely Phishing";
    severity = "High";
  } else if (clampedScore >= 40) {
    classification = "Suspicious";
    severity = "Medium";
  } else if (clampedScore >= 20) {
    classification = "Likely Safe";
    severity = "Low";
  } else {
    classification = "Safe";
    severity = "Low";
  }

  return {
    score: clampedScore,
    classification,
    severity,
    rulesApplied
  };
}

function extractReadableAiError(err: any): string {
  const raw = err?.message || String(err || "Unknown AI error");
  try {
    const parsed = JSON.parse(raw);
    if (parsed?.error?.message) return parsed.error.message;
  } catch {}
  return raw;
}

async function generateWithFallback(
  prompt: string,
  options: { systemInstruction?: string; responseMimeType?: string } = {}
) {
  const ai = getAiClient();
  const candidates: Array<{ model: string; config: any; timeoutMs: number; attempts: number }> = [
    {
      model: "gemini-4-hydrogen",
      timeoutMs: 12000,
      attempts: 1,
      config: {
        ...(options.systemInstruction ? { systemInstruction: options.systemInstruction } : {}),
        ...(options.responseMimeType ? { responseMimeType: options.responseMimeType } : {}),
        thinkingConfig: { thinkingLevel: ThinkingLevel.LOW },
      },
    },
    {
      model: "gemini-3.1-flash-lite",
      timeoutMs: 12000,
      attempts: 2,
      config: {
        ...(options.systemInstruction ? { systemInstruction: options.systemInstruction } : {}),
        ...(options.responseMimeType ? { responseMimeType: options.responseMimeType } : {}),
      },
    },
  ];

  let lastError: any = null;
  for (const candidate of candidates) {
    for (let attempt = 1; attempt <= candidate.attempts; attempt++) {
      try {
        const response = await Promise.race([
          ai.models.generateContent({
            model: candidate.model,
            contents: [{ parts: [{ text: prompt }] }],
            config: candidate.config,
          }),
          new Promise<never>((_, reject) =>
            setTimeout(() => reject(new Error(`${candidate.model} request timed out`)), candidate.timeoutMs)
          ),
        ]);
        const text = (response.text || "").trim();
        if (!text) {
          throw new Error(`Empty output returned by ${candidate.model}`);
        }
        return text;
      } catch (err: any) {
        lastError = err;
        console.warn(`Model ${candidate.model} attempt ${attempt} failed:`, extractReadableAiError(err).slice(0, 180));
        if (attempt < candidate.attempts) {
          await new Promise((resolve) => setTimeout(resolve, 1200));
        }
      }
    }
  }
  throw new Error(extractReadableAiError(lastError));
}

async function analyzeEmailHelper(data: any, mode: string, uid: string) {
  if (!process.env.GEMINI_API_KEY) {
    if (mode === "INBOX_SCAN") {
      return runInboxScan(Array.isArray(data) ? data : [data]);
    }
    if (mode === "REALTIME_ALERT") {
      return runRealtimeAlert(Array.isArray(data) ? data[0] : data);
    }
    return runForensicAnalysis(Array.isArray(data) ? data[0] : data);
  }

  if (mode === "INBOX_SCAN") {
    const emailList = Array.isArray(data) ? data : [data];
    const prompt = `MODE: INBOX_SCAN
INPUT: A list of emails.
TASK: For EACH email return: classification (Safe, Likely Safe, Suspicious, Likely Phishing, Phishing), risk_score (0–100), severity (Low, Medium, High, Critical), short_reason (max 15 words explaining the specific finding).
OUTPUT FORMAT: JSON array of objects with keys: subject, sender, classification, risk_score, severity, short_reason.
EMAILS: ${JSON.stringify(emailList.map(e => ({ subject: e.subject, sender_name: e.senderName, sender_email: e.senderEmail, snippet: (e.body || e.snippet || "").substring(0, 300) })))}`;

    const text = await generateWithFallback(prompt, { responseMimeType: "application/json" });
    return JSON.parse(text.replace(/^\s*```json/m, "").replace(/```\s*$/m, ""));
  }

  if (mode === "REALTIME_ALERT") {
    const singleData = Array.isArray(data) ? data[0] : data;
    const prompt = `MODE: REALTIME_ALERT
INPUT: subject: "${singleData.subject}", sender: "${singleData.senderEmail}", snippet: "${(singleData.body || singleData.snippet || "").substring(0, 250)}"
TASK: Return alert_type (Safe, Warning, Danger), message (max 20 words referencing actual sender/subject), action_hint (max 10 words).
OUTPUT: JSON object with keys: alert_type, message, action_hint.`;

    const text = await generateWithFallback(prompt, { responseMimeType: "application/json" });
    return JSON.parse(text.replace(/^\s*```json/m, "").replace(/```\s*$/m, ""));
  }

  // SINGLE_EMAIL_VIEW
  const singleData = Array.isArray(data) ? data[0] : data;
  const cacheKey = crypto
    .createHash("sha256")
    .update(
      JSON.stringify({
        id: singleData.id || "",
        senderName: singleData.senderName || "",
        senderEmail: singleData.senderEmail || "",
        subject: singleData.subject || "",
        body: singleData.body || "",
        headers: singleData.headers || "",
      })
    )
    .digest("hex");

  if (emailAnalysisCache.has(cacheKey)) {
    return emailAnalysisCache.get(cacheKey)!.result;
  }

  const technicalData = await resolveTechnicalData(singleData.headers || "", singleData.body || "", singleData.senderEmail || "");

  const prompt = `You are Mail Verifier AI, an elite cybersecurity and email threat forensic engine.
Analyze ONLY this SPECIFIC individual email thoroughly and independently based strictly on the provided evidence.

EVIDENCE PROVIDED:
- Subject: ${JSON.stringify(singleData.subject)}
- Sender Display Name: ${JSON.stringify(singleData.senderName)}
- Sender Actual Email: ${JSON.stringify(singleData.senderEmail)}
- Reply-To: ${JSON.stringify(singleData.replyTo || technicalData.reply_to || "NOT VERIFIED")}
- Return-Path: ${JSON.stringify(technicalData.return_path)}
- Verified Technical Status: ${JSON.stringify(technicalData)}
- Full Email Body:
${singleData.body}

STRICT EVIDENCE-BASED AUDIT RULES:
1. Every statement, red flag, trust signal, and conclusion MUST be strictly derived from the exact details, sender address, headers, links, or text phrases present in THIS email. Never fabricate or assume facts not present in the evidence above.
2. In 'red_flags', provide ONLY red flags actually supported by the email text or verified technical headers. Each red flag MUST quote exact verbatim text from the email or exact field from Verified Technical Status.
3. In 'trust_signals', state ONLY legitimate trust signals explicitly observed in this email (e.g., valid SPF/DKIM/DMARC from Verified Technical Status, aligned domain, absence of pressure links).
4. In 'domain_and_links.links_analyzed', include ONLY the actual URLs present in this email (see 'links_found' in Verified Technical Status). Do NOT invent any links.
5. In 'missing_information', explicitly list technical checks that were NOT available or showed "NOT VERIFIED" in this email (e.g., unverified SPF/DKIM/DMARC if headers were missing, unavailable WHOIS domain age, no live malware sandbox).
6. In 'summary_markdown', produce a detailed, structured Markdown report citing ONLY facts from this email:
   - ### Forensic Overview (exact sender, domain, subject, and message intent from the body)
   - ### Specific Red Flags & Detected Threat Patterns (quote exact sentences or links from the body; or explicitly state none were found if clean)
   - ### Legitimate Signals & Technical Verification (exact SPF/DKIM/DMARC/alignment values from Verified Technical Status)
   - ### Missing & Inconclusive Information (what was not verified)
   - ### Recommended Actions (concrete security advice tailored to this specific message)
7. Analyze social engineering tactics strictly from the email text and quote exact phrases in 'quoted_phrases'.
8. Return ONLY a valid JSON object matching the requested schema. No surrounding markdown code blocks.

EXPECTED JSON SCHEMA:
{
  "red_flags": [
    {
      "flag": "string",
      "evidence": "string (quote from email body, header, or domain)",
      "why_it_matters": "string",
      "severity": "Low" | "Medium" | "High" | "Critical"
    }
  ],
  "trust_signals": [
    {
      "signal": "string",
      "evidence": "string"
    }
  ],
  "sender_identity": {
    "claimed_name": "string",
    "actual_email": "string",
    "domain": "string",
    "name_email_mismatch": boolean,
    "brand_impersonation": boolean,
    "impersonated_brand": "string or null",
    "explanation": "string"
  },
  "domain_and_links": {
    "suspicious_links_detected": boolean,
    "links_analyzed": [
      {
        "url": "string",
        "domain": "string",
        "risk": "Safe" | "Suspicious" | "Malicious",
        "note": "string"
      }
    ],
    "homograph_or_lookalike": boolean,
    "shorteners_used": boolean,
    "explanation": "string"
  },
  "authentication_results": {
    "spf": "string (use verified value)",
    "dkim": "string (use verified value)",
    "dmarc": "string (use verified value)",
    "arc": "string",
    "domain_alignment": boolean | "NOT VERIFIED",
    "explanation": "string"
  },
  "social_engineering": {
    "urgency_tactics": boolean,
    "fear_tactics": boolean,
    "authority_impersonation": boolean,
    "credential_theft_attempt": boolean,
    "payment_fraud_attempt": boolean,
    "invoice_scam": boolean,
    "bec_detected": boolean,
    "quoted_phrases": ["string"],
    "explanation": "string"
  },
  "recommended_action": "string",
  "missing_information": ["string"],
  "summary_markdown": "string"
}`;

  const rawAiText = await generateWithFallback(prompt, {
    systemInstruction: SYSTEM_INSTRUCTION,
    responseMimeType: "application/json",
  });
  const parsedAiResult: any = JSON.parse(
    rawAiText.replace(/^\s*```json/m, "").replace(/```\s*$/m, "")
  );

  // Calculate deterministic score based strictly on parsed technical evidence + AI-verified message signals
  const scoreData = calculateRiskScore(technicalData, {
    ...(parsedAiResult.social_engineering || {}),
    brand_impersonation: Boolean(parsedAiResult.sender_identity?.brand_impersonation),
  });

  // Confidence calculation
  let confidenceLevel: "High" | "Medium" | "Low" = "High";
  let confidenceExplanation = "High confidence: cryptographic authentication headers, sender domain records, and full email body were analyzed.";
  if (!singleData.headers || technicalData.spf === "NOT VERIFIED") {
    confidenceLevel = "Medium";
    confidenceExplanation = "Medium confidence: raw transport headers were partially available or synthesized; risk score is weighted heavily on body content and domain structure.";
  }
  if (!singleData.body || singleData.body.length < 50) {
    confidenceLevel = "Low";
    confidenceExplanation = "Low confidence: message body is truncated or minimal, limiting semantic social engineering detection.";
  }

  // Assemble comprehensive final report
  const finalResult: any = {
    classification: scoreData.classification,
    risk_score: scoreData.score,
    severity: scoreData.severity,
    confidence_level: confidenceLevel,
    confidence_explanation: confidenceExplanation,
    scoring_breakdown: {
      final_score: scoreData.score,
      rules_applied: scoreData.rulesApplied
    },
    red_flags: parsedAiResult.red_flags || [],
    trust_signals: parsedAiResult.trust_signals || [],
    sender_identity_assessment: parsedAiResult.sender_identity || {
      claimed_name: singleData.senderName,
      actual_email: singleData.senderEmail,
      domain: technicalData.sender_domain,
      name_email_mismatch: technicalData.reply_to_mismatch,
      brand_impersonation: false,
      explanation: `Sender is ${singleData.senderEmail}.`
    },
    domain_and_link_assessment: parsedAiResult.domain_and_links || {
      suspicious_links_detected: technicalData.links_found.some((l: any) => l.is_shortener || l.is_lookalike || l.is_ip_host),
      links_analyzed: technicalData.links_found,
      homograph_or_lookalike: technicalData.links_found.some((l: any) => l.is_lookalike),
      shorteners_used: technicalData.links_found.some((l: any) => l.is_shortener),
      explanation: `${technicalData.links_found.length} link(s) found.`
    },
    authentication_results: {
      spf_record: technicalData.spf,
      dkim_signature: technicalData.dkim,
      dmarc_policy: technicalData.dmarc,
      arc_result: technicalData.arc,
      domain_alignment: technicalData.domain_alignment,
      explanation: parsedAiResult.authentication_results?.explanation || `SPF: ${technicalData.spf}, DKIM: ${technicalData.dkim}, DMARC: ${technicalData.dmarc}.`
    },
    social_engineering_tactics: parsedAiResult.social_engineering || {
      urgency_tactics: false,
      fear_tactics: false,
      credential_theft_attempt: false,
      payment_fraud_attempt: false,
      invoice_scam: false,
      quoted_phrases: [],
      explanation: "No overt social engineering indicators detected."
    },
    metadata_and_network_intelligence: {
      ip_address: technicalData.ip,
      country: technicalData.country,
      city: technicalData.city,
      isp: technicalData.isp,
      asn: technicalData.asn,
      hosting_provider: technicalData.hosting_provider,
      vpn_detected: technicalData.vpn_detected ? "DETECTED" : "CLEAN",
      proxy_detected: technicalData.proxy_detected ? "DETECTED" : "CLEAN",
      return_path: technicalData.return_path,
      reply_to: technicalData.reply_to
    },
    recommended_action: parsedAiResult.recommended_action || "Treat this message with standard caution. Never enter sensitive passwords on untrusted third-party sites.",
    missing_information: parsedAiResult.missing_information || [
      "WHOIS registration date of sender domain was not retrieved via external API",
      "No real-time antivirus file detonation performed on attachments"
    ],
    summary_markdown: parsedAiResult.summary_markdown || `### Analysis for ${singleData.subject}\n\nClassification: **${scoreData.classification}** (Risk Score: ${scoreData.score}/100).\n\nSender: \`${singleData.senderEmail}\`.\n\nVerified authentication: SPF: **${technicalData.spf}**, DKIM: **${technicalData.dkim}**, DMARC: **${technicalData.dmarc}**.`,

    // Backward-compatibility adapters for legacy UI blocks
    ai_risk_engine: {
      final_risk_classification: scoreData.classification,
      threat_score: scoreData.score,
      trust_score: Math.max(0, 100 - scoreData.score),
      severity_score: scoreData.score,
      likelihood_score: scoreData.score,
      confidence_score: confidenceLevel === "High" ? 95 : confidenceLevel === "Medium" ? 70 : 45
    },
    sender_identity_analysis: {
      display_name: singleData.senderName,
      actual_email: singleData.senderEmail,
      sender_trust_score: Math.max(0, 100 - scoreData.score),
      name_domain_mismatch: technicalData.reply_to_mismatch,
      executive_impersonation: parsedAiResult.social_engineering?.authority_impersonation || false,
      brand_impersonation: parsedAiResult.sender_identity?.brand_impersonation || false,
      spoofing_detected: technicalData.spf === "FAIL" || technicalData.dkim === "FAIL" || technicalData.domain_alignment === false
    },
    authentication_analysis: {
      spf_validation: technicalData.spf,
      dkim_validation: technicalData.dkim,
      dmarc_validation: technicalData.dmarc,
      domain_alignment: technicalData.domain_alignment
    },
    location_intelligence: {
      ip_address: technicalData.ip,
      country: technicalData.country,
      city: technicalData.city,
      isp: technicalData.isp,
      vpn_detected: technicalData.vpn_detected,
      proxy_detected: technicalData.proxy_detected
    },
    social_engineering_detection: {
      urgency_tactics: parsedAiResult.social_engineering?.urgency_tactics || false,
      fear_tactics: parsedAiResult.social_engineering?.fear_tactics || false,
      credential_theft_attempt: parsedAiResult.social_engineering?.credential_theft_attempt || false,
      payment_fraud_attempt: parsedAiResult.social_engineering?.payment_fraud_attempt || false,
      invoice_scam: parsedAiResult.social_engineering?.invoice_scam || false
    },
    threat_intelligence: {
      phishing_domain_match: parsedAiResult.domain_and_links?.homograph_or_lookalike || false,
      malware_hosting_match: technicalData.attachments_found?.length > 0
    },
    email_metadata_analysis: {
      headers_present: !!singleData.headers,
      sender_metadata_extracted: true,
      message_id: technicalData.message_id,
      return_path: technicalData.return_path,
      reply_to: technicalData.reply_to,
      sender_domain: technicalData.sender_domain
    }
  };

  // Cache final result
  emailAnalysisCache.set(cacheKey, {
    timestamp: new Date().toISOString(),
    result: finalResult
  });

  return finalResult;
}

app.post("/api/analyze", async (req, res) => {
  const uid = req.session?.userId || req.headers['x-firebase-uid'] as string;
  if (!uid) return res.status(401).json({ error: "Unauthorized" });

  const { data, mode } = req.body;
  if (!data || !mode) return res.status(400).json({ error: "Missing data or mode" });

  try {
    const result = await analyzeEmailHelper(data, mode, uid);
    res.json({ result });
  } catch (e: any) {
    console.error("AI Analysis error:", e);
    res.status(500).json({ error: "AI Analysis failed: " + (e.message || "Unknown error") });
  }
});


app.post("/api/chat-message", async (req, res) => {
  const uid = req.session?.userId || req.headers['x-firebase-uid'] as string;
  if (!uid) return res.status(401).json({ error: "Unauthorized" });

  const { messageContext, history, question } = req.body;
  if (!question || !messageContext) {
    return res.status(400).json({ error: "Missing required fields" });
  }

  const historyText = (history || [])
    .map((h: any) => `${h.role === "user" ? "User" : "Mail Verifier AI"}: ${h.text}`)
    .join("\n\n");

  const prompt = `
YOU MUST ANSWER THE QUESTION FACTUALLY AND SECURELY BASED STRIDTLY AND SOLELY ON THIS EMAIL DETAILS AND VALUE PARSING.

EMAIL DETAILS:
- Subject: ${messageContext.subject}
- Sender Name: ${messageContext.senderName || "Unknown"}
- Sender Email: ${messageContext.senderEmail || "Unknown"}
- Body: 
${messageContext.body}

GLOBAL NO-EMOJI RULES AND CHAT BOUNDARIES:
1. NO EMOJIS: Do NOT use any emojis of any format. No star, checkmark, warnings or smiles.
2. STRICTLY FACTUAL: Base your analysis and responses strictly on the details, links, or headers contained in the email. Avoid hallucinations.
3. IN-SCOPE REMINDERS: If the user asks a question unrelated to this email or phishing/safety topics pertaining to it, politely remind them that you are locked into this specific email's secure scope.

CONVERSATION HISTORY:
${historyText || "No prior history"}

NEW USER QUESTION: ${question}
  `;

  try {
    if (!process.env.GEMINI_API_KEY) {
      const responseText = await answerEmailChatQuery(messageContext, history || [], question);
      return res.json({ text: responseText });
    }
    const responseText = await generateWithFallback(prompt, {
      systemInstruction: "You are the Mail Verifier AI Q&A Assistant. You answer questions strictly, safely, and factually regarding the selected email.",
    });
    res.json({ text: responseText });
  } catch (error: any) {
    console.error("Chat message error:", error);
    res.status(500).json({ error: error.message || "Failed to process chat query" });
  }
});

export default app;
