const fs = require('fs');
let code = fs.readFileSync('api/index.ts', 'utf8');

const regex = /app\.post\("\/api\/gmail\/send", async \(req, res\) => \{/;
const replacement = `app.post("/api/gmail/mark-read", async (req, res) => {
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
    console.error("Gmail mark-read error:", error);
    res.status(500).json({ error: error?.message || "Failed to mark as read" });
  }
});

app.post("/api/gmail/send", async (req, res) => {`;

if (regex.test(code)) {
  fs.writeFileSync('api/index.ts', code.replace(regex, replacement));
  console.log("Success");
} else {
  console.log("Failed");
}
