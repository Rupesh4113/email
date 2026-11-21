import fs from 'fs';
let content = fs.readFileSync('api/index.ts', 'utf8');

const analyzeStr = `app.post("/api/analyze", async (req, res) => {
  const uid = req.session?.userId || req.headers['x-firebase-uid'] as string;
  if (!uid) return res.status(401).json({ error: "Unauthorized" });

  const { data, mode } = req.body;
  if (!data || !mode) return res.status(400).json({ error: "Missing data or mode" });`;

const helperStr = `async function analyzeEmailHelper(data: any, mode: string, uid: string) {
  let prompt = "";

  if (mode === "INBOX_SCAN") {
    const emailList = Array.isArray(data) ? data : [data];
    prompt = \`MODE: INBOX_SCAN
INPUT: A list of emails.
TASK: For EACH email return: classification (Safe, Likely Safe, Suspicious, Likely Phishing, Phishing), risk_score (0–100), severity (Low, Medium, High, Critical), short_reason (max 15 words).
OUTPUT FORMAT: JSON array of objects with keys: subject, sender, classification, risk_score, severity, short_reason.
EMAILS: \${JSON.stringify(emailList.map(e => ({ subject: e.subject, sender_name: e.senderName, sender_email: e.senderEmail, short_snippet: e.body.substring(0, 200) })))}\`;
  } else if (mode === "REALTIME_ALERT") {
    const singleData = Array.isArray(data) ? data[0] : data;
    prompt = \`MODE: REALTIME_ALERT
INPUT: subject, sender_name, sender_email, short_snippet.
TASK: Return a short alert message.
OUTPUT: JSON object with keys: alert_type (Safe, Warning, Danger), message (max 20 words), action_hint (max 10 words).
EMAIL: \${JSON.stringify({ subject: singleData.subject, sender_name: singleData.senderName, sender_email: singleData.senderEmail, short_snippet: singleData.body.substring(0, 200) })}\`;
  } else {
    const singleData = Array.isArray(data) ? data[0] : data;
    const technicalData = await resolveTechnicalData(singleData.headers || "");
    prompt = \`MODE: SINGLE_EMAIL_VIEW
INPUT: subject, full_body, sender_name, sender_email, reply_to, links, headers.
VERIFIED_TECHNICAL_DATA: \${JSON.stringify(technicalData)}
TASK: Perform a complete audit of the email. You will be given pre-verified technical data in VERIFIED_TECHNICAL_DATA. Do not invent or estimate any technical values yourself (like SPF/DKIM, IPs, locations, ISPs, VPNs, or Threat Intel) — only summarize and explain the verified data you are given. If a specific data point was not provided or says "NOT VERIFIED", you MUST output "Not available" or "NOT VERIFIED" rather than estimating it or hallucinating it.
Respond ONLY with a valid JSON object matching this schema. NO Markdown formatting blocks around the JSON.
EMAIL_SUBJECT: \${singleData.subject}
SENDER_NAME: \${singleData.senderName}
SENDER_EMAIL: \${singleData.senderEmail}
REPLY_TO: \${singleData.replyTo || "N/A"}
LINKS: \${singleData.links || "N/A"}
HEADERS: \${singleData.headers || "N/A"}
BODY: \${singleData.body}
Expected JSON Schema:
{
  "email_metadata_analysis": {
    "headers_present": boolean,
    "sender_metadata_extracted": boolean,
    "message_id": string | null,
    "return_path": string | null,
    "reply_to": string | null,
    "sender_domain": string | null,
    "mail_server": string | null,
    "received_header_parsed": boolean
  },
  "location_intelligence": {
    "ip_address": string | null,
    "country": string | null,
    "region": string | null,
    "city": string | null,
    "isp": string | null,
    "asn": string | null,
    "hosting_provider": string | null,
    "vpn_detected": boolean,
    "proxy_detected": boolean,
    "datacenter_detected": boolean
  },
  "sender_identity_analysis": {
    "display_name": string | null,
    "actual_email": string | null,
    "name_domain_mismatch": boolean,
    "executive_impersonation": boolean,
    "brand_impersonation": boolean,
    "new_domain_detected": boolean
  },
  "authentication_analysis": {
    "spf_record": string | "NOT VERIFIED",
    "dkim_signature": string | "NOT VERIFIED",
    "dmarc_policy": string | "NOT VERIFIED",
    "domain_alignment": boolean
  },
  "link_and_content_analysis": {
    "suspicious_links_detected": boolean,
    "url_shortener_used": boolean,
    "homograph_attack_detected": boolean,
    "domain_similarity_score": number
  },
  "email_routing_analysis": {
    "route_tracing_possible": boolean,
    "hop_count": number | null,
    "route_anomaly_detected": boolean
  },
  "threat_intelligence": {
    "phishing_domain_match": boolean,
    "malware_hosting_match": boolean,
    "spam_reputation_match": boolean,
    "blacklist_match": boolean
  },
  "social_engineering_detection": {
    "urgency_tactics": boolean,
    "fear_tactics": boolean,
    "authority_impersonation": boolean,
    "credential_theft_attempt": boolean,
    "payment_fraud_attempt": boolean,
    "invoice_scam": boolean,
    "bec_detected": boolean
  },
  "ai_risk_engine": {
    "trust_score": number,
    "threat_score": number,
    "severity_score": number,
    "likelihood_score": number,
    "confidence_score": number,
    "final_risk_classification": "Safe" | "Likely Safe" | "Suspicious" | "Likely Phishing" | "Phishing"
  },
  "relationship_analysis": {
    "first_time_sender": boolean,
    "historical_trust": string | "NOT VERIFIED"
  },
  "summary_markdown": "string"
}
\`;
  }

  const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
  const modelsToTry = [
    "gemini-2.5-flash",
    "gemini-2.5-flash-8b",
    "gemini-2.0-flash",
    "gemini-1.5-flash",
  ];

  let success = false;
  let responseText = "";
  let lastError = null;

  for (const model of modelsToTry) {
    let attempts = 0;
    const maxAttempts = 2;

    while (attempts < maxAttempts) {
      try {
        const response = await ai.models.generateContent({
          model: model,
          contents: [{ parts: [{ text: prompt }] }],
          config: {
            systemInstruction: SYSTEM_INSTRUCTION,
            temperature: 0.1,
            responseMimeType: "application/json"
          },
        });

        responseText = response.text || "";
        success = true;
        break;
      } catch (err: any) {
        attempts++;
        lastError = err;
        if (attempts < maxAttempts) {
          await new Promise((resolve) => setTimeout(resolve, 500));
        }
      }
    }
    if (success) break;
  }

  if (!success) {
    throw new Error("All AI models failed");
  }

  return JSON.parse(responseText.trim().replace(/^\\s*\`\`\`json/m, "").replace(/\`\`\`\\s*$/m, ""));
}

app.post("/api/analyze", async (req, res) => {
  const uid = req.session?.userId || req.headers['x-firebase-uid'] as string;
  if (!uid) return res.status(401).json({ error: "Unauthorized" });

  const { data, mode } = req.body;
  if (!data || !mode) return res.status(400).json({ error: "Missing data or mode" });

  try {
    const result = await analyzeEmailHelper(data, mode, uid);
    res.json({ result });
  } catch(e: any) {
    res.status(500).json({ error: "AI Analysis failed" });
  }
});
`;

content = content.replace(/app\.post\("\/api\/analyze", async \(req, res\) => \{[\s\S]*?(?=\napp\.post\("\/api\/chat-message")/, helperStr + "\n");
fs.writeFileSync('api/index.ts', content, 'utf8');
