import { Router, Request, Response } from "express";
import { getAuthUserId } from "./auth.js";
import { sqliteDb } from "../db/sqlite.js";
import { runForensicAnalysis, runInboxScan, runRealtimeAlert } from "../engine/forensic-engine.js";

const router = Router();

router.post("/", async (req: Request, res: Response): Promise<void> => {
  const uid = getAuthUserId(req);
  if (!uid) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }

  const { data, mode } = req.body;
  if (!data || !mode) {
    res.status(400).json({ error: "Missing data or mode" });
    return;
  }

  try {
    let result: any;
    if (mode === "INBOX_SCAN") {
      const emailList = Array.isArray(data) ? data : [data];
      result = await runInboxScan(emailList);
    } else if (mode === "REALTIME_ALERT") {
      const single = Array.isArray(data) ? data[0] : data;
      result = await runRealtimeAlert(single);
    } else {
      const single = Array.isArray(data) ? data[0] : data;
      result = await runForensicAnalysis(single);
    }

    // Increment user usage counter
    const user = sqliteDb.getUserById(uid);
    if (user) {
      sqliteDb.updateUserSubscription(uid, {
        usage: (user.subscription.usage || 0) + 1,
      });
    }

    res.json({ result });
  } catch (err: any) {
    console.error("Forensic analysis error:", err);
    res.status(500).json({ error: "Analysis failed: " + (err.message || "Unknown error") });
  }
});

export default router;
