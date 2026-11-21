const fs = require('fs');
let code = fs.readFileSync('api/index.ts', 'utf8');

const regex = /app\.post\("\/api\/gmail\/send", async \(req, res\) => \{\n([\s\S]*?)const \{ to, subject, body, attachments \} = req\.body;\n([\s\S]*?)try \{\n\s*const rawMessage = buildMimeMessage\(\{ to, subject, body, attachments \}\);/s;

const replacement = `app.post("/api/gmail/send", async (req, res) => {
$1const { to, subject, body, attachments, replyToMessageId } = req.body;
$2try {
    let inReplyTo = "";
    let references = "";
    if (replyToMessageId) {
      try {
        const origMsg = await gmail.users.messages.get({ userId: "me", id: replyToMessageId, format: "metadata", metadataHeaders: ["Message-ID", "References"] });
        const headers = origMsg.data.payload?.headers || [];
        const msgIdHeader = headers.find(h => h.name.toLowerCase() === "message-id");
        const refsHeader = headers.find(h => h.name.toLowerCase() === "references");
        if (msgIdHeader && msgIdHeader.value) {
          inReplyTo = msgIdHeader.value;
          references = refsHeader && refsHeader.value ? refsHeader.value + " " + inReplyTo : inReplyTo;
        }
      } catch (e) {
        console.warn("Could not fetch original message for threading", e);
      }
    }
    const rawMessage = buildMimeMessage({ to, subject, body, attachments, inReplyTo, references });`;

if (regex.test(code)) {
  fs.writeFileSync('api/index.ts', code.replace(regex, replacement));
  console.log("Success");
} else {
  console.log("Failed");
}
