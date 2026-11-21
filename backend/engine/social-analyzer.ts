export interface SocialEngineeringResult {
  urgency_tactics: boolean;
  fear_tactics: boolean;
  authority_impersonation: boolean;
  credential_theft_attempt: boolean;
  payment_fraud_attempt: boolean;
  invoice_scam: boolean;
  bec_detected: boolean;
  quoted_phrases: string[];
  explanation: string;
}

const URGENCY_PATTERNS = [
  /immediately/i,
  /within\s*(?:24|48|12)\s*hours/i,
  /act\s*now/i,
  /urgent\s*action\s*required/i,
  /immediate\s*attention/i,
  /time\s*sensitive/i,
  /final\s*notice/i,
  /before\s*it(?:'s|\s*is)\s*too\s*late/i,
  /suspended\s*within/i,
  /account\s*(?:will\s*be|has\s*been)\s*suspended/i,
  /deadline\s*is/i,
  /terminate[d]?\s*immediately/i,
];

const FEAR_PATTERNS = [
  /unauthorized\s*access\s*(?:detected|attempt)/i,
  /security\s*breach/i,
  /legal\s*action/i,
  /law\s*enforcement/i,
  /police\s*report/i,
  /court\s*order/i,
  /account\s*restricted/i,
  /security\s*alert:\s*suspicious\s*activity/i,
  /penalty\s*fee/i,
  /compromised/i,
  /arrest\s*warrant/i,
];

const CREDENTIAL_PATTERNS = [
  /verify\s*your\s*(?:account|identity|password|credentials)/i,
  /confirm\s*your\s*(?:login|password|email)/i,
  /update\s*your\s*(?:billing|payment|security)\s*info/i,
  /click\s*here\s*to\s*(?:log\s*in|login|verify|unlock)/i,
  /password\s*has\s*expired/i,
  /reactivate\s*your\s*(?:account|mailbox)/i,
  /sign\s*in\s*to\s*(?:prevent|restore)/i,
  /enter\s*your\s*(?:credentials|passcode|pin)/i,
];

const PAYMENT_INVOICE_PATTERNS = [
  /wire\s*transfer/i,
  /unpaid\s*invoice/i,
  /invoice\s*(?:attached|due|overdue|#\d+)/i,
  /payment\s*(?:confirmation|required|receipt|pending)/i,
  /remittance\s*advice/i,
  /cryptocurrency|bitcoin|usdt|eth\s*wallet/i,
  /gift\s*card/i,
  /bank\s*details\s*have\s*changed/i,
  /new\s*banking\s*instructions/i,
  /purchase\s*order/i,
];

const BEC_AUTHORITY_PATTERNS = [
  /from\s*the\s*ceo/i,
  /chief\s*executive\s*officer/i,
  /cfo|managing\s*director|president/i,
  /confidential\s*transaction/i,
  /are\s*you\s*(?:at\s*your\s*desk|available)/i,
  /need\s*you\s*to\s*process\s*a\s*payment/i,
  /do\s*not\s*discuss\s*with\s*anyone/i,
  /urgent\s*favor/i,
];

export function analyzeSocialEngineering(
  subject: string = "",
  body: string = ""
): SocialEngineeringResult {
  const fullText = `${subject}\n\n${body}`;
  const quoted_phrases: string[] = [];

  let urgency_tactics = false;
  let fear_tactics = false;
  let authority_impersonation = false;
  let credential_theft_attempt = false;
  let payment_fraud_attempt = false;
  let invoice_scam = false;
  let bec_detected = false;

  for (const pat of URGENCY_PATTERNS) {
    const match = fullText.match(pat);
    if (match) {
      urgency_tactics = true;
      if (!quoted_phrases.includes(match[0])) quoted_phrases.push(match[0]);
    }
  }

  for (const pat of FEAR_PATTERNS) {
    const match = fullText.match(pat);
    if (match) {
      fear_tactics = true;
      if (!quoted_phrases.includes(match[0])) quoted_phrases.push(match[0]);
    }
  }

  for (const pat of CREDENTIAL_PATTERNS) {
    const match = fullText.match(pat);
    if (match) {
      credential_theft_attempt = true;
      if (!quoted_phrases.includes(match[0])) quoted_phrases.push(match[0]);
    }
  }

  for (const pat of PAYMENT_INVOICE_PATTERNS) {
    const match = fullText.match(pat);
    if (match) {
      payment_fraud_attempt = true;
      if (/invoice/i.test(match[0])) invoice_scam = true;
      if (!quoted_phrases.includes(match[0])) quoted_phrases.push(match[0]);
    }
  }

  for (const pat of BEC_AUTHORITY_PATTERNS) {
    const match = fullText.match(pat);
    if (match) {
      authority_impersonation = true;
      if (urgency_tactics || payment_fraud_attempt) {
        bec_detected = true;
      }
      if (!quoted_phrases.includes(match[0])) quoted_phrases.push(match[0]);
    }
  }

  // Generate explanation
  const tacticsFound: string[] = [];
  if (urgency_tactics) tacticsFound.push("artificial urgency");
  if (fear_tactics) tacticsFound.push("fear / threat intimidation");
  if (credential_theft_attempt) tacticsFound.push("credential harvesting lures");
  if (payment_fraud_attempt) tacticsFound.push("financial payment or invoice lures");
  if (authority_impersonation) tacticsFound.push("executive / authority impersonation");
  if (bec_detected) tacticsFound.push("Business Email Compromise (BEC) patterns");

  const explanation =
    tacticsFound.length > 0
      ? `Detected ${tacticsFound.join(", ")} designed to manipulate the recipient into taking hasty action.`
      : "No overt psychological pressure or social engineering manipulation tactics were detected.";

  return {
    urgency_tactics,
    fear_tactics,
    authority_impersonation,
    credential_theft_attempt,
    payment_fraud_attempt,
    invoice_scam,
    bec_detected,
    quoted_phrases: quoted_phrases.slice(0, 10),
    explanation,
  };
}
