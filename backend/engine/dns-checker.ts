import dns from "node:dns/promises";

export interface DomainDnsResult {
  domain: string;
  dns_resolved: boolean;
  has_mx: boolean;
  mx_records: string[];
  spf_record: string | null;
  dmarc_record: string | null;
  dmarc_policy: string | null;
  error?: string;
}

export async function checkDomainDns(domain: string): Promise<DomainDnsResult> {
  const result: DomainDnsResult = {
    domain,
    dns_resolved: false,
    has_mx: false,
    mx_records: [],
    spf_record: null,
    dmarc_record: null,
    dmarc_policy: null,
  };

  if (!domain || domain === "NOT VERIFIED" || !domain.includes(".")) {
    return result;
  }

  const cleanDomain = domain.toLowerCase().trim();

  try {
    // 1. Resolve MX records
    try {
      const mx = await dns.resolveMx(cleanDomain);
      if (mx && mx.length > 0) {
        result.has_mx = true;
        result.mx_records = mx.map((m) => m.exchange);
        result.dns_resolved = true;
      }
    } catch (err: any) {
      // No MX record found
    }

    // 2. Resolve TXT records for SPF
    try {
      const txt = await dns.resolveTxt(cleanDomain);
      if (txt && txt.length > 0) {
        result.dns_resolved = true;
        for (const recordArray of txt) {
          const recordStr = recordArray.join("");
          if (recordStr.toLowerCase().startsWith("v=spf1")) {
            result.spf_record = recordStr;
            break;
          }
        }
      }
    } catch (err: any) {
      // No TXT records
    }

    // 3. Resolve TXT records for DMARC at _dmarc.<domain>
    try {
      const dmarcTxt = await dns.resolveTxt(`_dmarc.${cleanDomain}`);
      if (dmarcTxt && dmarcTxt.length > 0) {
        result.dns_resolved = true;
        for (const recordArray of dmarcTxt) {
          const recordStr = recordArray.join("");
          if (recordStr.toLowerCase().startsWith("v=dmarc1")) {
            result.dmarc_record = recordStr;
            const policyMatch = recordStr.match(/p=(none|quarantine|reject)/i);
            if (policyMatch) {
              result.dmarc_policy = policyMatch[1].toUpperCase();
            }
            break;
          }
        }
      }
    } catch (err: any) {
      // No DMARC record
    }

    // 4. Fallback A record check if no MX was found
    if (!result.has_mx) {
      try {
        const aRecords = await dns.resolve4(cleanDomain);
        if (aRecords && aRecords.length > 0) {
          result.dns_resolved = true;
        }
      } catch {}
    }
  } catch (err: any) {
    result.error = err.message;
  }

  return result;
}
