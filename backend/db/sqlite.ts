import { DatabaseSync } from "node:sqlite";
import fs from "fs";
import path from "path";
import { User, Subscription, CommunityReport, ReportAppeal, AdminInvite } from "../types.js";

export const SUPER_ADMIN_EMAIL = "adamu0533@gmail.com";

const DATA_DIR = path.join(process.cwd(), "data");
if (!fs.existsSync(DATA_DIR)) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
}

const DB_FILE = path.join(DATA_DIR, "mailverifier.db");
let dbInstance: DatabaseSync | null = null;

export function getDatabase(): DatabaseSync {
  if (!dbInstance) {
    dbInstance = new DatabaseSync(DB_FILE);
    // Performance optimizations: WAL mode for fast concurrent operations, normal synchronous
    dbInstance.exec("PRAGMA journal_mode = WAL;");
    dbInstance.exec("PRAGMA synchronous = NORMAL;");
    dbInstance.exec("PRAGMA foreign_keys = ON;");
    initTables(dbInstance);
    migrateFromLegacyDbJson(dbInstance);
  }
  return dbInstance;
}

function initTables(db: DatabaseSync) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY,
      email TEXT UNIQUE NOT NULL,
      password_hash TEXT NOT NULL,
      name TEXT NOT NULL,
      plan TEXT DEFAULT 'free',
      usage INTEGER DEFAULT 0,
      payment_method TEXT DEFAULT 'None',
      current_period_end TEXT,
      trial_start_date TEXT,
      is_admin INTEGER DEFAULT 0,
      is_super_admin INTEGER DEFAULT 0,
      is_verified INTEGER DEFAULT 0,
      verification_token TEXT,
      failed_login_attempts INTEGER DEFAULT 0,
      locked_until TEXT,
      created_at TEXT NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);

    CREATE TABLE IF NOT EXISTS invoices (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      date TEXT NOT NULL,
      amount TEXT NOT NULL,
      status TEXT NOT NULL,
      FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS gmail_tokens (
      user_id TEXT PRIMARY KEY,
      access_token TEXT NOT NULL,
      refresh_token TEXT,
      expiry_date INTEGER,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS community_reports (
      id TEXT PRIMARY KEY,
      sender_display_name TEXT NOT NULL,
      sender_email TEXT NOT NULL,
      subject TEXT NOT NULL,
      recipient_email TEXT,
      date_received TEXT,
      email_provider TEXT,
      body_excerpt TEXT,
      suspicious_urls_json TEXT,
      headers TEXT,
      screenshot_url TEXT,
      reasons_json TEXT NOT NULL,
      user_notes TEXT,
      red_flags_json TEXT,
      target_brand TEXT,
      is_anonymous INTEGER DEFAULT 0,
      submitted_by_user_id TEXT,
      submitted_by_user_email TEXT,
      status TEXT DEFAULT 'pending_review',
      moderation_notes TEXT,
      reviewed_at TEXT,
      reviewed_by TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_reports_status ON community_reports(status);
    CREATE INDEX IF NOT EXISTS idx_reports_sender_email ON community_reports(sender_email);
    CREATE INDEX IF NOT EXISTS idx_reports_created_at ON community_reports(created_at);

    CREATE TABLE IF NOT EXISTS report_appeals (
      report_id TEXT PRIMARY KEY,
      appellant_name TEXT NOT NULL,
      appellant_email TEXT NOT NULL,
      appellant_role TEXT NOT NULL,
      reason TEXT NOT NULL,
      explanation TEXT NOT NULL,
      evidence_links TEXT,
      is_verified_sender_match INTEGER DEFAULT 0,
      status TEXT DEFAULT 'pending',
      submitted_at TEXT NOT NULL,
      reviewed_at TEXT,
      reviewed_by TEXT,
      review_notes TEXT,
      FOREIGN KEY(report_id) REFERENCES community_reports(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS admin_invites (
      email TEXT PRIMARY KEY,
      added_by TEXT NOT NULL,
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS analysis_cache (
      cache_key TEXT PRIMARY KEY,
      result_json TEXT NOT NULL,
      created_at TEXT NOT NULL
    );
  `);
}

function normalizeUserRoles(user: User): User {
  if (user.email && user.email.toLowerCase().trim() === SUPER_ADMIN_EMAIL) {
    return { ...user, isAdmin: true, isSuperAdmin: true };
  }
  return { ...user, isAdmin: Boolean(user.isAdmin), isSuperAdmin: Boolean(user.isSuperAdmin) };
}

function rowToUser(row: any, invoices: any[] = []): User {
  return normalizeUserRoles({
    id: row.id,
    email: row.email,
    passwordHash: row.password_hash,
    name: row.name,
    subscription: {
      plan: row.plan || "free",
      usage: row.usage || 0,
      paymentMethod: row.payment_method || "None",
      currentPeriodEnd: row.current_period_end || null,
      trialStartDate: row.trial_start_date || row.created_at,
      invoices: invoices.map((inv) => ({
        id: inv.id,
        date: inv.date,
        amount: inv.amount,
        status: inv.status as "paid" | "pending",
      })),
    },
    createdAt: row.created_at,
    isAdmin: Boolean(row.is_admin),
    isSuperAdmin: Boolean(row.is_super_admin),
    isVerified: Boolean(row.is_verified),
    verificationToken: row.verification_token || undefined,
    failedLoginAttempts: row.failed_login_attempts || 0,
    lockedUntil: row.locked_until || null,
  });
}

function rowToReport(row: any, appealRow?: any): CommunityReport {
  let reasons: string[] = [];
  let suspiciousUrls: string[] = [];
  let redFlagsObserved: string[] = [];

  try {
    if (row.reasons_json) reasons = JSON.parse(row.reasons_json);
  } catch {}
  try {
    if (row.suspicious_urls_json) suspiciousUrls = JSON.parse(row.suspicious_urls_json);
  } catch {}
  try {
    if (row.red_flags_json) redFlagsObserved = JSON.parse(row.red_flags_json);
  } catch {}

  const report: CommunityReport = {
    id: row.id,
    senderDisplayName: row.sender_display_name,
    senderEmail: row.sender_email,
    subject: row.subject,
    recipientEmail: row.recipient_email || undefined,
    dateReceived: row.date_received || undefined,
    emailProvider: row.email_provider || undefined,
    bodyExcerpt: row.body_excerpt || undefined,
    suspiciousUrls,
    headers: row.headers || undefined,
    screenshotUrl: row.screenshot_url || undefined,
    reasons,
    userNotes: row.user_notes || undefined,
    redFlagsObserved,
    targetBrand: row.target_brand || undefined,
    isAnonymous: Boolean(row.is_anonymous),
    submittedByUserId: row.submitted_by_user_id || undefined,
    submittedByUserEmail: row.submitted_by_user_email || undefined,
    status: row.status as "pending_review" | "approved" | "rejected",
    moderationNotes: row.moderation_notes || undefined,
    reviewedAt: row.reviewed_at || undefined,
    reviewedBy: row.reviewed_by || undefined,
    createdAt: row.created_at,
    updatedAt: row.updated_at || undefined,
    hasAppeal: Boolean(appealRow),
  };

  if (appealRow) {
    report.appeal = {
      appellantName: appealRow.appellant_name,
      appellantEmail: appealRow.appellant_email,
      appellantRole: appealRow.appellant_role,
      reason: appealRow.reason,
      explanation: appealRow.explanation,
      evidenceLinksOrText: appealRow.evidence_links || undefined,
      isVerifiedSenderMatch: Boolean(appealRow.is_verified_sender_match),
      status: appealRow.status as "pending" | "approved" | "rejected",
      submittedAt: appealRow.submitted_at,
      reviewedAt: appealRow.reviewed_at || undefined,
      reviewedBy: appealRow.reviewed_by || undefined,
      reviewNotes: appealRow.review_notes || undefined,
    };
  }

  return report;
}

export const sqliteDb = {
  getUserByEmail(email: string): User | null {
    const db = getDatabase();
    const normalized = email.toLowerCase().trim();
    const stmt = db.prepare("SELECT * FROM users WHERE LOWER(email) = ?");
    const row = stmt.get(normalized) as any;
    if (!row) return null;

    const invStmt = db.prepare("SELECT * FROM invoices WHERE user_id = ?");
    const invoices = invStmt.all(row.id) as any[];
    return rowToUser(row, invoices);
  },

  getUserById(id: string): User | null {
    const db = getDatabase();
    const stmt = db.prepare("SELECT * FROM users WHERE id = ?");
    const row = stmt.get(id) as any;
    if (!row) return null;

    const invStmt = db.prepare("SELECT * FROM invoices WHERE user_id = ?");
    const invoices = invStmt.all(id) as any[];
    return rowToUser(row, invoices);
  },

  createUser(email: string, passwordHash: string, name: string): User {
    const db = getDatabase();
    const id = "usr_" + Math.random().toString(36).substring(2, 11);
    const normalizedEmail = email.toLowerCase().trim();
    const isSuper = normalizedEmail === SUPER_ADMIN_EMAIL;

    // Check if user was pre-invited as admin
    const inviteCheck = db.prepare("SELECT * FROM admin_invites WHERE LOWER(email) = ?");
    const invite = inviteCheck.get(normalizedEmail) as any;
    const isInvitedAdmin = Boolean(invite);

    const now = new Date().toISOString();
    const isAdmin = isSuper || isInvitedAdmin;
    const isSuperAdmin = isSuper;

    const insertUser = db.prepare(`
      INSERT INTO users (
        id, email, password_hash, name, plan, usage, payment_method,
        current_period_end, trial_start_date, is_admin, is_super_admin,
        is_verified, failed_login_attempts, locked_until, created_at
      ) VALUES (?, ?, ?, ?, 'free', 0, 'None', NULL, ?, ?, ?, 0, 0, NULL, ?)
    `);

    insertUser.run(
      id,
      normalizedEmail,
      passwordHash,
      name.trim(),
      now,
      isAdmin ? 1 : 0,
      isSuperAdmin ? 1 : 0,
      now
    );

    if (isInvitedAdmin) {
      db.prepare("DELETE FROM admin_invites WHERE LOWER(email) = ?").run(normalizedEmail);
    }

    return {
      id,
      email: normalizedEmail,
      passwordHash,
      name: name.trim(),
      subscription: {
        plan: "free",
        usage: 0,
        paymentMethod: "None",
        currentPeriodEnd: null,
        trialStartDate: now,
        invoices: [],
      },
      createdAt: now,
      isAdmin,
      isSuperAdmin,
      isVerified: false,
      failedLoginAttempts: 0,
      lockedUntil: null,
    };
  },

  updateUser(id: string, updates: Partial<User>): User | null {
    const db = getDatabase();
    const existing = this.getUserById(id);
    if (!existing) return null;

    const fields: string[] = [];
    const values: any[] = [];

    if (updates.name !== undefined) {
      fields.push("name = ?");
      values.push(updates.name);
    }
    if (updates.passwordHash !== undefined) {
      fields.push("password_hash = ?");
      values.push(updates.passwordHash);
    }
    if (updates.isAdmin !== undefined) {
      fields.push("is_admin = ?");
      values.push(updates.isAdmin ? 1 : 0);
    }
    if (updates.isSuperAdmin !== undefined) {
      fields.push("is_super_admin = ?");
      values.push(updates.isSuperAdmin ? 1 : 0);
    }
    if (updates.isVerified !== undefined) {
      fields.push("is_verified = ?");
      values.push(updates.isVerified ? 1 : 0);
    }
    if (updates.verificationToken !== undefined) {
      fields.push("verification_token = ?");
      values.push(updates.verificationToken);
    }
    if (updates.failedLoginAttempts !== undefined) {
      fields.push("failed_login_attempts = ?");
      values.push(updates.failedLoginAttempts);
    }
    if (updates.lockedUntil !== undefined) {
      fields.push("locked_until = ?");
      values.push(updates.lockedUntil);
    }

    if (fields.length > 0) {
      values.push(id);
      db.prepare(`UPDATE users SET ${fields.join(", ")} WHERE id = ?`).run(...values);
    }

    if (updates.subscription) {
      this.updateUserSubscription(id, updates.subscription);
    }

    return this.getUserById(id);
  },

  updateUserSubscription(id: string, subscription: Partial<Subscription>): User | null {
    const db = getDatabase();
    const fields: string[] = [];
    const values: any[] = [];

    if (subscription.plan !== undefined) {
      fields.push("plan = ?");
      values.push(subscription.plan);
    }
    if (subscription.usage !== undefined) {
      fields.push("usage = ?");
      values.push(subscription.usage);
    }
    if (subscription.paymentMethod !== undefined) {
      fields.push("payment_method = ?");
      values.push(subscription.paymentMethod);
    }
    if (subscription.currentPeriodEnd !== undefined) {
      fields.push("current_period_end = ?");
      values.push(subscription.currentPeriodEnd);
    }
    if (subscription.trialStartDate !== undefined) {
      fields.push("trial_start_date = ?");
      values.push(subscription.trialStartDate);
    }

    if (fields.length > 0) {
      values.push(id);
      db.prepare(`UPDATE users SET ${fields.join(", ")} WHERE id = ?`).run(...values);
    }

    if (subscription.invoices && Array.isArray(subscription.invoices)) {
      for (const inv of subscription.invoices) {
        db.prepare(`
          INSERT INTO invoices (id, user_id, date, amount, status)
          VALUES (?, ?, ?, ?, ?)
          ON CONFLICT(id) DO UPDATE SET
            date = excluded.date,
            amount = excluded.amount,
            status = excluded.status
        `).run(inv.id, id, inv.date, inv.amount, inv.status);
      }
    }

    return this.getUserById(id);
  },

  getAllUsers(): User[] {
    const db = getDatabase();
    const rows = db.prepare("SELECT * FROM users ORDER BY created_at DESC").all() as any[];
    return rows.map((r) => {
      const invoices = db.prepare("SELECT * FROM invoices WHERE user_id = ?").all(r.id) as any[];
      return rowToUser(r, invoices);
    });
  },

  deleteUser(id: string): boolean {
    const db = getDatabase();
    const res = db.prepare("DELETE FROM users WHERE id = ?").run(id);
    db.prepare("DELETE FROM gmail_tokens WHERE user_id = ?").run(id);
    return res.changes > 0;
  },

  saveGmailToken(
    id: string,
    tokenData: { access_token: string; refresh_token?: string | null; expiry_date?: number | null }
  ) {
    const db = getDatabase();
    const now = new Date().toISOString();
    db.prepare(`
      INSERT INTO gmail_tokens (user_id, access_token, refresh_token, expiry_date, updated_at)
      VALUES (?, ?, ?, ?, ?)
      ON CONFLICT(user_id) DO UPDATE SET
        access_token = excluded.access_token,
        refresh_token = COALESCE(excluded.refresh_token, gmail_tokens.refresh_token),
        expiry_date = COALESCE(excluded.expiry_date, gmail_tokens.expiry_date),
        updated_at = excluded.updated_at
    `).run(id, tokenData.access_token, tokenData.refresh_token || null, tokenData.expiry_date || null, now);
  },

  getGmailToken(id: string): any | null {
    const db = getDatabase();
    const row = db.prepare("SELECT * FROM gmail_tokens WHERE user_id = ?").get(id) as any;
    if (!row) return null;
    return {
      access_token: row.access_token,
      refresh_token: row.refresh_token,
      expiry_date: row.expiry_date,
    };
  },

  createReport(
    reportData: Omit<CommunityReport, "id" | "createdAt" | "status"> & {
      id?: string;
      status?: "pending_review" | "approved" | "rejected";
      createdAt?: string;
    }
  ): CommunityReport {
    const db = getDatabase();
    const id =
      reportData.id ||
      "rep_" + Math.random().toString(36).substring(2, 11) + "_" + Date.now().toString(36);
    const now = new Date().toISOString();
    const status = reportData.status || "pending_review";
    const createdAt = reportData.createdAt || now;

    db.prepare(`
      INSERT INTO community_reports (
        id, sender_display_name, sender_email, subject, recipient_email,
        date_received, email_provider, body_excerpt, suspicious_urls_json,
        headers, screenshot_url, reasons_json, user_notes, red_flags_json,
        target_brand, is_anonymous, submitted_by_user_id, submitted_by_user_email,
        status, moderation_notes, reviewed_at, reviewed_by, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      id,
      reportData.senderDisplayName || "",
      reportData.senderEmail || "",
      reportData.subject || "",
      reportData.recipientEmail || null,
      reportData.dateReceived || null,
      reportData.emailProvider || null,
      reportData.bodyExcerpt || null,
      JSON.stringify(reportData.suspiciousUrls || []),
      reportData.headers || null,
      reportData.screenshotUrl || null,
      JSON.stringify(reportData.reasons || []),
      reportData.userNotes || null,
      JSON.stringify(reportData.redFlagsObserved || []),
      reportData.targetBrand || null,
      reportData.isAnonymous ? 1 : 0,
      reportData.submittedByUserId || null,
      reportData.submittedByUserEmail || null,
      status,
      reportData.moderationNotes || null,
      reportData.reviewedAt || null,
      reportData.reviewedBy || null,
      createdAt,
      now
    );

    return this.getReportById(id)!;
  },

  getReportById(id: string): CommunityReport | null {
    const db = getDatabase();
    const row = db.prepare("SELECT * FROM community_reports WHERE id = ?").get(id) as any;
    if (!row) return null;

    const appealRow = db.prepare("SELECT * FROM report_appeals WHERE report_id = ?").get(id) as any;
    return rowToReport(row, appealRow);
  },

  getAllReports(): CommunityReport[] {
    const db = getDatabase();
    const rows = db.prepare("SELECT * FROM community_reports ORDER BY created_at DESC").all() as any[];
    return rows.map((r) => {
      const appealRow = db.prepare("SELECT * FROM report_appeals WHERE report_id = ?").get(r.id) as any;
      return rowToReport(r, appealRow);
    });
  },

  getPublicReports(searchQuery?: string, category?: string): CommunityReport[] {
    const db = getDatabase();
    let query = "SELECT * FROM community_reports WHERE status = 'approved'";
    const params: any[] = [];

    if (category && category !== "all") {
      query += " AND (LOWER(reasons_json) LIKE ? OR LOWER(target_brand) LIKE ?)";
      const pattern = `%${category.toLowerCase()}%`;
      params.push(pattern, pattern);
    }

    if (searchQuery && searchQuery.trim()) {
      const q = `%${searchQuery.toLowerCase().trim()}%`;
      query += ` AND (
        LOWER(sender_email) LIKE ? OR
        LOWER(sender_display_name) LIKE ? OR
        LOWER(subject) LIKE ? OR
        LOWER(target_brand) LIKE ? OR
        LOWER(body_excerpt) LIKE ? OR
        LOWER(suspicious_urls_json) LIKE ?
      )`;
      params.push(q, q, q, q, q, q);
    }

    query += " ORDER BY created_at DESC";
    const rows = db.prepare(query).all(...params) as any[];
    return rows.map((r) => {
      const appealRow = db.prepare("SELECT * FROM report_appeals WHERE report_id = ?").get(r.id) as any;
      return rowToReport(r, appealRow);
    });
  },

  updateReport(id: string, updates: Partial<CommunityReport>): CommunityReport | null {
    const db = getDatabase();
    const existing = this.getReportById(id);
    if (!existing) return null;

    const fields: string[] = ["updated_at = ?"];
    const now = new Date().toISOString();
    const values: any[] = [now];

    if (updates.status !== undefined) {
      fields.push("status = ?");
      values.push(updates.status);
    }
    if (updates.moderationNotes !== undefined) {
      fields.push("moderation_notes = ?");
      values.push(updates.moderationNotes);
    }
    if (updates.reviewedAt !== undefined) {
      fields.push("reviewed_at = ?");
      values.push(updates.reviewedAt);
    }
    if (updates.reviewedBy !== undefined) {
      fields.push("reviewed_by = ?");
      values.push(updates.reviewedBy);
    }
    if (updates.reasons !== undefined) {
      fields.push("reasons_json = ?");
      values.push(JSON.stringify(updates.reasons));
    }
    if (updates.targetBrand !== undefined) {
      fields.push("target_brand = ?");
      values.push(updates.targetBrand);
    }

    values.push(id);
    db.prepare(`UPDATE community_reports SET ${fields.join(", ")} WHERE id = ?`).run(...values);

    if (updates.appeal) {
      this.saveAppeal(id, updates.appeal);
    }

    return this.getReportById(id);
  },

  saveAppeal(reportId: string, appeal: ReportAppeal) {
    const db = getDatabase();
    db.prepare(`
      INSERT INTO report_appeals (
        report_id, appellant_name, appellant_email, appellant_role,
        reason, explanation, evidence_links, is_verified_sender_match,
        status, submitted_at, reviewed_at, reviewed_by, review_notes
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(report_id) DO UPDATE SET
        appellant_name = excluded.appellant_name,
        appellant_email = excluded.appellant_email,
        appellant_role = excluded.appellant_role,
        reason = excluded.reason,
        explanation = excluded.explanation,
        evidence_links = excluded.evidence_links,
        is_verified_sender_match = excluded.is_verified_sender_match,
        status = excluded.status,
        reviewed_at = excluded.reviewed_at,
        reviewed_by = excluded.reviewed_by,
        review_notes = excluded.review_notes
    `).run(
      reportId,
      appeal.appellantName,
      appeal.appellantEmail,
      appeal.appellantRole,
      appeal.reason,
      appeal.explanation,
      appeal.evidenceLinksOrText || null,
      appeal.isVerifiedSenderMatch ? 1 : 0,
      appeal.status,
      appeal.submittedAt,
      appeal.reviewedAt || null,
      appeal.reviewedBy || null,
      appeal.reviewNotes || null
    );
  },

  deleteReport(id: string): boolean {
    const db = getDatabase();
    const res = db.prepare("DELETE FROM community_reports WHERE id = ?").run(id);
    return res.changes > 0;
  },

  getAdminInvites(): AdminInvite[] {
    const db = getDatabase();
    const rows = db.prepare("SELECT * FROM admin_invites ORDER BY created_at DESC").all() as any[];
    return rows.map((r) => ({
      email: r.email,
      addedBy: r.added_by,
      createdAt: r.created_at,
    }));
  },

  addAdminInvite(email: string, addedBy: string): AdminInvite {
    const db = getDatabase();
    const norm = email.toLowerCase().trim();
    const now = new Date().toISOString();
    db.prepare(`
      INSERT INTO admin_invites (email, added_by, created_at)
      VALUES (?, ?, ?)
      ON CONFLICT(email) DO UPDATE SET
        added_by = excluded.added_by,
        created_at = excluded.created_at
    `).run(norm, addedBy, now);
    return { email: norm, addedBy, createdAt: now };
  },

  removeAdminInvite(email: string): boolean {
    const db = getDatabase();
    const norm = email.toLowerCase().trim();
    const res = db.prepare("DELETE FROM admin_invites WHERE LOWER(email) = ?").run(norm);
    return res.changes > 0;
  },

  getAnalysisCache(key: string): any | null {
    const db = getDatabase();
    const row = db.prepare("SELECT result_json FROM analysis_cache WHERE cache_key = ?").get(key) as any;
    if (!row) return null;
    try {
      return JSON.parse(row.result_json);
    } catch {
      return null;
    }
  },

  setAnalysisCache(key: string, result: any) {
    const db = getDatabase();
    const now = new Date().toISOString();
    db.prepare(`
      INSERT INTO analysis_cache (cache_key, result_json, created_at)
      VALUES (?, ?, ?)
      ON CONFLICT(cache_key) DO UPDATE SET
        result_json = excluded.result_json,
        created_at = excluded.created_at
    `).run(key, JSON.stringify(result), now);
  },
};

// Automatic one-time migration from legacy db.json if present
function migrateFromLegacyDbJson(db: DatabaseSync) {
  const legacyFile = path.join(process.cwd(), "db.json");
  if (!fs.existsSync(legacyFile)) return;

  try {
    const raw = fs.readFileSync(legacyFile, "utf8");
    if (!raw.trim()) return;
    const data = JSON.parse(raw);

    // Check if SQLite already has users
    const userCount = (db.prepare("SELECT COUNT(*) as count FROM users").get() as any)?.count || 0;
    if (userCount > 0) return; // already migrated

    console.log("Migrating legacy data from db.json into SQLite...");

    if (data.users && typeof data.users === "object") {
      for (const id of Object.keys(data.users)) {
        const u = data.users[id];
        const normalizedEmail = (u.email || "").toLowerCase().trim();
        const isSuper = normalizedEmail === SUPER_ADMIN_EMAIL;
        db.prepare(`
          INSERT OR IGNORE INTO users (
            id, email, password_hash, name, plan, usage, payment_method,
            current_period_end, trial_start_date, is_admin, is_super_admin,
            is_verified, failed_login_attempts, locked_until, created_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `).run(
          u.id || id,
          normalizedEmail,
          u.passwordHash || "",
          u.name || "User",
          u.subscription?.plan || "free",
          u.subscription?.usage || 0,
          u.subscription?.paymentMethod || "None",
          u.subscription?.currentPeriodEnd || null,
          u.subscription?.trialStartDate || u.createdAt || new Date().toISOString(),
          u.isAdmin || isSuper ? 1 : 0,
          u.isSuperAdmin || isSuper ? 1 : 0,
          u.isVerified ? 1 : 0,
          u.failedLoginAttempts || 0,
          u.lockedUntil || null,
          u.createdAt || new Date().toISOString()
        );
      }
    }

    if (data.reports && typeof data.reports === "object") {
      for (const id of Object.keys(data.reports)) {
        const r = data.reports[id];
        db.prepare(`
          INSERT OR IGNORE INTO community_reports (
            id, sender_display_name, sender_email, subject, recipient_email,
            date_received, email_provider, body_excerpt, suspicious_urls_json,
            headers, screenshot_url, reasons_json, user_notes, red_flags_json,
            target_brand, is_anonymous, submitted_by_user_id, submitted_by_user_email,
            status, moderation_notes, reviewed_at, reviewed_by, created_at, updated_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `).run(
          r.id || id,
          r.senderDisplayName || "",
          r.senderEmail || "",
          r.subject || "",
          r.recipientEmail || null,
          r.dateReceived || null,
          r.emailProvider || null,
          r.bodyExcerpt || null,
          JSON.stringify(r.suspiciousUrls || []),
          r.headers || null,
          r.screenshotUrl || null,
          JSON.stringify(r.reasons || []),
          r.userNotes || null,
          JSON.stringify(r.redFlagsObserved || []),
          r.targetBrand || null,
          r.isAnonymous ? 1 : 0,
          r.submittedByUserId || null,
          r.submittedByUserEmail || null,
          r.status || "pending_review",
          r.moderationNotes || null,
          r.reviewedAt || null,
          r.reviewedBy || null,
          r.createdAt || new Date().toISOString(),
          r.updatedAt || new Date().toISOString()
        );
      }
    }

    if (data.tokens && typeof data.tokens === "object") {
      for (const uid of Object.keys(data.tokens)) {
        const t = data.tokens[uid];
        db.prepare(`
          INSERT OR IGNORE INTO gmail_tokens (user_id, access_token, refresh_token, expiry_date, updated_at)
          VALUES (?, ?, ?, ?, ?)
        `).run(
          uid,
          t.access_token || "",
          t.refresh_token || null,
          t.expiry_date || null,
          new Date().toISOString()
        );
      }
    }

    if (data.adminInvites && typeof data.adminInvites === "object") {
      for (const email of Object.keys(data.adminInvites)) {
        const inv = data.adminInvites[email];
        db.prepare(`
          INSERT OR IGNORE INTO admin_invites (email, added_by, created_at)
          VALUES (?, ?, ?)
        `).run(email.toLowerCase().trim(), inv.addedBy || "admin", inv.createdAt || new Date().toISOString());
      }
    }

    console.log("Legacy data migration completed successfully.");
  } catch (err: any) {
    console.error("Migration from db.json skipped/failed:", err.message);
  }
}
