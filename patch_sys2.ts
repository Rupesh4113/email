import fs from 'fs';
let content = fs.readFileSync('api/index.ts', 'utf8');
content = content.replace(
  'ESTABLISH UNCERTAINTY: You will be given pre-verified technical data. Do not invent or estimate any technical values yourself — only summarize and explain the verified data you are given. If a specific data point was not provided to you, you must say "Not available" rather than estimating it.',
  'ESTABLISH UNCERTAINTY & ANALYZE CONTENT: You will be given pre-verified technical data. Do not invent technical values (like IPs or DKIM) — use only the verified data provided. However, you MUST deeply analyze the EMAIL BODY content to detect social engineering, urgency tactics, and tone. Do not just output "Safe" statically; provide a unique analysis based on the actual message content.'
);
fs.writeFileSync('api/index.ts', content, 'utf8');
