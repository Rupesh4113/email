import { TechnicalVerification, RedFlag, TrustSignal } from "../types.js";
import { SocialEngineeringResult } from "./social-analyzer.js";

export interface RiskScoreResult {
  score: number;
  classification: "Safe" | "Likely Safe" | "Suspicious" | "Likely Phishing" | "Phishing";
  severity: "Low" | "Medium" | "High" | "Critical";
  rulesApplied: string[];
  redFlags: RedFlag[];
  trustSignals: TrustSignal[];
}

export function calculateRiskScore(
  tech: TechnicalVerification,
  social: SocialEngineeringResult,
  impersonatedBrand: string | null = null,
  bodySnippet: string = ""
): RiskScoreResult {
  let score = 0;
  const rulesApplied: string[] = [];
  const redFlags: RedFlag[] = [];
  const trustSignals: TrustSignal[] = [];

  // 1. Authentication evaluation
  if (tech.spf === "FAIL") {
    score += 25;
    rulesApplied.push("SPF authentication failed (+25)");
    redFlags.push({
      flag: "SPF Authentication Failed",
      evidence: `Header indicates 'spf=FAIL' for domain ${tech.sender_domain}`,
      why_it_matters: "The sending mail server is not authorized by the domain's SPF policy to send email on its behalf.",
      severity: "High",
    });
  } else if (tech.spf === "SOFTFAIL") {
    score += 15;
    rulesApplied.push("SPF authentication softfailed (+15)");
    redFlags.push({
      flag: "SPF Softfail",
      evidence: `Header indicates 'spf=SOFTFAIL' for domain ${tech.sender_domain}`,
      why_it_matters: "The sending IP is questionable and does not explicitly match the domain's authorized list.",
      severity: "Medium",
    });
  } else if (tech.spf === "PASS") {
    trustSignals.push({
      signal: "Valid SPF Record",
      evidence: `Sending server IP is authorized by ${tech.sender_domain} SPF policy`,
    });
  }

  if (tech.dkim === "FAIL" || tech.dkim === "PERMERROR") {
    score += 25;
    rulesApplied.push("DKIM cryptographic signature failed (+25)");
    redFlags.push({
      flag: "DKIM Verification Failed",
      evidence: `Header indicates 'dkim=${tech.dkim}'`,
      why_it_matters: "The digital cryptographic signature could not be verified, indicating possible header or body tampering in transit.",
      severity: "High",
    });
  } else if (tech.dkim === "PASS") {
    trustSignals.push({
      signal: "Valid DKIM Signature",
      evidence: `Email body and headers verified with cryptographic signature from ${tech.dkim_domain || tech.sender_domain}`,
    });
  }

  if (tech.dmarc === "FAIL") {
    score += 25;
    rulesApplied.push("DMARC alignment check failed (+25)");
    redFlags.push({
      flag: "DMARC Policy Failure",
      evidence: `DMARC evaluation failed for ${tech.sender_domain}`,
      why_it_matters: "Neither SPF nor DKIM passed and aligned with the From header domain.",
      severity: "Critical",
    });
  } else if (tech.dmarc === "PASS" || tech.dmarc === "BESTGUESSPASS") {
    trustSignals.push({
      signal: "DMARC Compliant",
      evidence: `Sender domain adheres to published DMARC authentication policies`,
    });
  }

  // Domain alignment
  if (tech.domain_alignment === false) {
    score += 20;
    rulesApplied.push("Domain alignment mismatch (+20)");
    redFlags.push({
      flag: "Sender Domain / DKIM Mismatch",
      evidence: `Sender domain '${tech.sender_domain}' does not align with DKIM signing domain '${tech.dkim_domain}'`,
      why_it_matters: "The email may have been relayed or spoofed using a different signing domain.",
      severity: "Medium",
    });
  }

  // Reply-To mismatch
  if (tech.reply_to_mismatch) {
    score += 25;
    rulesApplied.push("Reply-To domain mismatch (+25)");
    redFlags.push({
      flag: "Reply-To Address Mismatch",
      evidence: `From: '${tech.sender_domain}' vs Reply-To: '${tech.reply_to}'`,
      why_it_matters: "Responses will be routed to a completely different email address/domain than the apparent sender, typical of phishing and BEC fraud.",
      severity: "High",
    });
  }

  // 2. Link & URL threat indicators
  const lookalikeLinks = tech.links_found.filter((l) => l.is_lookalike);
  if (lookalikeLinks.length > 0 || impersonatedBrand) {
    score += 35;
    rulesApplied.push("Typosquatting / brand homoglyph domain detected (+35)");
    redFlags.push({
      flag: "Brand Impersonation / Typosquatting Link",
      evidence: `Found lookalike domain '${lookalikeLinks[0]?.domain || "unknown"}' targeting ${impersonatedBrand || "known brand"}`,
      why_it_matters: "Attackers register lookalike domains with subtle typos or visual homoglyphs to trick users into believing they are on a legitimate corporate site.",
      severity: "Critical",
    });
  }

  const ipHostLinks = tech.links_found.filter((l) => l.is_ip_host);
  if (ipHostLinks.length > 0) {
    score += 30;
    rulesApplied.push("Raw IP address used in link URL (+30)");
    redFlags.push({
      flag: "Raw IP Host URL",
      evidence: `Link '${ipHostLinks[0].url}' uses a raw IP address instead of a domain name`,
      why_it_matters: "Legitimate organizations almost never link to raw IP addresses; attackers do this to bypass domain blocklists.",
      severity: "High",
    });
  }

  const shortenerLinks = tech.links_found.filter((l) => l.is_shortener);
  if (shortenerLinks.length > 0) {
    score += 15;
    rulesApplied.push("URL shortener service used in links (+15)");
    redFlags.push({
      flag: "Obfuscated URL Shortener",
      evidence: `Link '${shortenerLinks[0].url}' uses a URL shortener service`,
      why_it_matters: "URL shorteners mask the final destination URL, preventing security inspection.",
      severity: "Medium",
    });
  }

  // 3. Dangerous attachments
  if (tech.attachments_found && tech.attachments_found.length > 0) {
    const dangerousExts = [".exe", ".scr", ".bat", ".vbs", ".cmd", ".iso", ".img", ".xlsm", ".docm"];
    const foundDangerous = tech.attachments_found.some((att) =>
      dangerousExts.some((ext) => att.toLowerCase().endsWith(ext))
    );
    if (foundDangerous) {
      score += 40;
      rulesApplied.push("High-risk executable or script attachment detected (+40)");
      redFlags.push({
        flag: "Dangerous Executable Attachment",
        evidence: `Attachments: ${tech.attachments_found.join(", ")}`,
        why_it_matters: "File types like .exe, .scr, or macro-enabled documents frequently deliver ransomware or trojans.",
        severity: "Critical",
      });
    } else {
      score += 10;
      rulesApplied.push("Archive or file attachment present (+10)");
    }
  }

  // 4. Social engineering tactics
  if (social.credential_theft_attempt) {
    score += 25;
    rulesApplied.push("Credential theft lure detected (+25)");
    redFlags.push({
      flag: "Credential Harvesting Lure",
      evidence: social.quoted_phrases.length > 0 ? `"${social.quoted_phrases[0]}"` : "Body solicits password/login credentials",
      why_it_matters: "Requests asking recipients to verify passwords or enter login details via external links are standard credential phishing tactics.",
      severity: "Critical",
    });
  }

  if (social.urgency_tactics) {
    score += 15;
    rulesApplied.push("Artificial urgency tactic detected (+15)");
    redFlags.push({
      flag: "Artificial Urgency Pressure",
      evidence: social.quoted_phrases.find((q) => /immediately|hours|urgent/i.test(q)) || "Immediate action demanded",
      why_it_matters: "Creating panic and short deadlines forces recipients to bypass normal caution and protocol.",
      severity: "Medium",
    });
  }

  if (social.fear_tactics) {
    score += 15;
    rulesApplied.push("Fear / intimidation tactic detected (+15)");
    redFlags.push({
      flag: "Intimidation & Fear Appeals",
      evidence: social.quoted_phrases.find((q) => /security|breach|legal|unauthorized/i.test(q)) || "Threat of suspension/breach",
      why_it_matters: "Scammers use simulated legal threats or security breach alerts to induce compliance.",
      severity: "Medium",
    });
  }

  if (social.payment_fraud_attempt) {
    score += 20;
    rulesApplied.push("Payment fraud / wire transfer pattern detected (+20)");
    redFlags.push({
      flag: "Financial Scam / Payment Solicitation",
      evidence: social.quoted_phrases.find((q) => /wire|invoice|bitcoin|payment/i.test(q)) || "Payment or invoice request",
      why_it_matters: "Requests to execute wire transfers or pay unverified invoices are primary vectors for invoice fraud.",
      severity: "High",
    });
  }

  if (social.authority_impersonation || social.bec_detected) {
    score += 20;
    rulesApplied.push("Authority / Executive BEC impersonation detected (+20)");
    redFlags.push({
      flag: "Executive / Authority Impersonation (BEC)",
      evidence: social.quoted_phrases.find((q) => /ceo|cfo|executive|confidential/i.test(q)) || "Claimed executive sender",
      why_it_matters: "Impersonating company leadership to bypass approval procedures is a hallmark of Business Email Compromise.",
      severity: "Critical",
    });
  }

  // 5. Trust Signals when clean
  if (tech.spf === "PASS" && tech.dkim === "PASS" && tech.domain_alignment === true) {
    score = Math.max(0, score - 20);
    rulesApplied.push("Cryptographic full alignment discount (-20)");
    trustSignals.push({
      signal: "Strong Cryptographic Alignment",
      evidence: "Both SPF and DKIM pass with full domain alignment",
    });
  }

  if (tech.links_found.length === 0) {
    trustSignals.push({
      signal: "No External Hyperlinks",
      evidence: "Email does not contain external web links or click-trackers",
    });
  }

  // Cap score between 0 and 100
  score = Math.min(100, Math.max(0, score));

  // Determine classification and severity
  let classification: "Safe" | "Likely Safe" | "Suspicious" | "Likely Phishing" | "Phishing";
  let severity: "Low" | "Medium" | "High" | "Critical";

  if (score >= 80) {
    classification = "Phishing";
    severity = "Critical";
  } else if (score >= 60) {
    classification = "Likely Phishing";
    severity = "High";
  } else if (score >= 35) {
    classification = "Suspicious";
    severity = "Medium";
  } else if (score >= 15) {
    classification = "Likely Safe";
    severity = "Low";
  } else {
    classification = "Safe";
    severity = "Low";
  }

  return {
    score,
    classification,
    severity,
    rulesApplied,
    redFlags,
    trustSignals,
  };
}
