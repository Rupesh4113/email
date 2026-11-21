export interface Subscription {
  plan: string;
  usage: number;
  paymentMethod: string;
  currentPeriodEnd: string | null;
  trialStartDate: string | null;
  invoices: Array<{ id: string; date: string; amount: string; status: "paid" | "pending" }>;
}

export interface User {
  id: string;
  email: string;
  passwordHash: string;
  name: string;
  subscription: Subscription;
  createdAt: string;
  isAdmin?: boolean;
  isSuperAdmin?: boolean;
  isVerified?: boolean;
  verificationToken?: string;
  failedLoginAttempts?: number;
  lockedUntil?: string | null;
}

export interface AdminInvite {
  email: string;
  addedBy: string;
  createdAt: string;
}

export interface ReportAppeal {
  appellantName: string;
  appellantEmail: string;
  appellantRole: string;
  reason: string;
  explanation: string;
  evidenceLinksOrText?: string;
  isVerifiedSenderMatch?: boolean;
  status: "pending" | "approved" | "rejected";
  submittedAt: string;
  reviewedAt?: string;
  reviewedBy?: string;
  reviewNotes?: string;
}

export interface CommunityReport {
  id: string;
  senderDisplayName: string;
  senderEmail: string;
  subject: string;
  recipientEmail?: string;
  dateReceived?: string;
  emailProvider?: string;
  bodyExcerpt?: string;
  suspiciousUrls?: string[];
  headers?: string;
  screenshotUrl?: string;
  reasons: string[];
  userNotes?: string;
  redFlagsObserved?: string[];
  targetBrand?: string;
  isAnonymous?: boolean;
  submittedByUserId?: string;
  submittedByUserEmail?: string;
  status: "pending_review" | "approved" | "rejected";
  moderationNotes?: string;
  reviewedAt?: string;
  reviewedBy?: string;
  hasAppeal?: boolean;
  appeal?: ReportAppeal;
  createdAt: string;
  updatedAt?: string;
}

export interface EmailData {
  id?: string;
  subject: string;
  body: string;
  senderName: string;
  senderEmail: string;
  replyTo?: string;
  headers?: string;
  links?: string;
  snippet?: string;
}

export interface RedFlag {
  flag: string;
  evidence: string;
  why_it_matters: string;
  severity: "Low" | "Medium" | "High" | "Critical";
}

export interface TrustSignal {
  signal: string;
  evidence: string;
}

export interface LinkAnalysis {
  url: string;
  domain: string;
  risk: "Safe" | "Suspicious" | "Malicious";
  note: string;
  is_shortener?: boolean;
  is_ip_host?: boolean;
  is_lookalike?: boolean;
}

export interface TechnicalVerification {
  spf: string;
  dkim: string;
  dmarc: string;
  arc: string;
  ip: string;
  country: string;
  city: string;
  isp: string;
  asn: string;
  hosting_provider: string;
  vpn_detected: boolean;
  proxy_detected: boolean;
  return_path: string;
  reply_to: string;
  message_id: string;
  sender_domain: string;
  dkim_domain: string;
  domain_alignment: boolean | "NOT VERIFIED";
  reply_to_mismatch: boolean;
  attachments_found: string[];
  links_found: LinkAnalysis[];
  dns_records?: {
    has_mx: boolean;
    mx_records: string[];
    spf_record?: string;
    dmarc_record?: string;
    dmarc_policy?: string;
    dns_resolved: boolean;
  };
}

export interface ForensicReport {
  classification: "Safe" | "Likely Safe" | "Suspicious" | "Likely Phishing" | "Phishing";
  risk_score: number;
  severity: "Low" | "Medium" | "High" | "Critical";
  confidence_level: "High" | "Medium" | "Low";
  confidence_explanation: string;
  scoring_breakdown: {
    final_score: number;
    rules_applied: string[];
  };
  red_flags: RedFlag[];
  trust_signals: TrustSignal[];
  sender_identity_assessment: {
    claimed_name: string;
    actual_email: string;
    domain: string;
    name_email_mismatch: boolean;
    brand_impersonation: boolean;
    impersonated_brand: string | null;
    explanation: string;
  };
  domain_and_link_assessment: {
    suspicious_links_detected: boolean;
    links_analyzed: LinkAnalysis[];
    homograph_or_lookalike: boolean;
    shorteners_used: boolean;
    explanation: string;
  };
  authentication_results: {
    spf_record: string;
    dkim_signature: string;
    dmarc_policy: string;
    arc_result: string;
    domain_alignment: boolean | "NOT VERIFIED";
    explanation: string;
  };
  social_engineering_tactics: {
    urgency_tactics: boolean;
    fear_tactics: boolean;
    authority_impersonation: boolean;
    credential_theft_attempt: boolean;
    payment_fraud_attempt: boolean;
    invoice_scam: boolean;
    bec_detected: boolean;
    quoted_phrases: string[];
    explanation: string;
  };
  metadata_and_network_intelligence: {
    ip_address: string;
    country: string;
    city: string;
    isp: string;
    asn: string;
    hosting_provider: string;
    vpn_detected: "DETECTED" | "CLEAN";
    proxy_detected: "DETECTED" | "CLEAN";
    return_path: string;
    reply_to: string;
  };
  recommended_action: string;
  missing_information: string[];
  summary_markdown: string;

  // Backward compatibility fields for legacy UI
  ai_risk_engine?: any;
  sender_identity_analysis?: any;
  authentication_analysis?: any;
  location_intelligence?: any;
  social_engineering_detection?: any;
  threat_intelligence?: any;
  email_metadata_analysis?: any;
}
