import fs from 'fs';
let content = fs.readFileSync('api/index.ts', 'utf8');

const analyzeHeader = `app.post("/api/analyze", async (req, res) => {`;
const replacement = `
async function resolveTechnicalData(headersStr: string) {
  const verified = {
    spf: "NOT VERIFIED",
    dkim: "NOT VERIFIED",
    dmarc: "NOT VERIFIED",
    ip: "NOT VERIFIED",
    country: "NOT VERIFIED",
    city: "NOT VERIFIED",
    isp: "NOT VERIFIED",
    asn: "NOT VERIFIED",
    hosting_provider: "NOT VERIFIED",
    vpn_detected: false,
    proxy_detected: false,
    domain_reputation: "NOT VERIFIED"
  };
  if (!headersStr) return verified;

  const spfMatch = headersStr.match(/spf=(pass|fail|softfail|neutral|none)/i);
  if (spfMatch) verified.spf = spfMatch[1].toUpperCase();

  const dkimMatch = headersStr.match(/dkim=(pass|fail|neutral|none)/i);
  if (dkimMatch) verified.dkim = dkimMatch[1].toUpperCase();

  const dmarcMatch = headersStr.match(/dmarc=(pass|fail)/i);
  if (dmarcMatch) verified.dmarc = dmarcMatch[1].toUpperCase();

  const ipMatch = headersStr.match(/\\[([0-9]{1,3}\\.[0-9]{1,3}\\.[0-9]{1,3}\\.[0-9]{1,3})\\]/);
  if (ipMatch) {
    verified.ip = ipMatch[1];
    try {
      // Free IP geolocation API
      const geoRes = await fetch(\`http://ip-api.com/json/\${verified.ip}?fields=status,country,city,isp,as,hosting,proxy\`);
      if (geoRes.ok) {
        const geoData = await geoRes.json();
        if (geoData.status === "success") {
          verified.country = geoData.country || "NOT VERIFIED";
          verified.city = geoData.city || "NOT VERIFIED";
          verified.isp = geoData.isp || "NOT VERIFIED";
          verified.asn = geoData.as || "NOT VERIFIED";
          verified.hosting_provider = geoData.hosting ? "Hosting/Datacenter" : "NOT VERIFIED";
          verified.vpn_detected = !!geoData.proxy;
          verified.proxy_detected = !!geoData.proxy;
        }
      }
    } catch (e) {
      console.warn("Failed to fetch IP geo data", e);
    }
  }
  return verified;
}

app.post("/api/analyze", async (req, res) => {`;

content = content.replace(analyzeHeader, replacement);

const singleEmailTarget = `    prompt = \`MODE: SINGLE_EMAIL_VIEW
INPUT: subject, full_body, sender_name, sender_email, reply_to, links, headers.
TASK: Perform a complete audit of the email. You must extract and analyze the following categories as exhaustively as possible based on the available data. If data for a feature is unavailable, mark it as "NOT VERIFIED" or null.`;

const singleEmailReplacement = `    const technicalData = await resolveTechnicalData(singleData.headers || "");
    prompt = \`MODE: SINGLE_EMAIL_VIEW
INPUT: subject, full_body, sender_name, sender_email, reply_to, links, headers.
VERIFIED_TECHNICAL_DATA: \${JSON.stringify(technicalData)}
TASK: Perform a complete audit of the email. You will be given pre-verified technical data in VERIFIED_TECHNICAL_DATA. Do not invent or estimate any technical values yourself (like SPF/DKIM, IPs, locations, ISPs, VPNs, or Threat Intel) — only summarize and explain the verified data you are given. If a specific data point was not provided or says "NOT VERIFIED", you MUST output "Not available" or "NOT VERIFIED" rather than estimating it or hallucinating it.`;

content = content.replace(singleEmailTarget, singleEmailReplacement);

fs.writeFileSync('api/index.ts', content, 'utf8');
