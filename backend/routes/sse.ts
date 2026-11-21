import { Router, Request, Response } from "express";

const router = Router();
const sseClients = new Map<string, Response>();

router.get("/", (req: Request, res: Response): void => {
  const uid = (req.session && req.session.userId) || (req.query.uid as string);
  if (!uid) {
    res.status(401).send("Unauthorized");
    return;
  }

  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection", "keep-alive");
  res.flushHeaders?.();

  sseClients.set(uid, res);

  // Send initial connection event
  res.write(`data: ${JSON.stringify({ type: "CONNECTED", message: "Real-time threat stream connected" })}\n\n`);

  req.on("close", () => {
    sseClients.delete(uid);
  });
});

export function broadcastAlert(uid: string, alertData: any) {
  const client = sseClients.get(uid);
  if (client) {
    client.write(`data: ${JSON.stringify(alertData)}\n\n`);
  }
}

export default router;
