import { TechnicalVerification } from "../types.js";

function isPrivateIp(ip: string): boolean {
  if (!ip) return true;
  if (ip === "127.0.0.1" || ip === "::1" || ip === "localhost") return true;
  const parts = ip.split(".").map(Number);
  if (parts.length !== 4) return false;
  // 10.0.0.0/8
  if (parts[0] === 10) return true;
  // 172.16.0.0/12
  if (parts[0] === 172 && parts[1] >= 16 && parts[1] <= 31) return true;
  // 192.168.0.0/16
  if (parts[0] === 192 && parts[1] === 168) return true;
  // 169.254.0.0/16 (link local)
  if (parts[0] === 169 && parts[1] === 254) return true;
  return false;
}

export function parseEmailHeaders(
  headersStr: string = "",
  bodyStr: string = "",
  senderEmailStr: string = ""
): TechnicalVerification {
  const verified: TechnicalVerification = {
    spf: "NOT VERIFIED",
    dkim: "NOT VERIFIED",
    dmarc: "NOT VERIFIED",
    arc: "NOT VERIFIED",
    ip: "NOT VERIFIED",
    country: "NOT VERIFIED",
    city: "NOT VERIFIED",
    isp: "NOT VERIFIED",
    asn: "NOT VERIFIED",
    hosting_provider: "NOT VERIFIED",
    vpn_detected: false,
    proxy_detected: false,
    return_path: "NOT VERIFIED",
    reply_to: "NOT VERIFIED",
    message_id: "NOT VERIFIED",
    sender_domain: "NOT VERIFIED",
    dkim_domain: "NOT VERIFIED",
    domain_alignment: "NOT VERIFIED",
    reply_to_mismatch: false,
    attachments_found: [],
    links_found: [],
  };

  // 1. Extract sender domain
  if (senderEmailStr) {
    const sDomain = senderEmailStr.split("@")[1]?.toLowerCase().trim();
    if (sDomain) verified.sender_domain = sDomain;
  }

  // 2. Parse headers string or JSON array
  if (headersStr) {
    let normalized = headersStr;
    try {
      const trimmed = headersStr.trim();
      if (trimmed.startsWith("[")) {
        const parsedHeaders = JSON.parse(trimmed);
        if (Array.isArray(parsedHeaders)) {
          normalized = parsedHeaders
            .filter((h: any) => h && typeof h.name === "string" && typeof h.value === "string")
            .map((h: any) => `${h.name}: ${h.value}`)
            .join("\n");
        }
      }
    } catch {}

    const spfMatch =
      normalized.match(/(?:^|[\s;:])spf=(pass|fail|softfail|neutral|none)/i) ||
      normalized.match(/^Received-SPF:\s*(pass|fail|softfail|neutral|none)/im);
    if (spfMatch) verified.spf = spfMatch[1].toUpperCase();

    const dkimMatch = normalized.match(/(?:^|[\s;:])dkim=(pass|fail|neutral|none|temperror|permerror)/i);
    if (dkimMatch) verified.dkim = dkimMatch[1].toUpperCase();

    const dmarcMatch = normalized.match(/(?:^|[\s;:])dmarc=(pass|fail|neutral|none|bestguesspass)/i);
    if (dmarcMatch) verified.dmarc = dmarcMatch[1].toUpperCase();

    const arcMatch = normalized.match(/(?:^|[\s;:])arc=(pass|fail|none)/i);
    if (arcMatch) verified.arc = arcMatch[1].toUpperCase();

    const returnPathMatch = normalized.match(/^return-path:\s*<?([^>\r\n]+)>?/im);
    if (returnPathMatch) verified.return_path = returnPathMatch[1].trim();

    const replyToMatch = normalized.match(/^reply-to:\s*<?([^>\r\n]+)>?/im);
    if (replyToMatch) {
      verified.reply_to = replyToMatch[1].trim();
      const rtEmailMatch = verified.reply_to.match(/([a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,})/);
      const rtAddr = rtEmailMatch ? rtEmailMatch[1] : verified.reply_to;
      const rtDomain = rtAddr.split("@")[1]?.toLowerCase().trim();
      if (verified.sender_domain !== "NOT VERIFIED" && rtDomain && rtDomain !== verified.sender_domain) {
        verified.reply_to_mismatch = true;
      }
    }

    const msgIdMatch = normalized.match(/^message-id:\s*<?([^>\r\n]+)>?/im);
    if (msgIdMatch) verified.message_id = msgIdMatch[1].trim();

    const dkimDomainMatch =
      normalized.match(/header\.i=@([^\s;]+)/i) ||
      normalized.match(/header\.d=([a-zA-Z0-9.\-_]+)/i) ||
      normalized.match(/\bd=([a-zA-Z0-9.\-_]+)/i);
    if (dkimDomainMatch) {
      verified.dkim_domain = dkimDomainMatch[1].toLowerCase().trim();
    }

    if (verified.sender_domain !== "NOT VERIFIED" && verified.dkim_domain !== "NOT VERIFIED") {
      verified.domain_alignment =
        verified.sender_domain === verified.dkim_domain ||
        verified.sender_domain.endsWith("." + verified.dkim_domain) ||
        verified.dkim_domain.endsWith("." + verified.sender_domain);
    }

    // Attachments detection in headers
    const attachmentMatches = normalized.match(/filename="?([^"\r\n]+)"?/gi);
    if (attachmentMatches) {
      verified.attachments_found = attachmentMatches.map((m) =>
        m.replace(/filename="?/i, "").replace(/"$/, "").trim()
      );
    }

    // Extract Originating / Client IP
    const ipMatch =
      normalized.match(/client-ip=([0-9]{1,3}\.[0-9]{1,3}\.[0-9]{1,3}\.[0-9]{1,3})/i) ||
      normalized.match(/designates\s+([0-9]{1,3}\.[0-9]{1,3}\.[0-9]{1,3}\.[0-9]{1,3})/i) ||
      normalized.match(/sender IP is ([0-9]{1,3}\.[0-9]{1,3}\.[0-9]{1,3}\.[0-9]{1,3})/i) ||
      normalized.match(/Received:\s*from [^\r\n]*\[([0-9]{1,3}\.[0-9]{1,3}\.[0-9]{1,3}\.[0-9]{1,3})\]/i) ||
      normalized.match(/\[([0-9]{1,3}\.[0-9]{1,3}\.[0-9]{1,3}\.[0-9]{1,3})\]/);

    if (ipMatch) {
      const candidateIp = ipMatch[1];
      if (!isPrivateIp(candidateIp)) {
        verified.ip = candidateIp;
      }
    }
  }

  // Also check body for common attachment mentions or encoded filenames
  if (bodyStr) {
    const bodyAttMatch = bodyStr.match(/(?:attachment|attached file|invoice|document):\s*([a-zA-Z0-9_\-.]+\.(exe|scr|bat|vbs|zip|rar|iso|img|xlsm|docm))/gi);
    if (bodyAttMatch) {
      for (const m of bodyAttMatch) {
        const fn = m.split(":")[1]?.trim();
        if (fn && !verified.attachments_found.includes(fn)) {
          verified.attachments_found.push(fn);
        }
      }
    }
  }

  return verified;
}
