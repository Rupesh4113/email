import { Router, Request, Response, NextFunction } from "express";
import { sqliteDb, SUPER_ADMIN_EMAIL } from "../db/sqlite.js";
import { getAuthUserId, isAdmin } from "./auth.js";

const router = Router();

function requireAdmin(req: Request, res: Response, next: NextFunction): void {
  const uid = getAuthUserId(req);
  if (!uid) {
    res.status(401).json({ error: "Unauthorized: Admin session required." });
    return;
  }

  const user = sqliteDb.getUserById(uid);
  if (!user || !isAdmin(user)) {
    res.status(403).json({ error: "Forbidden: Admin privileges required." });
    return;
  }

  (req as any).user = user;
  next();
}

router.use(requireAdmin);

// GET /api/admin/users
router.get("/users", (req: Request, res: Response) => {
  const users = sqliteDb.getAllUsers().map(({ passwordHash, ...u }) => u);
  res.json({ users });
});

// DELETE /api/admin/users/:id
router.delete("/users/:id", (req: Request, res: Response): void => {
  const { id } = req.params;
  const target = sqliteDb.getUserById(id);
  if (!target) {
    res.status(404).json({ error: "User not found" });
    return;
  }

  if (target.email.toLowerCase().trim() === SUPER_ADMIN_EMAIL) {
    res.status(403).json({ error: "Cannot delete the Super Admin account." });
    return;
  }

  const success = sqliteDb.deleteUser(id);
  res.json({ success, message: "User deleted successfully." });
});

// POST /api/admin/users/:id/subscription
router.post("/users/:id/subscription", (req: Request, res: Response): void => {
  const { id } = req.params;
  const { plan, usage, currentPeriodEnd } = req.body;

  const target = sqliteDb.getUserById(id);
  if (!target) {
    res.status(404).json({ error: "User not found" });
    return;
  }

  const updated = sqliteDb.updateUserSubscription(id, {
    plan,
    usage: Number(usage) || 0,
    currentPeriodEnd: currentPeriodEnd || null,
  });

  if (!updated) {
    res.status(500).json({ error: "Failed to update subscription." });
    return;
  }

  const { passwordHash: _, ...safeUser } = updated;
  res.json({ message: "Subscription updated successfully", user: safeUser });
});

// GET /api/admin/reports
router.get("/reports", (req: Request, res: Response) => {
  const reports = sqliteDb.getAllReports();
  res.json({ reports });
});

// PATCH /api/admin/reports/:id
router.patch("/reports/:id", (req: Request, res: Response): void => {
  const { id } = req.params;
  const currentUser = (req as any).user;
  const { status, moderationNotes, reasons, targetBrand } = req.body;

  const existing = sqliteDb.getReportById(id);
  if (!existing) {
    res.status(404).json({ error: "Report not found" });
    return;
  }

  const updates: any = {};
  if (status) {
    updates.status = status;
    updates.reviewedAt = new Date().toISOString();
    updates.reviewedBy = currentUser.email;
  }
  if (moderationNotes !== undefined) updates.moderationNotes = moderationNotes;
  if (reasons !== undefined) updates.reasons = reasons;
  if (targetBrand !== undefined) updates.targetBrand = targetBrand;

  const updated = sqliteDb.updateReport(id, updates);
  res.json({ message: "Report updated successfully", report: updated });
});

// PATCH /api/admin/reports/:id/appeal
router.patch("/reports/:id/appeal", (req: Request, res: Response): void => {
  const { id } = req.params;
  const currentUser = (req as any).user;
  const { status, reviewNotes, revertReportStatus } = req.body;

  const report = sqliteDb.getReportById(id);
  if (!report || !report.appeal) {
    res.status(404).json({ error: "Appeal not found for this report" });
    return;
  }

  const appealUpdates = {
    ...report.appeal,
    status: status || report.appeal.status,
    reviewNotes: reviewNotes || report.appeal.reviewNotes,
    reviewedAt: new Date().toISOString(),
    reviewedBy: currentUser.email,
  };

  sqliteDb.saveAppeal(id, appealUpdates);

  if (revertReportStatus && status === "approved") {
    sqliteDb.updateReport(id, { status: "rejected" });
  }

  res.json({ message: "Appeal decision saved successfully." });
});

// DELETE /api/admin/reports/:id
router.delete("/reports/:id", (req: Request, res: Response): void => {
  const { id } = req.params;
  const success = sqliteDb.deleteReport(id);
  if (!success) {
    res.status(404).json({ error: "Report not found" });
    return;
  }
  res.json({ success, message: "Report deleted successfully" });
});

// GET /api/admin/admins
router.get("/admins", (req: Request, res: Response) => {
  const users = sqliteDb.getAllUsers().filter((u) => u.isAdmin || u.isSuperAdmin);
  const invites = sqliteDb.getAdminInvites();
  res.json({
    admins: users.map((u) => ({
      id: u.id,
      email: u.email,
      name: u.name,
      isSuperAdmin: Boolean(u.isSuperAdmin),
      createdAt: u.createdAt,
    })),
    invites,
  });
});

// POST /api/admin/admins
router.post("/admins", (req: Request, res: Response): void => {
  const { email } = req.body;
  const currentUser = (req as any).user;
  if (!email || !email.includes("@")) {
    res.status(400).json({ error: "Valid email is required." });
    return;
  }

  const clean = email.toLowerCase().trim();
  const existingUser = sqliteDb.getUserByEmail(clean);

  if (existingUser) {
    sqliteDb.updateUser(existingUser.id, { isAdmin: true });
    res.json({ message: `Promoted existing user ${clean} to Admin.` });
    return;
  }

  const invite = sqliteDb.addAdminInvite(clean, currentUser.email);
  res.status(201).json({
    message: `Admin invite created for ${clean}. They will receive admin permissions upon registration.`,
    invite,
  });
});

// DELETE /api/admin/admins/:identifier
router.delete("/admins/:identifier", (req: Request, res: Response): void => {
  const { identifier } = req.params;
  const norm = decodeURIComponent(identifier).toLowerCase().trim();

  if (norm === SUPER_ADMIN_EMAIL) {
    res.status(403).json({ error: "Cannot revoke permissions from the Super Admin." });
    return;
  }

  // Check if it's a user id or email
  let user = sqliteDb.getUserById(norm);
  if (!user && norm.includes("@")) {
    user = sqliteDb.getUserByEmail(norm);
  }

  if (user) {
    if (user.email.toLowerCase().trim() === SUPER_ADMIN_EMAIL) {
      res.status(403).json({ error: "Cannot revoke permissions from Super Admin." });
      return;
    }
    sqliteDb.updateUser(user.id, { isAdmin: false, isSuperAdmin: false });
    res.json({ message: `Revoked admin role for ${user.email}.` });
    return;
  }

  const removed = sqliteDb.removeAdminInvite(norm);
  if (removed) {
    res.json({ message: `Removed admin invite for ${norm}.` });
    return;
  }

  res.status(404).json({ error: "Admin user or invite not found." });
});

export default router;
