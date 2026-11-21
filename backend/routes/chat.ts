import { Router, Request, Response } from "express";
import { getAuthUserId } from "./auth.js";
import { answerEmailChatQuery } from "../ai/ollama-provider.js";

const router = Router();

router.post("/", async (req: Request, res: Response): Promise<void> => {
  const uid = getAuthUserId(req);
  if (!uid) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }

  const { messageContext, history, question } = req.body;
  if (!question || !messageContext) {
    res.status(400).json({ error: "Missing required fields: question or messageContext" });
    return;
  }

  try {
    const text = await answerEmailChatQuery(messageContext, history || [], question);
    res.json({ text });
  } catch (err: any) {
    console.error("Chat error:", err);
    res.status(500).json({ error: err.message || "Failed to process chat query" });
  }
});

export default router;
