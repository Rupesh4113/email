const fs = require('fs');
let code = fs.readFileSync('api/index.ts', 'utf8');

const regex1 = /try \{\n\s*let inReplyTo = "";\n\s*let references = "";\n\s*if \(replyToMessageId\) \{/;
const replacement1 = `try {
    let inReplyTo = "";
    let references = "";
    let threadId = "";
    if (replyToMessageId) {`;

const regex2 = /if \(msgIdHeader && msgIdHeader\.value\) \{\n\s*inReplyTo = msgIdHeader\.value;\n\s*references = refsHeader && refsHeader\.value \? refsHeader\.value \+ " " \+ inReplyTo : inReplyTo;\n\s*\}/;
const replacement2 = `if (msgIdHeader && msgIdHeader.value) {
          inReplyTo = msgIdHeader.value;
          references = refsHeader && refsHeader.value ? refsHeader.value + " " + inReplyTo : inReplyTo;
        }
        if (origMsg.data.threadId) {
          threadId = origMsg.data.threadId;
        }`;

const regex3 = /const response = await gmail\.users\.messages\.send\(\{\n\s*userId: "me",\n\s*requestBody: \{\n\s*raw: rawMessage,\n\s*\},/;
const replacement3 = `const response = await gmail.users.messages.send({
      userId: "me",
      requestBody: {
        raw: rawMessage,
        ...(threadId ? { threadId } : {})
      },`;

const regex4 = /function buildMimeMessage\(\{([\s\S]*?)attachments = \[\]\n\}\: \{([\s\S]*?)attachments\?: \{ name: string; type: string; data: string \}\[\];\n\}\) \{([\s\S]*?)let header = \[\n\s*`To: \$\{to\}`,\n\s*`Subject: \$\{subject\}`,\n\s*`MIME-Version: 1\.0`,\n\s*`Content-Type: multipart\/mixed; boundary="\$\{boundary\}"`,\n\s*"",\n\s*""\n\s*\]\.join\("\\r\\n"\);/s;

const replacement4 = `function buildMimeMessage({$1attachments = [],\n  inReplyTo = "",\n  references = ""\n}: {$2attachments?: { name: string; type: string; data: string }[];\n  inReplyTo?: string;\n  references?: string;\n}) {$3let headerArr = [
    \`To: \${to}\`,
    \`Subject: \${subject}\`,
    \`MIME-Version: 1.0\`
  ];
  if (inReplyTo) {
    headerArr.push(\`In-Reply-To: \${inReplyTo}\`);
  }
  if (references) {
    headerArr.push(\`References: \${references}\`);
  }
  headerArr.push(\`Content-Type: multipart/mixed; boundary="\${boundary}"\`);
  headerArr.push("");
  headerArr.push("");
  let header = headerArr.join("\\r\\n");`;

if (regex1.test(code) && regex2.test(code) && regex3.test(code) && regex4.test(code)) {
  code = code.replace(regex1, replacement1)
             .replace(regex2, replacement2)
             .replace(regex3, replacement3)
             .replace(regex4, replacement4);
  fs.writeFileSync('api/index.ts', code);
  console.log("Success");
} else {
  console.log("Failed", { r1: regex1.test(code), r2: regex2.test(code), r3: regex3.test(code), r4: regex4.test(code) });
}
