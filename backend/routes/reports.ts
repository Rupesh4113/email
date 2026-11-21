import { Router, Request, Response } from "express";
import { sqliteDb } from "../db/sqlite.js";
import { getAuthUserId } from "./auth.js";

const router = Router();

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
          reviewNotes: rep.appeal.reviewNotes,
        }
      : undefined,
  };
}

// POST /api/reports - submit report
router.post("/", async (req: Request, res: Response): Promise<void> => {
  const uid = getAuthUserId(req);
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
    isAnonymous,
  } = req.body;

  if (!senderEmail || !subject || !reasons || !Array.isArray(reasons) || reasons.length === 0) {
    res.status(400).json({ error: "Sender email, subject, and at least one reason are required." });
    return;
  }

  let userEmail: string | undefined = undefined;
  if (uid) {
    const user = sqliteDb.getUserById(uid);
    if (user) userEmail = user.email;
  }

  try {
    const newReport = sqliteDb.createReport({
      senderDisplayName: senderDisplayName || "",
      senderEmail: senderEmail.toLowerCase().trim(),
      subject,
      recipientEmail,
      dateReceived,
      emailProvider,
      bodyExcerpt,
      suspiciousUrls: Array.isArray(suspiciousUrls) ? suspiciousUrls : [],
      headers,
      screenshotUrl,
      reasons,
      userNotes,
      redFlagsObserved: Array.isArray(redFlagsObserved) ? redFlagsObserved : [],
      targetBrand,
      isAnonymous: Boolean(isAnonymous),
      submittedByUserId: uid || undefined,
      submittedByUserEmail: userEmail,
      status: "pending_review",
    });

    res.status(201).json({
      message: "Report submitted successfully. It will be reviewed by our moderation team.",
      report: sanitizePublicReport(newReport),
    });
  } catch (err: any) {
    res.status(500).json({ error: "Failed to submit report: " + err.message });
  }
});

// GET /api/reports/public
router.get("/public", (req: Request, res: Response) => {
  const search = req.query.search as string | undefined;
  const category = req.query.category as string | undefined;

  const reports = sqliteDb.getPublicReports(search, category);
  res.json({ reports: reports.map(sanitizePublicReport) });
});

// GET /api/reports/check?email=...
router.get("/check", (req: Request, res: Response): void => {
  const emailParam = req.query.email as string | undefined;
  if (!emailParam || !emailParam.trim()) {
    res.status(400).json({ error: "Email query parameter is required." });
    return;
  }

  const clean = emailParam.toLowerCase().trim();
  const reports = sqliteDb.getPublicReports();
  const matches = reports.filter(
    (r) =>
      r.senderEmail.toLowerCase().trim() === clean ||
      (r.senderEmail.includes("@") &&
        clean.includes("@") &&
        r.senderEmail.split("@")[1] === clean.split("@")[1])
  );

  res.json({
    found: matches.length > 0,
    count: matches.length,
    reports: matches.map(sanitizePublicReport),
  });
});

// POST /api/reports/:id/appeal
router.post("/:id/appeal", (req: Request, res: Response): void => {
  const { id } = req.params;
  const {
    appellantName,
    appellantEmail,
    appellantRole,
    reason,
    explanation,
    evidenceLinksOrText,
  } = req.body;

  if (!appellantName || !appellantEmail || !reason || !explanation) {
    res.status(400).json({ error: "Name, email, reason, and explanation are required." });
    return;
  }

  const report = sqliteDb.getReportById(id);
  if (!report) {
    res.status(404).json({ error: "Report not found." });
    return;
  }

  const appellantDomain = appellantEmail.split("@")[1]?.toLowerCase().trim();
  const senderDomain = report.senderEmail.split("@")[1]?.toLowerCase().trim();
  const isVerifiedSenderMatch = Boolean(appellantDomain && senderDomain && appellantDomain === senderDomain);

  const appeal = {
    appellantName,
    appellantEmail: appellantEmail.toLowerCase().trim(),
    appellantRole: appellantRole || "Sender / Organization Representative",
    reason,
    explanation,
    evidenceLinksOrText,
    isVerifiedSenderMatch,
    status: "pending" as const,
    submittedAt: new Date().toISOString(),
  };

  sqliteDb.saveAppeal(id, appeal);
  sqliteDb.updateReport(id, { hasAppeal: true });

  res.status(201).json({
    message: "Appeal submitted successfully. Our security and compliance team will review your evidence.",
    appeal,
  });
});

export default router;
