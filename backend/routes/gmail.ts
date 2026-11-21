import { Router, Request, Response } from "express";
import { google } from "googleapis";
import { sqliteDb } from "../db/sqlite.js";
import { getAuthUserId } from "./auth.js";

const router = Router();

const oauth2ClientShared = new google.auth.OAuth2(
  process.env.GOOGLE_CLIENT_ID,
  process.env.GOOGLE_CLIENT_SECRET
);

async function getGmailTokenForUser(uid: string): Promise<string | null> {
  const tokenData = sqliteDb.getGmailToken(uid);
  if (!tokenData) return null;

  if (tokenData.expiry_date && Date.now() >= tokenData.expiry_date - 60000) {
    if (tokenData.refresh_token) {
      try {
        const client = new google.auth.OAuth2(
          process.env.GOOGLE_CLIENT_ID,
          process.env.GOOGLE_CLIENT_SECRET
        );
        client.setCredentials({ refresh_token: tokenData.refresh_token });
        const { credentials } = await client.refreshAccessToken();
        sqliteDb.saveGmailToken(uid, {
          access_token: credentials.access_token || tokenData.access_token,
          refresh_token: credentials.refresh_token || tokenData.refresh_token,
          expiry_date: credentials.expiry_date || null,
        });
        return credentials.access_token || tokenData.access_token;
      } catch (err: any) {
        console.warn("Failed to refresh Gmail token:", err.message);
      }
    }
  }

  return tokenData.access_token;
}

// GET /api/auth/google/url
router.get("/auth/google/url", (req: Request, res: Response): void => {
  const uid = (req.query.uid as string) || getAuthUserId(req) || "";
  const host = req.get("host") || "localhost:3000";
  const protocol = req.protocol === "https" || req.headers["x-forwarded-proto"] === "https" ? "https" : "http";
  const redirectUri = process.env.APP_URL
    ? `${process.env.APP_URL.replace(/\/$/, "")}/auth/callback`
    : `${protocol}://${host}/auth/callback`;

  if (!process.env.GOOGLE_CLIENT_ID) {
    res.json({
      url: `${redirectUri}?code=mock_code&state=${encodeURIComponent(JSON.stringify({ uid, mock: true }))}`,
    });
    return;
  }

  const client = new google.auth.OAuth2(
    process.env.GOOGLE_CLIENT_ID,
    process.env.GOOGLE_CLIENT_SECRET,
    redirectUri
  );

  const url = client.generateAuthUrl({
    access_type: "offline",
    prompt: "consent",
    scope: [
      "https://www.googleapis.com/auth/gmail.readonly",
      "https://www.googleapis.com/auth/gmail.modify",
      "https://www.googleapis.com/auth/gmail.send",
      "https://www.googleapis.com/auth/userinfo.email",
      "https://www.googleapis.com/auth/userinfo.profile",
    ],
    state: JSON.stringify({ uid }),
  });

  res.json({ url });
});

// GET /api/auth/callback and /auth/callback
const callbackHandler = async (req: Request, res: Response): Promise<void> => {
  const { code, state } = req.query;
  let uid: string | null = null;
  let isMock = false;

  try {
    if (state) {
      const parsed = JSON.parse(state as string);
      uid = parsed.uid;
      isMock = Boolean(parsed.mock);
    }
  } catch {}

  if (isMock || !process.env.GOOGLE_CLIENT_ID) {
    if (uid) {
      sqliteDb.saveGmailToken(uid, {
        access_token: "mock_access_token_" + Date.now(),
        refresh_token: "mock_refresh_token",
        expiry_date: Date.now() + 3600000,
      });
    }
    res.send(`
      <html>
        <body>
          <script>
            window.opener && window.opener.postMessage({ type: 'GMAIL_AUTH_SUCCESS' }, '*');
            window.close();
          </script>
          <p>Google authentication complete. You can close this window.</p>
        </body>
      </html>
    `);
    return;
  }

  try {
    const host = req.get("host") || "localhost:3000";
    const protocol = req.protocol === "https" || req.headers["x-forwarded-proto"] === "https" ? "https" : "http";
    const redirectUri = process.env.APP_URL
      ? `${process.env.APP_URL.replace(/\/$/, "")}/auth/callback`
      : `${protocol}://${host}/auth/callback`;

    const client = new google.auth.OAuth2(
      process.env.GOOGLE_CLIENT_ID,
      process.env.GOOGLE_CLIENT_SECRET,
      redirectUri
    );

    const { tokens } = await client.getToken(code as string);
    if (uid && tokens.access_token) {
      sqliteDb.saveGmailToken(uid, {
        access_token: tokens.access_token,
        refresh_token: tokens.refresh_token,
        expiry_date: tokens.expiry_date,
      });
    }

    res.send(`
      <html>
        <body>
          <script>
            window.opener && window.opener.postMessage({ type: 'GMAIL_AUTH_SUCCESS' }, '*');
            window.close();
          </script>
          <p>Authentication successful. You may close this window.</p>
        </body>
      </html>
    `);
  } catch (err: any) {
    console.error("OAuth callback error:", err);
    res.status(500).send("Authentication failed: " + err.message);
  }
};

router.get("/auth/callback", callbackHandler);

// POST /api/auth/store-token
router.post("/auth/store-token", (req: Request, res: Response): void => {
  const uid = getAuthUserId(req);
  const { token } = req.body;
  if (!token || !uid) {
    res.status(400).json({ error: "Missing fields or unauthorized" });
    return;
  }
  sqliteDb.saveGmailToken(uid, token);
  res.json({ success: true });
});

// GET /api/gmail/messages
router.get("/gmail/messages", async (req: Request, res: Response): Promise<void> => {
  const uid = getAuthUserId(req);
  if (!uid) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }

  const token = await getGmailTokenForUser(uid);
  if (!token) {
    res.status(401).json({ error: "No Gmail token found. Please connect your Google account." });
    return;
  }

  // If mock token or no Google client, return mock email list for developer testing
  if (token.startsWith("mock_")) {
    res.json({
      messages: [
        {
          id: "mock_msg_1",
          threadId: "mock_thread_1",
          subject: "Urgent: Verify Your Account Security Immediately",
          sender: "Security Alert <security@paypa1-verify.com>",
          snippet: "Your account will be suspended within 24 hours unless you verify your identity.",
          date: new Date().toISOString(),
          unread: true,
          headers: [
            { name: "From", value: "security@paypa1-verify.com" },
            { name: "Subject", value: "Urgent: Verify Your Account Security Immediately" },
            { name: "Authentication-Results", value: "spf=fail; dkim=fail; dmarc=fail" },
          ],
          body: "Dear Customer, We detected unauthorized access to your account. Click here to confirm your credentials immediately: http://185.220.101.5/login. If not confirmed within 24 hours, your account will be permanently terminated.",
        },
        {
          id: "mock_msg_2",
          threadId: "mock_thread_2",
          subject: "Project weekly sprint review notes",
          sender: "Team Lead <lead@internal-company.com>",
          snippet: "Here are the sprint notes for the current milestone. All systems are operational.",
          date: new Date(Date.now() - 3600000).toISOString(),
          unread: false,
          headers: [
            { name: "From", value: "lead@internal-company.com" },
            { name: "Subject", value: "Project weekly sprint review notes" },
            { name: "Authentication-Results", value: "spf=pass; dkim=pass; dmarc=pass" },
          ],
          body: "Hello team, Great work on the sprint. Please find the attached review notes. Next standup is tomorrow at 10 AM.",
        },
      ],
    });
    return;
  }

  try {
    const client = new google.auth.OAuth2();
    client.setCredentials({ access_token: token });
    const gmail = google.gmail({ version: "v1", auth: client });

    const maxResults = Math.min(parseInt(req.query.maxResults as string) || 10, 25);
    const q = (req.query.q as string) || undefined;
    const pageToken = (req.query.pageToken as string) || undefined;

    const listRes = await gmail.users.messages.list({
      userId: "me",
      maxResults,
      q,
      pageToken,
    });

    const messages = await Promise.all(
      (listRes.data.messages || []).map(async (msg) => {
        try {
          const detail = await gmail.users.messages.get({
            userId: "me",
            id: msg.id!,
            format: "full",
          });

          const headers = detail.data.payload?.headers || [];
          const subject = headers.find((h) => h.name?.toLowerCase() === "subject")?.value || "No Subject";
          const sender = headers.find((h) => h.name?.toLowerCase() === "from")?.value || "Unknown";
          const date = headers.find((h) => h.name?.toLowerCase() === "date")?.value || "";

          // Extract text body
          let bodyText = detail.data.snippet || "";
          if (detail.data.payload?.parts) {
            const textPart = detail.data.payload.parts.find(
              (p) => p.mimeType === "text/plain" || p.mimeType === "text/html"
            );
            if (textPart?.body?.data) {
              bodyText = Buffer.from(textPart.body.data, "base64").toString("utf8");
            }
          }

          return {
            id: msg.id,
            threadId: msg.threadId,
            subject,
            sender,
            snippet: detail.data.snippet,
            date,
            unread: detail.data.labelIds?.includes("UNREAD") ?? false,
            headers,
            body: bodyText,
          };
        } catch {
          return null;
        }
      })
    );

    res.json({
      messages: messages.filter(Boolean),
      nextPageToken: listRes.data.nextPageToken,
    });
  } catch (err: any) {
    res.status(500).json({ error: "Failed to fetch Gmail messages: " + err.message });
  }
});

// POST /api/gmail/mark-read
router.post("/gmail/mark-read", async (req: Request, res: Response): Promise<void> => {
  const uid = getAuthUserId(req);
  if (!uid) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }
  const { messageId } = req.body;
  if (!messageId) {
    res.status(400).json({ error: "Missing messageId" });
    return;
  }

  const token = await getGmailTokenForUser(uid);
  if (!token || token.startsWith("mock_")) {
    res.json({ success: true, mocked: true });
    return;
  }

  try {
    const client = new google.auth.OAuth2();
    client.setCredentials({ access_token: token });
    const gmail = google.gmail({ version: "v1", auth: client });
    await gmail.users.messages.modify({
      userId: "me",
      id: messageId,
      requestBody: { removeLabelIds: ["UNREAD"] },
    });
    res.json({ success: true });
  } catch (err: any) {
    res.status(500).json({ error: err.message || "Failed to mark as read" });
  }
});

// POST /api/gmail/send
router.post("/gmail/send", async (req: Request, res: Response): Promise<void> => {
  const uid = getAuthUserId(req);
  if (!uid) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }
  const { to, subject, body } = req.body;
  if (!to || !subject || !body) {
    res.status(400).json({ error: "Missing required fields (to, subject, body)" });
    return;
  }

  const token = await getGmailTokenForUser(uid);
  if (!token || token.startsWith("mock_")) {
    res.json({ success: true, messageId: "mock_sent_" + Date.now() });
    return;
  }

  try {
    const client = new google.auth.OAuth2();
    client.setCredentials({ access_token: token });
    const gmail = google.gmail({ version: "v1", auth: client });

    const rawMessage = Buffer.from(
      `To: ${to}\r\nSubject: ${subject}\r\nContent-Type: text/plain; charset=utf-8\r\n\r\n${body}`
    )
      .toString("base64")
      .replace(/\+/g, "-")
      .replace(/\//g, "_")
      .replace(/=+$/, "");

    const response = await gmail.users.messages.send({
      userId: "me",
      requestBody: { raw: rawMessage },
    });

    res.json({ success: true, messageId: response.data.id });
  } catch (err: any) {
    res.status(500).json({ error: err.message || "Failed to send email" });
  }
});

export default router;
