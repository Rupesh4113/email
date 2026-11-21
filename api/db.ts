import "dotenv/config";
import { initializeApp, applicationDefault, getApps, cert } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import fs from "fs";
import path from "path";

// Load config
const configPath = path.join(process.cwd(), "firebase-applet-config.json");
let config: any = {};
if (fs.existsSync(configPath)) {
  config = JSON.parse(fs.readFileSync(configPath, "utf8"));
}

let db: any = null;

try {
  let credential: any = null;

  if (process.env.FIREBASE_SERVICE_ACCOUNT) {
    try {
      const serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT);
      credential = cert(serviceAccount);
      console.log("Using credentials from FIREBASE_SERVICE_ACCOUNT environment variable.");
    } catch (e: any) {
      console.warn("Failed to parse FIREBASE_SERVICE_ACCOUNT JSON:", e.message);
    }
  } else if (process.env.GOOGLE_APPLICATION_CREDENTIALS_JSON) {
    try {
      const serviceAccount = JSON.parse(process.env.GOOGLE_APPLICATION_CREDENTIALS_JSON);
      credential = cert(serviceAccount);
      console.log("Using credentials from GOOGLE_APPLICATION_CREDENTIALS_JSON environment variable.");
    } catch (e: any) {
      console.warn("Failed to parse GOOGLE_APPLICATION_CREDENTIALS_JSON JSON:", e.message);
    }
  } else if (process.env.GOOGLE_APPLICATION_CREDENTIALS) {
    credential = applicationDefault();
    console.log("Using credentials from GOOGLE_APPLICATION_CREDENTIALS file path.");
  } else if (process.env.K_SERVICE) {
    // We are running inside Google Cloud (e.g. Cloud Run in AI Studio sandbox), so ADC is available
    credential = applicationDefault();
    console.log("Using Google Application Default Credentials (running in Cloud environment).");
  }

  if (credential) {
    const app = getApps().length === 0 ? initializeApp({
      credential,
      projectId: config.projectId,
    }) : getApps()[0];

    db = getFirestore(app, config.firestoreDatabaseId || "ai-studio-mailverifier-dc1ff58a-9c34-4891-a598-e435ebb2f5a6");
    try {
      db.settings({ ignoreUndefinedProperties: true });
    } catch {
      // ignore if already initialized
    }

    // Verify permissions asynchronously on startup, and disable Firestore if they're missing
    db.collection("_connection_test").limit(1).get().then(() => {
      console.log("Firestore connection verified successfully.");
    }).catch((err: any) => {
      console.warn("Firestore connection check failed, disabling Firestore and using local database fallback:", err.message);
      db = null;
    });
  } else {
    console.warn("No Google Cloud credentials detected. Firestore is disabled; falling back to local database (db.json).");
  }
} catch (err: any) {
  console.warn("Failed to initialize Firestore Admin client, falling back to local database:", err.message);
}

export interface Subscription {
  plan: string;
  usage: number;
  paymentMethod: string;
  currentPeriodEnd: string | null;
  trialStartDate: string | null;
  invoices: Array<{ id: string; date: string; amount: string; status: "paid" | "pending" }>;
}

export const SUPER_ADMIN_EMAIL = "adamu0533@gmail.com";

export interface User {
  id: string;
  email: string;
  passwordHash: string;
  name: string;
  subscription: Subscription;
  createdAt: string;
  isAdmin?: boolean;
  isSuperAdmin?: boolean;
  isVerified?: boolean;
  verificationToken?: string;
  failedLoginAttempts?: number;
  lockedUntil?: string | null;
}

export interface AdminInvite {
  email: string;
  addedBy: string;
  createdAt: string;
}

export interface ReportAppeal {
  appellantName: string;
  appellantEmail: string;
  appellantRole: string; // e.g. "Domain Owner", "Authorized Sender", "IT Administrator", "Legal Representative"
  reason: string;
  explanation: string;
  evidenceLinksOrText?: string;
  isVerifiedSenderMatch?: boolean;
  status: "pending" | "approved" | "rejected";
  submittedAt: string;
  reviewedAt?: string;
  reviewedBy?: string;
  reviewNotes?: string;
}

export interface CommunityReport {
  id: string;
  senderDisplayName: string;
  senderEmail: string;
  subject: string;
  recipientEmail?: string;
  dateReceived?: string;
  emailProvider?: string;
  bodyExcerpt?: string;
  suspiciousUrls?: string[];
  headers?: string;
  screenshotUrl?: string;
  reasons: string[];
  userNotes?: string;
  redFlagsObserved?: string[];
  targetBrand?: string;
  isAnonymous?: boolean;
  submittedByUserId?: string;
  submittedByUserEmail?: string;
  status: "pending_review" | "approved" | "rejected";
  moderationNotes?: string;
  reviewedAt?: string;
  reviewedBy?: string;
  hasAppeal?: boolean;
  appeal?: ReportAppeal;
  createdAt: string;
  updatedAt?: string;
}

function stripUndefined<T extends Record<string, any>>(obj: T): T {
  const out: Record<string, any> = {};
  for (const [k, v] of Object.entries(obj)) {
    if (v !== undefined) {
      out[k] = v;
    }
  }
  return out as T;
}

function normalizeUserRoles(user: User): User {
  if (user.email && user.email.toLowerCase().trim() === SUPER_ADMIN_EMAIL) {
    return { ...user, isAdmin: true, isSuperAdmin: true };
  }
  return { ...user, isAdmin: Boolean(user.isAdmin), isSuperAdmin: Boolean(user.isSuperAdmin) };
}

const DB_FILE = path.join(process.cwd(), "db.json");

function readLocalDb(): any {
  try {
    if (fs.existsSync(DB_FILE)) {
      return JSON.parse(fs.readFileSync(DB_FILE, "utf8"));
    }
  } catch (err) {
    console.error("Failed to read local DB:", err);
  }
  return { users: {}, tokens: {}, reports: {} };
}

function writeLocalDb(data: any) {
  try {
    fs.writeFileSync(DB_FILE, JSON.stringify(data, null, 2), "utf8");
  } catch (err) {
    console.error("Failed to write local DB:", err);
  }
}

function handleDbFallback(operation: string, error: Error) {
  if (process.env.NODE_ENV === 'production' && process.env.ALLOW_LOCAL_DB_FALLBACK !== 'true') {
    console.error(`[FATAL] Firestore error in ${operation}:`, error.message);
    throw new Error(`Service Unavailable: ${operation} failed`);
  }
  console.error(`Firestore error in ${operation}, falling back to local DB:`, error.message);
}

const localDb = {
  getUserByEmail(email: string): User | null {
    const data = readLocalDb();
    const normalized = email.toLowerCase().trim();
    for (const id in data.users) {
      if (data.users[id].email === normalized) {
        return normalizeUserRoles(data.users[id]);
      }
    }
    return null;
  },

  getUserById(id: string): User | null {
    const data = readLocalDb();
    return data.users[id] ? normalizeUserRoles(data.users[id]) : null;
  },

  createUser(email: string, passwordHash: string, name: string): User {
    const data = readLocalDb();
    const id = "usr_" + Math.random().toString(36).substring(2, 11);
    const normalizedEmail = email.toLowerCase().trim();
    const isSuper = normalizedEmail === SUPER_ADMIN_EMAIL;
    const isInvitedAdmin = Boolean(data.adminInvites && data.adminInvites[normalizedEmail]);
    const newUser: User = {
      id,
      email: normalizedEmail,
      passwordHash,
      name: name.trim(),
      subscription: {
        plan: "free",
        usage: 0,
        paymentMethod: "None",
        currentPeriodEnd: null,
        trialStartDate: new Date().toISOString(),
        invoices: []
      },
      createdAt: new Date().toISOString(),
      isAdmin: isSuper || isInvitedAdmin,
      isSuperAdmin: isSuper,
      isVerified: false,
      failedLoginAttempts: 0,
      lockedUntil: null
    };
    data.users[id] = newUser;
    if (isInvitedAdmin && data.adminInvites) {
      delete data.adminInvites[normalizedEmail];
    }
    writeLocalDb(data);
    return newUser;
  },

  updateUser(id: string, updates: Partial<User>): User | null {
    const data = readLocalDb();
    if (!data.users[id]) return null;
    data.users[id] = {
      ...data.users[id],
      ...updates
    };
    writeLocalDb(data);
    return data.users[id];
  },
  updateUserSubscription(id: string, subscription: Partial<Subscription>): User | null {
    const data = readLocalDb();
    if (!data.users[id]) return null;
    data.users[id].subscription = {
      ...data.users[id].subscription,
      ...subscription
    };
    writeLocalDb(data);
    return data.users[id];
  },

  saveGmailToken(id: string, tokenData: { access_token: string, refresh_token?: string | null, expiry_date?: number | null }) {
    const data = readLocalDb();
    if (!data.tokens) data.tokens = {};
    const existing = data.tokens[id] || {};
    data.tokens[id] = {
      ...existing,
      ...tokenData,
    };
    writeLocalDb(data);
  },

  getGmailToken(id: string): any | null {
    const data = readLocalDb();
    if (!data.tokens) return null;
    return data.tokens[id] || null;
  },

  getAllUsers(): User[] {
    const data = readLocalDb();
    return Object.values(data.users);
  },

  deleteUser(id: string): boolean {
    const data = readLocalDb();
    if (!data.users[id]) return false;
    delete data.users[id];
    if (data.tokens && data.tokens[id]) {
      delete data.tokens[id];
    }
    writeLocalDb(data);
    return true;
  },

  getReportById(id: string): CommunityReport | null {
    const data = readLocalDb();
    if (!data.reports) return null;
    return data.reports[id] || null;
  },

  createReport(report: CommunityReport): CommunityReport {
    const data = readLocalDb();
    if (!data.reports) data.reports = {};
    data.reports[report.id] = report;
    writeLocalDb(data);
    return report;
  },

  getAllReports(): CommunityReport[] {
    const data = readLocalDb();
    if (!data.reports) return [];
    return Object.values(data.reports);
  },

  updateReport(id: string, updates: Partial<CommunityReport>): CommunityReport | null {
    const data = readLocalDb();
    if (!data.reports || !data.reports[id]) return null;
    data.reports[id] = {
      ...data.reports[id],
      ...updates,
      updatedAt: new Date().toISOString()
    };
    writeLocalDb(data);
    return data.reports[id];
  },

  deleteReport(id: string): boolean {
    const data = readLocalDb();
    if (!data.reports || !data.reports[id]) return false;
    delete data.reports[id];
    writeLocalDb(data);
    return true;
  },

  getAdminInvites(): AdminInvite[] {
    const data = readLocalDb();
    if (!data.adminInvites) return [];
    return Object.values(data.adminInvites);
  },

  addAdminInvite(invite: AdminInvite): AdminInvite {
    const data = readLocalDb();
    if (!data.adminInvites) data.adminInvites = {};
    data.adminInvites[invite.email.toLowerCase().trim()] = invite;
    writeLocalDb(data);
    return invite;
  },

  removeAdminInvite(email: string): boolean {
    const data = readLocalDb();
    const norm = email.toLowerCase().trim();
    if (!data.adminInvites || !data.adminInvites[norm]) return false;
    delete data.adminInvites[norm];
    writeLocalDb(data);
    return true;
  }
};

export const dbService = {
  async getUserByEmail(email: string): Promise<User | null> {
    const normalizedEmail = email.toLowerCase().trim();
    if (!db) {
      return localDb.getUserByEmail(normalizedEmail);
    }
    try {
      const snapshot = await db.collection("users").where("email", "==", normalizedEmail).limit(1).get();
      if (snapshot.empty) return null;
      return normalizeUserRoles(snapshot.docs[0].data() as User);
    } catch (e: any) {
      handleDbFallback("getUserByEmail", e);
      return localDb.getUserByEmail(normalizedEmail);
    }
  },

  async getUserById(id: string): Promise<User | null> {
    if (!db) {
      return localDb.getUserById(id);
    }
    try {
      const doc = await db.collection("users").doc(id).get();
      if (!doc.exists) return null;
      return normalizeUserRoles(doc.data() as User);
    } catch (e: any) {
      handleDbFallback("getUserById", e);
      return localDb.getUserById(id);
    }
  },

  async createUser(email: string, passwordHash: string, name: string): Promise<User> {
    if (!db) {
      return localDb.createUser(email, passwordHash, name);
    }
    const id = "usr_" + Math.random().toString(36).substring(2, 11);
    const normalizedEmail = email.toLowerCase().trim();
    const isSuper = normalizedEmail === SUPER_ADMIN_EMAIL;
    let isInvitedAdmin = false;
    try {
      const inviteDoc = await db.collection("admin_invites").doc(normalizedEmail).get();
      if (inviteDoc.exists) {
        isInvitedAdmin = true;
        await db.collection("admin_invites").doc(normalizedEmail).delete().catch(() => {});
      }
    } catch {
      // ignore invite check failure
    }
    const newUser: User = {
      id,
      email: normalizedEmail,
      passwordHash,
      name: name.trim(),
      subscription: {
        plan: "free",
        usage: 0,
        paymentMethod: "None",
        currentPeriodEnd: null,
        trialStartDate: new Date().toISOString(),
        invoices: []
      },
      createdAt: new Date().toISOString(),
      isAdmin: isSuper || isInvitedAdmin,
      isSuperAdmin: isSuper,
      isVerified: false,
      failedLoginAttempts: 0,
      lockedUntil: null
    };
    try {
      await db.collection("users").doc(id).set(newUser);
      if (newUser.isAdmin) {
        await db.collection("admins").doc(id).set({ email: normalizedEmail, isSuperAdmin: isSuper, createdAt: new Date().toISOString() }).catch(() => {});
      }
      return newUser;
    } catch (e: any) {
      handleDbFallback("createUser", e);
      return localDb.createUser(email, passwordHash, name);
    }
  },

  async updateUser(id: string, updates: Partial<User>): Promise<User | null> {
    if (!db) {
      return localDb.updateUser(id, updates);
    }
    try {
      const userRef = db.collection("users").doc(id);
      const doc = await userRef.get();
      if (!doc.exists) return null;
      
      const user = doc.data() as User;
      const updatedUser = {
        ...user,
        ...updates
      };
      await userRef.set(updatedUser);
      return updatedUser;
    } catch (e: any) {
      handleDbFallback("updateUser", e);
      return localDb.updateUser(id, updates);
    }
  },
  async updateUserSubscription(id: string, subscription: Partial<Subscription>): Promise<User | null> {
    if (!db) {
      return localDb.updateUserSubscription(id, subscription);
    }
    try {
      const userRef = db.collection("users").doc(id);
      const doc = await userRef.get();
      if (!doc.exists) return null;
      
      const user = doc.data() as User;
      user.subscription = {
        ...user.subscription,
        ...subscription
      };
      await userRef.set(user);
      return user;
    } catch (e: any) {
      handleDbFallback("updateUserSubscription", e);
      return localDb.updateUserSubscription(id, subscription);
    }
  },

  async saveGmailToken(id: string, tokenData: { access_token: string, refresh_token?: string | null, expiry_date?: number | null }): Promise<void> {
    if (!db) {
      localDb.saveGmailToken(id, tokenData);
      return;
    }
    try {
      await db.collection("tokens").doc(id).set(tokenData, { merge: true });
    } catch (e: any) {
      handleDbFallback("saveGmailToken", e);
      localDb.saveGmailToken(id, tokenData);
    }
  },

  async getGmailToken(id: string): Promise<any | null> {
    if (!db) {
      return localDb.getGmailToken(id);
    }
    try {
      const doc = await db.collection("tokens").doc(id).get();
      if (!doc.exists) return null;
      return doc.data() || null;
    } catch (e: any) {
      handleDbFallback("getGmailToken", e);
      return localDb.getGmailToken(id);
    }
  },

  async getAllUsers(): Promise<User[]> {
    if (!db) {
      return localDb.getAllUsers().map(normalizeUserRoles);
    }
    try {
      const snapshot = await db.collection("users").get();
      return snapshot.docs.map(doc => normalizeUserRoles(doc.data() as User));
    } catch (e: any) {
      handleDbFallback("getAllUsers", e);
      return localDb.getAllUsers().map(normalizeUserRoles);
    }
  },

  async deleteUser(id: string): Promise<boolean> {
    if (!db) {
      return localDb.deleteUser(id);
    }
    try {
      const doc = await db.collection("users").doc(id).get();
      if (!doc.exists) return false;
      await db.collection("users").doc(id).delete();
      await db.collection("tokens").doc(id).delete().catch(() => {});
      return true;
    } catch (e: any) {
      handleDbFallback("deleteUser", e);
      return localDb.deleteUser(id);
    }
  },

  async createReport(reportData: Omit<CommunityReport, "id" | "createdAt" | "status"> & { id?: string; status?: "pending_review" | "approved" | "rejected"; createdAt?: string }): Promise<CommunityReport> {
    const id = reportData.id || "rep_" + Math.random().toString(36).substring(2, 11) + "_" + Date.now().toString(36);
    const newReport = stripUndefined({
      ...reportData,
      id,
      status: reportData.status || "pending_review",
      createdAt: reportData.createdAt || new Date().toISOString(),
      updatedAt: new Date().toISOString()
    }) as CommunityReport;
    if (!db) {
      return localDb.createReport(newReport);
    }
    try {
      await db.collection("community_reports").doc(id).set(newReport);
      return newReport;
    } catch (e: any) {
      handleDbFallback("createReport", e);
      return localDb.createReport(newReport);
    }
  },

  async getReportById(id: string): Promise<CommunityReport | null> {
    if (!db) {
      return localDb.getReportById(id);
    }
    try {
      const doc = await db.collection("community_reports").doc(id).get();
      if (!doc.exists) return null;
      return doc.data() as CommunityReport;
    } catch (e: any) {
      handleDbFallback("getReportById", e);
      return localDb.getReportById(id);
    }
  },

  async getAllReports(): Promise<CommunityReport[]> {
    if (!db) {
      return localDb.getAllReports().sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
    }
    try {
      const snapshot = await db.collection("community_reports").get();
      const reports = snapshot.docs.map(doc => doc.data() as CommunityReport);
      return reports.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
    } catch (e: any) {
      handleDbFallback("getAllReports", e);
      return localDb.getAllReports().sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
    }
  },

  async getPublicReports(searchQuery?: string, category?: string): Promise<CommunityReport[]> {
    let reports = await this.getAllReports();
    // NEVER automatically publish user submitted reports: only approved reports are publicly visible
    reports = reports.filter(r => r.status === "approved");

    if (category && category !== "all") {
      const catLower = category.toLowerCase();
      reports = reports.filter(r => 
        r.reasons?.some(re => re.toLowerCase().includes(catLower)) ||
        (r.targetBrand && r.targetBrand.toLowerCase().includes(catLower))
      );
    }

    if (searchQuery && searchQuery.trim()) {
      const q = searchQuery.toLowerCase().trim();
      reports = reports.filter(r => 
        (r.senderEmail && r.senderEmail.toLowerCase().includes(q)) ||
        (r.senderDisplayName && r.senderDisplayName.toLowerCase().includes(q)) ||
        (r.subject && r.subject.toLowerCase().includes(q)) ||
        (r.targetBrand && r.targetBrand.toLowerCase().includes(q)) ||
        (r.bodyExcerpt && r.bodyExcerpt.toLowerCase().includes(q)) ||
        (r.suspiciousUrls && r.suspiciousUrls.some(u => u.toLowerCase().includes(q)))
      );
    }

    return reports;
  },

  async updateReport(id: string, updates: Partial<CommunityReport>): Promise<CommunityReport | null> {
    if (!db) {
      return localDb.updateReport(id, updates);
    }
    try {
      const docRef = db.collection("community_reports").doc(id);
      const doc = await docRef.get();
      if (!doc.exists) return null;
      const updated = stripUndefined({
        ...doc.data(),
        ...updates,
        updatedAt: new Date().toISOString()
      }) as CommunityReport;
      await docRef.set(updated);
      return updated;
    } catch (e: any) {
      handleDbFallback("updateReport", e);
      return localDb.updateReport(id, updates);
    }
  },

  async deleteReport(id: string): Promise<boolean> {
    if (!db) {
      return localDb.deleteReport(id);
    }
    try {
      const docRef = db.collection("community_reports").doc(id);
      const doc = await docRef.get();
      if (!doc.exists) return false;
      await docRef.delete();
      return true;
    } catch (e: any) {
      handleDbFallback("deleteReport", e);
      return localDb.deleteReport(id);
    }
  },

  async syncAdminDoc(userId: string, email: string, isAdmin: boolean, isSuperAdmin = false): Promise<void> {
    if (!db) return;
    try {
      if (isAdmin) {
        await db.collection("admins").doc(userId).set({
          email: email.toLowerCase().trim(),
          isSuperAdmin,
          updatedAt: new Date().toISOString()
        }, { merge: true });
      } else {
        await db.collection("admins").doc(userId).delete().catch(() => {});
      }
    } catch (e: any) {
      console.warn("Could not sync admins collection:", e.message);
    }
  },

  async getAdminInvites(): Promise<AdminInvite[]> {
    if (!db) {
      return localDb.getAdminInvites();
    }
    try {
      const snapshot = await db.collection("admin_invites").get();
      return snapshot.docs.map(doc => doc.data() as AdminInvite);
    } catch (e: any) {
      handleDbFallback("getAdminInvites", e);
      return localDb.getAdminInvites();
    }
  },

  async addAdminInvite(email: string, addedBy: string): Promise<AdminInvite> {
    const norm = email.toLowerCase().trim();
    const invite: AdminInvite = {
      email: norm,
      addedBy,
      createdAt: new Date().toISOString()
    };
    if (!db) {
      return localDb.addAdminInvite(invite);
    }
    try {
      await db.collection("admin_invites").doc(norm).set(invite);
      return invite;
    } catch (e: any) {
      handleDbFallback("addAdminInvite", e);
      return localDb.addAdminInvite(invite);
    }
  },

  async removeAdminInvite(email: string): Promise<boolean> {
    const norm = email.toLowerCase().trim();
    if (!db) {
      return localDb.removeAdminInvite(norm);
    }
    try {
      await db.collection("admin_invites").doc(norm).delete();
      return true;
    } catch (e: any) {
      handleDbFallback("removeAdminInvite", e);
      return localDb.removeAdminInvite(norm);
    }
  }
};
