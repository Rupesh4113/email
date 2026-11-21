import { LinkAnalysis } from "../types.js";

const TARGET_BRANDS: Record<string, string[]> = {
  PayPal: ["paypal.com", "paypal-communication.com"],
  Microsoft: ["microsoft.com", "office.com", "live.com", "outlook.com", "microsoftonline.com", "office365.com"],
  Google: ["google.com", "accounts.google.com", "gmail.com"],
  Apple: ["apple.com", "icloud.com"],
  Amazon: ["amazon.com", "amazon.co.uk", "amazon.de"],
  Netflix: ["netflix.com"],
  DocuSign: ["docusign.com", "docusign.net"],
  "Bank of America": ["bankofamerica.com"],
  Chase: ["chase.com"],
  "Wells Fargo": ["wellsfargo.com"],
  Dropbox: ["dropbox.com"],
  FedEx: ["fedex.com"],
  DHL: ["dhl.com"],
  UPS: ["ups.com"],
  Adobe: ["adobe.com"],
  Meta: ["facebook.com", "instagram.com", "whatsapp.com"],
  LinkedIn: ["linkedin.com"],
};

const URL_SHORTENERS = new Set([
  "bit.ly",
  "tinyurl.com",
  "t.co",
  "goo.gl",
  "ow.ly",
  "is.gd",
  "buff.ly",
  "rebrand.ly",
  "tiny.cc",
  "cutt.ly",
  "shorturl.at",
  "bl.ink",
  "qr.net",
  "v.gd",
]);

const SUSPICIOUS_TLDS = new Set([
  "xyz",
  "top",
  "work",
  "click",
  "cam",
  "kim",
  "rest",
  "buzz",
  "gq",
  "cf",
  "ml",
  "ga",
  "tk",
  "fit",
  "monster",
]);

function levenshteinDistance(a: string, b: string): number {
  const m = a.length;
  const n = b.length;
  const dp: number[][] = [];

  for (let i = 0; i <= m; i++) dp[i] = [i];
  for (let j = 0; j <= n; j++) dp[0][j] = j;

  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      if (a[i - 1] === b[j - 1]) {
        dp[i][j] = dp[i - 1][j - 1];
      } else {
        dp[i][j] = Math.min(
          dp[i - 1][j] + 1, // deletion
          dp[i][j - 1] + 1, // insertion
          dp[i - 1][j - 1] + 1 // substitution
        );
      }
    }
  }
  return dp[m][n];
}

function normalizeLookalikes(domain: string): string {
  return domain
    .replace(/0/g, "o")
    .replace(/1/g, "l")
    .replace(/rn/g, "m")
    .replace(/vv/g, "w")
    .replace(/[àáâãäå]/g, "a")
    .replace(/[èéêë]/g, "e")
    .replace(/[ìíîï]/g, "i")
    .replace(/[òóôõö]/g, "o")
    .replace(/[ùúûü]/g, "u");
}

export function extractUrls(text: string): string[] {
  if (!text) return [];
  const urls: string[] = [];
  // Match href="..." and src="..."
  const htmlRegex = /(?:href|src)=["'](https?:\/\/[^"'>\s]+)["']/gi;
  let match;
  while ((match = htmlRegex.exec(text)) !== null) {
    if (match[1]) urls.push(match[1]);
  }

  // Match raw URLs in text
  const rawRegex = /(https?:\/\/[^\s<>"'{}|\\^`\[\]]+)/gi;
  while ((match = rawRegex.exec(text)) !== null) {
    if (match[1] && !urls.includes(match[1])) {
      urls.push(match[1]);
    }
  }

  return urls;
}

export function analyzeLinks(urls: string[]): {
  links: LinkAnalysis[];
  hasShortener: boolean;
  hasIpHost: boolean;
  hasLookalike: boolean;
  impersonatedBrand: string | null;
} {
  const result: LinkAnalysis[] = [];
  let hasShortener = false;
  let hasIpHost = false;
  let hasLookalike = false;
  let impersonatedBrand: string | null = null;

  const seenUrls = new Set<string>();

  for (const rawUrl of urls) {
    const trimmed = rawUrl.trim();
    if (seenUrls.has(trimmed)) continue;
    seenUrls.add(trimmed);

    let parsed: URL;
    try {
      parsed = new URL(trimmed);
    } catch {
      continue;
    }

    const hostname = parsed.hostname.toLowerCase();
    const isIpHost = /^(\d{1,3}\.){3}\d{1,3}$/.test(hostname);
    const isShortener = URL_SHORTENERS.has(hostname);
    const tld = hostname.split(".").pop() || "";
    const isSuspiciousTld = SUSPICIOUS_TLDS.has(tld);

    if (isIpHost) hasIpHost = true;
    if (isShortener) hasShortener = true;

    // Check lookalike against brands
    let matchedBrand: string | null = null;
    let isLookalike = false;
    const normalizedHost = normalizeLookalikes(hostname);

    for (const [brand, legitDomains] of Object.entries(TARGET_BRANDS)) {
      const isLegit = legitDomains.some((d) => hostname === d || hostname.endsWith("." + d));
      if (isLegit) continue;

      for (const legit of legitDomains) {
        const legitBase = legit.split(".")[0];
        // Check if domain contains brand name or brand base with typo
        if (
          normalizedHost.includes(legitBase) ||
          hostname.includes(brand.toLowerCase().replace(/\s+/g, ""))
        ) {
          isLookalike = true;
          matchedBrand = brand;
          break;
        }

        // Levenshtein distance check on domain base
        const hostBase = hostname.split(".")[0];
        if (hostBase.length >= 4 && legitBase.length >= 4) {
          const dist = levenshteinDistance(hostBase, legitBase);
          if (dist === 1 || (dist === 2 && hostBase.length >= 7)) {
            isLookalike = true;
            matchedBrand = brand;
            break;
          }
        }
      }
      if (isLookalike) break;
    }

    if (isLookalike) {
      hasLookalike = true;
      if (!impersonatedBrand && matchedBrand) {
        impersonatedBrand = matchedBrand;
      }
    }

    let risk: "Safe" | "Suspicious" | "Malicious" = "Safe";
    let note = "Standard domain structure";

    if (isLookalike) {
      risk = "Malicious";
      note = `Potential typosquatting / homoglyph impersonating ${matchedBrand || "brand"}`;
    } else if (isIpHost) {
      risk = "Malicious";
      note = "URL uses a raw IP address instead of a domain name (high phishing indicator)";
    } else if (isShortener) {
      risk = "Suspicious";
      note = "URL shortening service hides true destination";
    } else if (isSuspiciousTld) {
      risk = "Suspicious";
      note = `Domain uses high-abuse top-level domain (.${tld})`;
    }

    result.push({
      url: trimmed,
      domain: hostname,
      risk,
      note,
      is_shortener: isShortener,
      is_ip_host: isIpHost,
      is_lookalike: isLookalike,
    });
  }

  return {
    links: result,
    hasShortener,
    hasIpHost,
    hasLookalike,
    impersonatedBrand,
  };
}
