import fs from 'fs';
let content = fs.readFileSync('api/index.ts', 'utf8');

const sseCode = `
// SSE for real-time alerts
const clients = new Map<string, any>();

app.get("/api/sse", (req, res) => {
  const uid = req.session?.userId || req.query.uid as string;
  if (!uid) return res.status(401).send("Unauthorized");

  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection", "keep-alive");

  clients.set(uid, res);

  req.on("close", () => {
    clients.delete(uid);
  });
});

export function sendRealtimeAlert(uid: string, alertData: any) {
  const client = clients.get(uid);
  if (client) {
    client.write(\`data: \${JSON.stringify(alertData)}\\n\\n\`);
  }
}

// Start Gmail Watch
app.post("/api/gmail/watch", async (req, res) => {
  const uid = req.session?.userId || req.headers['x-firebase-uid'] as string;
  if (!uid) return res.status(401).json({ error: "Unauthorized" });

  const token = await getValidToken(uid);
  if (!token) return res.status(401).json({ error: "No valid Gmail token" });

  const auth = new google.auth.OAuth2(
    process.env.GOOGLE_CLIENT_ID,
    process.env.GOOGLE_CLIENT_SECRET
  );
  auth.setCredentials({ access_token: token });
  const gmail = google.gmail({ version: "v1", auth });

  try {
    const topicName = process.env.PUBSUB_TOPIC_NAME || "projects/ai-studio-mailverifier/topics/gmail-push";
    const watchRes = await gmail.users.watch({
      userId: "me",
      requestBody: {
        topicName,
        labelIds: ["INBOX"],
      }
    });
    
    await dbService.updateUser(uid, { gmailHistoryId: watchRes.data.historyId } as any);
    res.json({ success: true, historyId: watchRes.data.historyId });
  } catch (err: any) {
    console.error("Failed to start Gmail watch:", err);
    // Ignore error if topic doesn't exist, just return success so frontend doesn't break
    res.json({ success: false, error: err.message });
  }
});

// Pub/Sub Webhook for Gmail Push Notifications
app.post("/api/gmail/webhook", async (req, res) => {
  try {
    const message = req.body.message;
    if (!message || !message.data) {
      return res.status(400).send("Bad Request");
    }

    const data = JSON.parse(Buffer.from(message.data, 'base64').toString('utf8'));
    const emailAddress = data.emailAddress;
    const newHistoryId = data.historyId;

    if (!emailAddress) return res.status(200).send("OK");

    const user = await dbService.getUserByEmail(emailAddress);
    if (!user) return res.status(200).send("User not found");

    const token = await getValidToken(user.id);
    if (!token) return res.status(200).send("OK");

    const auth = new google.auth.OAuth2(
      process.env.GOOGLE_CLIENT_ID,
      process.env.GOOGLE_CLIENT_SECRET
    );
    auth.setCredentials({ access_token: token });
    const gmail = google.gmail({ version: "v1", auth });
    
    // In db, we would store startHistoryId for the user, but we will just fetch the latest history
    // Since we can't reliably know the old historyId without adding it to the db, let's assume we added it.
    const oldHistoryId = (user as any).gmailHistoryId || Math.max(0, parseInt(newHistoryId) - 100).toString();
    
    const historyRes = await gmail.users.history.list({
      userId: "me",
      startHistoryId: oldHistoryId,
      historyTypes: ["messageAdded"]
    });

    if (historyRes.data.history) {
      for (const historyItem of historyRes.data.history) {
        if (historyItem.messagesAdded) {
          for (const msgAdded of historyItem.messagesAdded) {
            const msg = await gmail.users.messages.get({
              userId: "me",
              id: msgAdded.message!.id!,
              format: "full"
            });
            
            // Extract basic fields
            const headers = msg.data.payload?.headers || [];
            const getHeader = (name: string) => headers.find(h => h.name.toLowerCase() === name.toLowerCase())?.value || "";
            
            const emailData = {
              subject: getHeader("subject"),
              senderName: getHeader("from").split("<")[0].trim() || getHeader("from"),
              senderEmail: getHeader("from").match(/<([^>]+)>/)?.[1] || getHeader("from"),
              body: msg.data.snippet || "",
              headers: JSON.stringify(headers)
            };

            // Run analysis
            const aiData = await analyzeEmailHelper(emailData, "SINGLE_EMAIL_VIEW", user.id);
            if (aiData?.ai_risk_engine?.final_risk_classification && 
                ["Suspicious", "Likely Phishing", "Phishing"].includes(aiData.ai_risk_engine.final_risk_classification)) {
              
              sendRealtimeAlert(user.id, {
                type: "THREAT_DETECTED",
                message: \`Suspicious email received from \${emailData.senderEmail}\`,
                classification: aiData.ai_risk_engine.final_risk_classification
              });
            }
          }
        }
      }
    }

    await dbService.updateUser(user.id, { gmailHistoryId: newHistoryId } as any);
    res.status(200).send("OK");
  } catch (err: any) {
    console.error("Webhook error:", err);
    res.status(200).send("OK"); // Acknowledge pub/sub to prevent retries
  }
});

// Cron Endpoint to renew watches
app.get("/api/cron/renew-watches", async (req, res) => {
  const users = await dbService.getAllUsers();
  for (const user of users) {
    const token = await getValidToken(user.id);
    if (token) {
      try {
        const auth = new google.auth.OAuth2(
          process.env.GOOGLE_CLIENT_ID,
          process.env.GOOGLE_CLIENT_SECRET
        );
        auth.setCredentials({ access_token: token });
        const gmail = google.gmail({ version: "v1", auth });
        const topicName = process.env.PUBSUB_TOPIC_NAME || "projects/ai-studio-mailverifier/topics/gmail-push";
        const watchRes = await gmail.users.watch({
          userId: "me",
          requestBody: {
            topicName,
            labelIds: ["INBOX"],
          }
        });
        await dbService.updateUser(user.id, { gmailHistoryId: watchRes.data.historyId } as any);
      } catch(e) {
        // ignore
      }
    }
  }
  res.send("Watches renewed");
});
`;

// Insert the SSE code before app.listen or similar.
const marker = "export interface Subscription {";
content = content.replace("// Custom Local Auth routes", sseCode + "\n// Custom Local Auth routes");

fs.writeFileSync('api/index.ts', content, 'utf8');
