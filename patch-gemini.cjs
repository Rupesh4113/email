const fs = require('fs');
let code = fs.readFileSync('src/lib/gemini.ts', 'utf8');

const regex = /export async function analyzeEmail\(data: EmailData \| EmailData\[\], mode: AnalysisMode = "SINGLE_EMAIL_VIEW"\) \{\n  try \{\n    const res = await fetch\("\/api\/analyze", \{\n      method: "POST",\n      headers: \{\n        "Content-Type": "application\/json",\n      \},\n      body: JSON\.stringify\(\{ data, mode \}\),\n    \}\);/s;

const replacement = `export async function analyzeEmail(data: EmailData | EmailData[], mode: AnalysisMode = "SINGLE_EMAIL_VIEW", uid?: string) {
  try {
    const headers: Record<string, string> = {
      "Content-Type": "application/json",
    };
    if (uid) {
      headers["x-firebase-uid"] = uid;
    }
    const res = await fetch("/api/analyze", {
      method: "POST",
      headers,
      body: JSON.stringify({ data, mode }),
    });`;

if (regex.test(code)) {
  fs.writeFileSync('src/lib/gemini.ts', code.replace(regex, replacement));
  console.log('replaced gemini successfully');
} else {
  console.log('target not found in gemini');
}
