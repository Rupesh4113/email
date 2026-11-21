import crypto from "node:crypto";
import { EmailData, ForensicReport, TechnicalVerification } from "../types.js";
import { parseEmailHeaders } from "./header-parser.js";
import { checkDomainDns } from "./dns-checker.js";
import { extractUrls, analyzeLinks } from "./link-analyzer.js";
import { analyzeSocialEngineering } from "./social-analyzer.js";
import { calculateRiskScore } from "./risk-scorer.js";
import { sqliteDb } from "../db/sqlite.js";

function generateMarkdownReport(
  email: EmailData,
  tech: TechnicalVerification,
  scoreData: any,
  social: any,
  impersonatedBrand: string | null
): string {
  const lines: string[] = [];
  lines.push(`### Forensic Overview`);
  lines.push(`- **Subject:** ${email.subject || "No Subject"}`);
  lines.push(`- **Sender Display:** ${email.senderName || "Unknown"}`);
  lines.push(`- **Sender Email:** \`${email.senderEmail || "Unknown"}\``);
  lines.push(`- **Sender Domain:** \`${tech.sender_domain}\``);
  lines.push(`- **Classification:** **${scoreData.classification}** (Score: **${scoreData.score}/100**)`);
  lines.push(`- **Severity Level:** **${scoreData.severity}**`);
  lines.push("");

  lines.push(`### Specific Red Flags & Detected Threat Patterns`);
  if (scoreData.redFlags.length === 0) {
    lines.push(`No critical red flags or malicious threat signatures were detected in this email.`);
  } else {
    for (const flag of scoreData.redFlags) {
      lines.push(`- **[${flag.severity}] ${flag.flag}:** ${flag.why_it_matters}`);
      lines.push(`  - *Evidence:* \`${flag.evidence}\``);
    }
  }
  lines.push("");

  lines.push(`### Legitimate Signals & Technical Verification`);
  lines.push(`- **SPF Record:** \`${tech.spf}\``);
  lines.push(`- **DKIM Signature:** \`${tech.dkim}\` (Domain: \`${tech.dkim_domain}\`)`);
  lines.push(`- **DMARC Policy:** \`${tech.dmarc}\``);
  lines.push(`- **Domain Alignment:** \`${tech.domain_alignment}\``);
  lines.push(`- **Reply-To Match:** \`${tech.reply_to_mismatch ? "MISMATCH DETECTED" : "ALIGNED"}\``);

  if (tech.dns_records?.dns_resolved) {
    lines.push(`- **Live Domain DNS:** ${tech.dns_records.has_mx ? `Valid MX (${tech.dns_records.mx_records.slice(0, 2).join(", ")})` : "No MX records found"}`);
    if (tech.dns_records.dmarc_policy) {
      lines.push(`- **Published DMARC Policy:** \`${tech.dns_records.dmarc_policy}\``);
    }
  }

  if (scoreData.trustSignals.length > 0) {
    lines.push(`- **Observed Trust Signals:**`);
    for (const sig of scoreData.trustSignals) {
      lines.push(`  - *${sig.signal}:* ${sig.evidence}`);
    }
  }
  lines.push("");

  if (tech.links_found.length > 0) {
    lines.push(`### Hyperlink Analysis (${tech.links_found.length} detected)`);
    for (const link of tech.links_found.slice(0, 10)) {
      lines.push(`- \`${link.url}\` -> **${link.risk}** (${link.note})`);
    }
    lines.push("");
  }

  lines.push(`### Missing & Inconclusive Information`);
  const missing: string[] = [];
  if (!email.headers || tech.spf === "NOT VERIFIED") {
    missing.push("Raw RFC transport headers were not provided or lacked MTA hops; authentication is partially estimated.");
  }
  if (!tech.ip || tech.ip === "NOT VERIFIED") {
    missing.push("Originating client IP could not be extracted from transport headers.");
  }
  missing.push("Live sandbox malware detonation of remote payloads was not performed.");
  for (const m of missing) {
    lines.push(`- ${m}`);
  }
  lines.push("");

  lines.push(`### Recommended Actions`);
  if (scoreData.score >= 60) {
    lines.push(`- **DO NOT** click any links, open attachments, or reply to this sender.`);
    lines.push(`- Mark or report this message as phishing immediately.`);
    lines.push(`- If you previously entered credentials, immediately change your password on the legitimate service site.`);
  } else if (scoreData.score >= 35) {
    lines.push(`- Exercise elevated caution with this message.`);
    lines.push(`- Verify the sender out-of-band via trusted channels before acting on any request.`);
  } else {
    lines.push(`- Standard email caution applies.`);
    lines.push(`- Ensure you only provide credentials on verified HTTPS domains.`);
  }

  return lines.join("\n");
}

export async function runForensicAnalysis(email: EmailData): Promise<ForensicReport> {
  const cacheKey = crypto
    .createHash("sha256")
    .update(
      JSON.stringify({
        id: email.id || "",
        senderName: email.senderName || "",
        senderEmail: email.senderEmail || "",
        subject: email.subject || "",
        body: email.body || "",
        headers: email.headers || "",
      })
    )
    .digest("hex");

  const cached = sqliteDb.getAnalysisCache(cacheKey);
  if (cached) {
    return cached;
  }

  // 1. Technical header parsing
  const tech = parseEmailHeaders(email.headers || "", email.body || "", email.senderEmail || "");

  // 2. Live Open-Source DNS check
  if (tech.sender_domain && tech.sender_domain !== "NOT VERIFIED") {
    try {
      const dnsRes = await checkDomainDns(tech.sender_domain);
      tech.dns_records = {
        has_mx: dnsRes.has_mx,
        mx_records: dnsRes.mx_records,
        spf_record: dnsRes.spf_record || undefined,
        dmarc_record: dnsRes.dmarc_record || undefined,
        dns_resolved: dnsRes.dns_resolved,
      };

      // If headers lacked SPF but DNS has SPF, note it
      if (tech.spf === "NOT VERIFIED" && dnsRes.spf_record) {
        tech.spf = "DNS_RECORD_FOUND";
      }
      if (tech.dmarc === "NOT VERIFIED" && dnsRes.dmarc_policy) {
        tech.dmarc = `DNS_${dnsRes.dmarc_policy}`;
      }
    } catch {}
  }

  // 3. Link extraction and analysis
  const extractedUrls = extractUrls(`${email.links || ""} ${email.body || ""}`);
  const linkAnalysis = analyzeLinks(extractedUrls);
  tech.links_found = linkAnalysis.links;

  // 4. Social engineering heuristics
  const social = analyzeSocialEngineering(email.subject || "", email.body || "");

  // 5. Deterministic scoring
  const scoreData = calculateRiskScore(
    tech,
    social,
    linkAnalysis.impersonatedBrand,
    email.body || ""
  );

  // Confidence calculation
  let confidenceLevel: "High" | "Medium" | "Low" = "High";
  let confidenceExplanation =
    "High confidence: Cryptographic transport headers, sender domain DNS, link targets, and email body were analyzed.";
  if (!email.headers || tech.spf === "NOT VERIFIED") {
    confidenceLevel = "Medium";
    confidenceExplanation =
      "Medium confidence: Raw transport headers were partially available or synthesized; analysis is weighted on body structure, domain DNS, and link heuristics.";
  }
  if (!email.body || email.body.length < 50) {
    confidenceLevel = "Low";
    confidenceExplanation = "Low confidence: Message body is truncated, limiting social engineering evaluation.";
  }

  const markdownSummary = generateMarkdownReport(
    email,
    tech,
    scoreData,
    social,
    linkAnalysis.impersonatedBrand
  );

  const finalReport: ForensicReport = {
    classification: scoreData.classification,
    risk_score: scoreData.score,
    severity: scoreData.severity,
    confidence_level: confidenceLevel,
    confidence_explanation: confidenceExplanation,
    scoring_breakdown: {
      final_score: scoreData.score,
      rules_applied: scoreData.rulesApplied,
    },
    red_flags: scoreData.redFlags,
    trust_signals: scoreData.trustSignals,
    sender_identity_assessment: {
      claimed_name: email.senderName || "Unknown",
      actual_email: email.senderEmail || "Unknown",
      domain: tech.sender_domain,
      name_email_mismatch: tech.reply_to_mismatch,
      brand_impersonation: Boolean(linkAnalysis.impersonatedBrand),
      impersonated_brand: linkAnalysis.impersonatedBrand,
      explanation: linkAnalysis.impersonatedBrand
        ? `Sender appears to impersonate ${linkAnalysis.impersonatedBrand} using lookalike domain features.`
        : `Sender is ${email.senderEmail || "unknown"} with domain ${tech.sender_domain}.`,
    },
    domain_and_link_assessment: {
      suspicious_links_detected: linkAnalysis.links.some((l) => l.risk !== "Safe"),
      links_analyzed: linkAnalysis.links,
      homograph_or_lookalike: linkAnalysis.hasLookalike,
      shorteners_used: linkAnalysis.hasShortener,
      explanation: `${linkAnalysis.links.length} link(s) inspected. ${linkAnalysis.links.filter((l) => l.risk !== "Safe").length} flagged as suspicious or malicious.`,
    },
    authentication_results: {
      spf_record: tech.spf,
      dkim_signature: tech.dkim,
      dmarc_policy: tech.dmarc,
      arc_result: tech.arc,
      domain_alignment: tech.domain_alignment,
      explanation: `SPF: ${tech.spf}, DKIM: ${tech.dkim}, DMARC: ${tech.dmarc}, Alignment: ${tech.domain_alignment}.`,
    },
    social_engineering_tactics: social,
    metadata_and_network_intelligence: {
      ip_address: tech.ip,
      country: tech.country,
      city: tech.city,
      isp: tech.isp,
      asn: tech.asn,
      hosting_provider: tech.hosting_provider,
      vpn_detected: tech.vpn_detected ? "DETECTED" : "CLEAN",
      proxy_detected: tech.proxy_detected ? "DETECTED" : "CLEAN",
      return_path: tech.return_path,
      reply_to: tech.reply_to,
    },
    recommended_action:
      scoreData.score >= 60
        ? "DO NOT interact with this message. Report as phishing immediately."
        : scoreData.score >= 35
        ? "Review sender identity carefully before clicking links or downloading attachments."
        : "Standard caution. Sender appears aligned with normal email patterns.",
    missing_information: [
      "WHOIS registration age not queried via external paid API",
      "No live binary malware sandbox detonation performed on attachments",
    ],
    summary_markdown: markdownSummary,

    // Backward-compatibility adapters for existing frontend UI cards
    ai_risk_engine: {
      final_risk_classification: scoreData.classification,
      threat_score: scoreData.score,
      trust_score: Math.max(0, 100 - scoreData.score),
      severity_score: scoreData.score,
      likelihood_score: scoreData.score,
      confidence_score: confidenceLevel === "High" ? 95 : confidenceLevel === "Medium" ? 70 : 45,
    },
    sender_identity_analysis: {
      display_name: email.senderName,
      actual_email: email.senderEmail,
      sender_trust_score: Math.max(0, 100 - scoreData.score),
      name_domain_mismatch: tech.reply_to_mismatch,
      executive_impersonation: social.authority_impersonation,
      brand_impersonation: Boolean(linkAnalysis.impersonatedBrand),
      spoofing_detected:
        tech.spf === "FAIL" || tech.dkim === "FAIL" || tech.domain_alignment === false,
    },
    authentication_analysis: {
      spf_validation: tech.spf,
      dkim_validation: tech.dkim,
      dmarc_validation: tech.dmarc,
      domain_alignment: tech.domain_alignment,
    },
    location_intelligence: {
      ip_address: tech.ip,
      country: tech.country,
      city: tech.city,
      isp: tech.isp,
      vpn_detected: tech.vpn_detected,
      proxy_detected: tech.proxy_detected,
    },
    social_engineering_detection: {
      urgency_tactics: social.urgency_tactics,
      fear_tactics: social.fear_tactics,
      credential_theft_attempt: social.credential_theft_attempt,
      payment_fraud_attempt: social.payment_fraud_attempt,
      invoice_scam: social.invoice_scam,
    },
    threat_intelligence: {
      phishing_domain_match: linkAnalysis.hasLookalike,
      malware_hosting_match: tech.attachments_found.length > 0,
    },
    email_metadata_analysis: {
      headers_present: Boolean(email.headers),
      sender_metadata_extracted: true,
      message_id: tech.message_id,
      return_path: tech.return_path,
      reply_to: tech.reply_to,
      sender_domain: tech.sender_domain,
    },
  };

  sqliteDb.setAnalysisCache(cacheKey, finalReport);
  return finalReport;
}

export async function runInboxScan(emails: EmailData[]): Promise<any[]> {
  const results = [];
  for (const email of emails) {
    const report = await runForensicAnalysis(email);
    results.push({
      subject: email.subject,
      sender: email.senderEmail,
      classification: report.classification,
      risk_score: report.risk_score,
      severity: report.severity,
      short_reason:
        report.red_flags.length > 0
          ? report.red_flags[0].flag
          : "Verified legitimate sender pattern",
    });
  }
  return results;
}

export async function runRealtimeAlert(email: EmailData): Promise<any> {
  const report = await runForensicAnalysis(email);
  let alert_type: "Safe" | "Warning" | "Danger" = "Safe";
  if (report.risk_score >= 60) alert_type = "Danger";
  else if (report.risk_score >= 35) alert_type = "Warning";

  return {
    alert_type,
    message:
      report.red_flags.length > 0
        ? `Warning: ${report.red_flags[0].flag} detected in message from ${email.senderEmail}`
        : `Email from ${email.senderEmail} passed standard security verification.`,
    action_hint:
      alert_type === "Danger"
        ? "Do not click links"
        : alert_type === "Warning"
        ? "Inspect sender"
        : "Safe to view",
  };
}
