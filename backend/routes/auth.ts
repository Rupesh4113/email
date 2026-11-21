import { Router, Request, Response } from "express";
import bcrypt from "bcryptjs";
import crypto from "node:crypto";
import { sqliteDb, SUPER_ADMIN_EMAIL } from "../db/sqlite.js";

const router = Router();

export function getAuthUserId(req: Request): string | null {
  if (req.session && req.session.userId) {
    return req.session.userId;
  }
  const headerUid = req.headers["x-firebase-uid"];
  if (typeof headerUid === "string" && headerUid.trim()) {
    return headerUid.trim();
  }
  return null;
}

export function isAdmin(user: any): boolean {
  return Boolean(
    user?.isAdmin ||
    user?.isSuperAdmin ||
    user?.email?.toLowerCase().trim() === SUPER_ADMIN_EMAIL
  );
}

// POST /api/auth/register
router.post("/register", async (req: Request, res: Response): Promise<void> => {
  const { email, password, name } = req.body;
  if (!email || !password || !name) {
    res.status(400).json({ error: "Name, email, and password are required" });
    return;
  }

  const cleanEmail = email.toLowerCase().trim();
  const existing = sqliteDb.getUserByEmail(cleanEmail);
  if (existing) {
    res.status(400).json({ error: "An account with this email already exists" });
    return;
  }

  try {
    const salt = await bcrypt.genSalt(10);
    const passwordHash = await bcrypt.hash(password, salt);
    const newUser = sqliteDb.createUser(cleanEmail, passwordHash, name);

    // Generate email verification token
    const verificationToken = crypto.randomBytes(32).toString("hex");
    sqliteDb.updateUser(newUser.id, { verificationToken });

    if (req.session) {
      req.session.userId = newUser.id;
    }

    const { passwordHash: _, ...safeUser } = newUser;
    res.status(201).json({
      message: "Registration successful",
      user: safeUser,
      verificationToken,
    });
  } catch (err: any) {
    res.status(500).json({ error: "Failed to create account: " + err.message });
  }
});

// POST /api/auth/login
router.post("/login", async (req: Request, res: Response): Promise<void> => {
  const { email, password } = req.body;
  if (!email || !password) {
    res.status(400).json({ error: "Email and password are required" });
    return;
  }

  const cleanEmail = email.toLowerCase().trim();
  const user = sqliteDb.getUserByEmail(cleanEmail);

  if (!user) {
    res.status(401).json({ error: "Invalid email or password" });
    return;
  }

  // Account lockout protection
  if (user.lockedUntil && new Date(user.lockedUntil).getTime() > Date.now()) {
    const minutesLeft = Math.ceil((new Date(user.lockedUntil).getTime() - Date.now()) / 60000);
    res.status(423).json({
      error: `Account temporarily locked due to excessive failed attempts. Please retry in ${minutesLeft} minute(s).`,
    });
    return;
  }

  const isMatch = await bcrypt.compare(password, user.passwordHash);
  if (!isMatch) {
    const failedAttempts = (user.failedLoginAttempts || 0) + 1;
    let lockedUntil = null;
    if (failedAttempts >= 5) {
      lockedUntil = new Date(Date.now() + 15 * 60 * 1000).toISOString();
    }
    sqliteDb.updateUser(user.id, {
      failedLoginAttempts: failedAttempts,
      lockedUntil,
    });

    res.status(401).json({ error: "Invalid email or password" });
    return;
  }

  // Reset failed attempts on success
  sqliteDb.updateUser(user.id, {
    failedLoginAttempts: 0,
    lockedUntil: null,
  });

  if (req.session) {
    req.session.userId = user.id;
  }

  const { passwordHash: _, ...safeUser } = user;
  res.json({ message: "Login successful", user: safeUser });
});

// POST /api/auth/logout
router.post("/logout", (req: Request, res: Response) => {
  if (req.session) {
    req.session = null;
  }
  res.json({ message: "Logged out successfully" });
});

// GET /api/auth/me
router.get("/me", (req: Request, res: Response): void => {
  const uid = getAuthUserId(req);
  if (!uid) {
    res.status(401).json({ error: "Not authenticated" });
    return;
  }

  const user = sqliteDb.getUserById(uid);
  if (!user) {
    res.status(401).json({ error: "User not found" });
    return;
  }

  const { passwordHash: _, ...safeUser } = user;
  res.json({ user: safeUser });
});

// GET /api/auth/verify
router.get("/verify", (req: Request, res: Response): void => {
  const token = req.query.token as string;
  if (!token) {
    res.status(400).json({ error: "Verification token is required" });
    return;
  }

  const users = sqliteDb.getAllUsers();
  const matched = users.find((u) => u.verificationToken === token);
  if (!matched) {
    res.status(400).json({ error: "Invalid or expired verification token" });
    return;
  }

  sqliteDb.updateUser(matched.id, {
    isVerified: true,
    verificationToken: undefined,
  });

  res.json({ message: "Email verified successfully" });
});

// POST /api/auth/subscription
router.post("/subscription", (req: Request, res: Response): void => {
  const uid = getAuthUserId(req);
  if (!uid) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }

  const { plan, usage, currentPeriodEnd, paymentMethod, invoice } = req.body;
  const updates: any = {};
  if (plan !== undefined) updates.plan = plan;
  if (usage !== undefined) updates.usage = usage;
  if (currentPeriodEnd !== undefined) updates.currentPeriodEnd = currentPeriodEnd;
  if (paymentMethod !== undefined) updates.paymentMethod = paymentMethod;

  const user = sqliteDb.getUserById(uid);
  if (!user) {
    res.status(404).json({ error: "User not found" });
    return;
  }

  if (invoice) {
    updates.invoices = [...(user.subscription.invoices || []), invoice];
  }

  const updated = sqliteDb.updateUserSubscription(uid, updates);
  if (!updated) {
    res.status(500).json({ error: "Failed to update subscription" });
    return;
  }

  const { passwordHash: _, ...safeUser } = updated;
  res.json({ message: "Subscription updated", user: safeUser });
});

export default router;
