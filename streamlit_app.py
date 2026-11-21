import streamlit as st
import sqlite3
import json
import re
import os
import time
from urllib.parse import urlparse
from datetime import datetime

# Set page layout and metadata
st.set_page_config(
    page_title="Mail Verifier AI - Cybersecurity Forensics",
    page_icon="🛡️",
    layout="wide",
    initial_sidebar_state="expanded"
)

# Database path
DATA_DIR = os.path.join(os.getcwd(), "data")
os.makedirs(DATA_DIR, exist_ok=True)
DB_PATH = os.path.join(DATA_DIR, "mailverifier.db")

# Initialize SQLite database
def get_db():
    conn = sqlite3.connect(DB_PATH, check_same_thread=False)
    conn.row_factory = sqlite3.Row
    return conn

def init_db():
    conn = get_db()
    c = conn.cursor()
    c.execute("""
        CREATE TABLE IF NOT EXISTS community_reports (
            id TEXT PRIMARY KEY,
            sender_display_name TEXT,
            sender_email TEXT NOT NULL,
            subject TEXT NOT NULL,
            recipient_email TEXT,
            date_received TEXT,
            email_provider TEXT,
            body_excerpt TEXT,
            suspicious_urls_json TEXT,
            headers TEXT,
            screenshot_url TEXT,
            reasons_json TEXT NOT NULL,
            user_notes TEXT,
            red_flags_json TEXT,
            target_brand TEXT,
            is_anonymous INTEGER DEFAULT 0,
            submitted_by_user_id TEXT,
            submitted_by_user_email TEXT,
            status TEXT DEFAULT 'approved',
            moderation_notes TEXT,
            reviewed_at TEXT,
            reviewed_by TEXT,
            created_at TEXT NOT NULL,
            updated_at TEXT NOT NULL
        )
    """)
    conn.commit()
    conn.close()

init_db()

# Target brands for typosquatting / homoglyph detection
TARGET_BRANDS = {
    "PayPal": ["paypal.com", "paypal-communication.com"],
    "Microsoft": ["microsoft.com", "office.com", "live.com", "outlook.com", "office365.com"],
    "Google": ["google.com", "accounts.google.com", "gmail.com"],
    "Apple": ["apple.com", "icloud.com"],
    "Amazon": ["amazon.com", "amazon.co.uk", "amazon.de"],
    "Netflix": ["netflix.com"],
    "DocuSign": ["docusign.com", "docusign.net"],
    "Bank of America": ["bankofamerica.com"],
    "Chase": ["chase.com"],
    "Wells Fargo": ["wellsfargo.com"],
    "Dropbox": ["dropbox.com"],
    "FedEx": ["fedex.com"],
    "DHL": ["dhl.com"],
    "Meta": ["facebook.com", "instagram.com", "whatsapp.com"],
    "LinkedIn": ["linkedin.com"],
}

URL_SHORTENERS = {
    "bit.ly", "tinyurl.com", "t.co", "goo.gl", "ow.ly", "is.gd",
    "buff.ly", "rebrand.ly", "tiny.cc", "cutt.ly", "shorturl.at"
}

def levenshtein_distance(s1: str, s2: str) -> int:
    if len(s1) < len(s2):
        return levenshtein_distance(s2, s1)
    if len(s2) == 0:
        return len(s1)
    previous_row = range(len(s2) + 1)
    for i, c1 in enumerate(s1):
        current_row = [i + 1]
        for j, c2 in enumerate(s2):
            insertions = previous_row[j + 1] + 1
            deletions = current_row[j] + 1
            substitutions = previous_row[j] + (c1 != c2)
            current_row.append(min(insertions, deletions, substitutions))
        previous_row = current_row
    return previous_row[-1]

def normalize_lookalikes(domain: str) -> str:
    domain = domain.lower()
    subs = {"0": "o", "1": "l", "rn": "m", "vv": "w"}
    for k, v in subs.items():
        domain = domain.replace(k, v)
    return domain

# Live DNS resolver
def check_domain_dns(domain: str):
    result = {
        "resolved": False,
        "has_mx": False,
        "mx_records": [],
        "spf_record": None,
        "dmarc_policy": None
    }
    if not domain or domain == "NOT VERIFIED" or "." not in domain:
        return result

    try:
        import dns.resolver
        # MX Check
        try:
            answers = dns.resolver.resolve(domain, 'MX', lifetime=2)
            result["has_mx"] = True
            result["mx_records"] = [str(r.exchange).rstrip('.') for r in answers]
            result["resolved"] = True
        except Exception:
            pass

        # TXT SPF Check
        try:
            txt_answers = dns.resolver.resolve(domain, 'TXT', lifetime=2)
            result["resolved"] = True
            for r in txt_answers:
                txt_str = "".join([part.decode('utf-8', errors='ignore') if isinstance(part, bytes) else str(part) for part in r.strings])
                if txt_str.lower().startswith("v=spf1"):
                    result["spf_record"] = txt_str
                    break
        except Exception:
            pass

        # DMARC Check
        try:
            dmarc_answers = dns.resolver.resolve(f"_dmarc.{domain}", 'TXT', lifetime=2)
            result["resolved"] = True
            for r in dmarc_answers:
                txt_str = "".join([part.decode('utf-8', errors='ignore') if isinstance(part, bytes) else str(part) for part in r.strings])
                if txt_str.lower().startswith("v=dmarc1"):
                    m = re.search(r'p=(none|quarantine|reject)', txt_str, re.IGNORECASE)
                    if m:
                        result["dmarc_policy"] = m.group(1).upper()
                    break
        except Exception:
            pass
    except Exception:
        pass
    return result

# Forensic Parser
def run_forensic_analysis(subject: str, sender_name: str, sender_email: str, body: str, headers: str = ""):
    score = 0
    rules_applied = []
    red_flags = []
    trust_signals = []

    # 1. Domain extraction
    sender_domain = sender_email.split("@")[1].lower().strip() if "@" in sender_email else "NOT VERIFIED"

    # 2. Header parsing
    spf = "NOT VERIFIED"
    dkim = "NOT VERIFIED"
    dmarc = "NOT VERIFIED"
    reply_to = "NOT VERIFIED"
    reply_to_mismatch = False
    dkim_domain = "NOT VERIFIED"
    attachments_found = []

    if headers:
        spf_m = re.search(r'(?:^|[\s;:])spf=(pass|fail|softfail|neutral|none)', headers, re.IGNORECASE)
        if spf_m:
            spf = spf_m.group(1).upper()

        dkim_m = re.search(r'(?:^|[\s;:])dkim=(pass|fail|neutral|none|temperror|permerror)', headers, re.IGNORECASE)
        if dkim_m:
            dkim = dkim_m.group(1).upper()

        dmarc_m = re.search(r'(?:^|[\s;:])dmarc=(pass|fail|neutral|none|bestguesspass)', headers, re.IGNORECASE)
        if dmarc_m:
            dmarc = dmarc_m.group(1).upper()

        rt_m = re.search(r'^reply-to:\s*<?([^>\r\n]+)>?', headers, re.IGNORECASE | re.MULTILINE)
        if rt_m:
            reply_to = rt_m.group(1).strip()
            if "@" in reply_to and sender_domain != "NOT VERIFIED":
                rt_domain = reply_to.split("@")[1].lower().strip()
                if rt_domain != sender_domain:
                    reply_to_mismatch = True

        dkim_d = re.search(r'(?:header\.i=@|header\.d=|d=)([a-zA-Z0-9.\-_]+)', headers, re.IGNORECASE)
        if dkim_d:
            dkim_domain = dkim_d.group(1).lower().strip()

        att_m = re.findall(r'filename="?([^"\r\n]+)"?', headers, re.IGNORECASE)
        if att_m:
            attachments_found = [a.strip() for a in att_m]

    # DNS check
    dns_info = check_domain_dns(sender_domain)

    # 3. Cryptographic score rules
    if spf == "FAIL":
        score += 25
        rules_applied.append("SPF authentication failed (+25)")
        red_flags.append({"flag": "SPF Authentication Failed", "evidence": f"Header indicates spf=FAIL for {sender_domain}", "severity": "High"})
    elif spf == "SOFTFAIL":
        score += 15
        rules_applied.append("SPF softfail (+15)")
        red_flags.append({"flag": "SPF Softfail", "evidence": f"Header indicates spf=SOFTFAIL for {sender_domain}", "severity": "Medium"})
    elif spf == "PASS":
        trust_signals.append({"signal": "Valid SPF Record", "evidence": f"Sending host authorized by {sender_domain}"})

    if dkim in ["FAIL", "PERMERROR"]:
        score += 25
        rules_applied.append("DKIM cryptographic signature failed (+25)")
        red_flags.append({"flag": "DKIM Verification Failed", "evidence": f"Header indicates dkim={dkim}", "severity": "High"})
    elif dkim == "PASS":
        trust_signals.append({"signal": "Cryptographic DKIM Signature", "evidence": f"Signature verified from {dkim_domain or sender_domain}"})

    if dmarc == "FAIL":
        score += 25
        rules_applied.append("DMARC alignment check failed (+25)")
        red_flags.append({"flag": "DMARC Policy Failure", "evidence": f"DMARC validation failed for {sender_domain}", "severity": "Critical"})
    elif dmarc in ["PASS", "BESTGUESSPASS"]:
        trust_signals.append({"signal": "DMARC Compliant", "evidence": "Domain adheres to published DMARC policy"})

    if reply_to_mismatch:
        score += 25
        rules_applied.append("Reply-To address mismatch (+25)")
        red_flags.append({"flag": "Reply-To Address Mismatch", "evidence": f"From: {sender_domain} vs Reply-To: {reply_to}", "severity": "High"})

    # 4. Link & Typosquatting Analysis
    urls = re.findall(r'https?://[^\s<>"\'{}|\\^`\[\]]+', f"{body} {headers}")
    links_analyzed = []
    has_lookalike = False
    impersonated_brand = None
    has_ip_host = False
    has_shortener = False

    for u in set(urls):
        try:
            parsed = urlparse(u)
            host = parsed.hostname.lower() if parsed.hostname else ""
            is_ip = bool(re.match(r'^(\d{1,3}\.){3}\d{1,3}$', host))
            is_short = host in URL_SHORTENERS
            if is_ip: has_ip_host = True
            if is_short: has_shortener = True

            norm_host = normalize_lookalikes(host)
            brand_matched = None
            is_lookalike = False

            for brand, legit_domains in TARGET_BRANDS.items():
                if any(host == d or host.endswith("." + d) for d in legit_domains):
                    continue
                for legit in legit_domains:
                    legit_base = legit.split(".")[0]
                    if legit_base in norm_host or brand.lower().replace(" ", "") in host:
                        is_lookalike = True
                        brand_matched = brand
                        break
                    host_base = host.split(".")[0]
                    if len(host_base) >= 4 and len(legit_base) >= 4:
                        if levenshtein_distance(host_base, legit_base) <= 1:
                            is_lookalike = True
                            brand_matched = brand
                            break
                if is_lookalike: break

            if is_lookalike:
                has_lookalike = True
                impersonated_brand = brand_matched

            risk = "Safe"
            if is_lookalike or is_ip:
                risk = "Malicious"
            elif is_short:
                risk = "Suspicious"

            links_analyzed.append({"url": u, "domain": host, "risk": risk, "brand": brand_matched})
        except Exception:
            pass

    if has_lookalike:
        score += 35
        rules_applied.append("Typosquatting brand lookalike domain (+35)")
        red_flags.append({"flag": f"Brand Impersonation ({impersonated_brand or 'Target'})", "evidence": f"Lookalike domain detected targeting {impersonated_brand}", "severity": "Critical"})

    if has_ip_host:
        score += 30
        rules_applied.append("Raw IP address used in hyperlink (+30)")
        red_flags.append({"flag": "Raw IP Address Host", "evidence": "URL uses direct IP instead of domain name", "severity": "High"})

    if has_shortener:
        score += 15
        rules_applied.append("Obfuscated URL shortener (+15)")
        red_flags.append({"flag": "URL Shortener Detected", "evidence": "Link destination is masked by shortening service", "severity": "Medium"})

    # 5. Attachment Checks
    if attachments_found:
        dangerous = [".exe", ".scr", ".bat", ".vbs", ".cmd", ".iso", ".img", ".xlsm", ".docm"]
        if any(any(att.lower().endswith(ext) for ext in dangerous) for att in attachments_found):
            score += 40
            rules_applied.append("High-risk executable attachment detected (+40)")
            red_flags.append({"flag": "Dangerous Attachment", "evidence": f"Files: {', '.join(attachments_found)}", "severity": "Critical"})

    # 6. Social Engineering Heuristics
    full_text = f"{subject}\n\n{body}"
    urgency_pats = [r'immediately', r'within\s*(?:24|48|12)\s*hours', r'urgent\s*action', r'account\s*suspended', r'final\s*notice']
    credential_pats = [r'verify\s*your\s*password', r'click\s*here\s*to\s*log\s*in', r'confirm\s*credentials', r'reactivate\s*mailbox', r'enter\s*password']
    payment_pats = [r'wire\s*transfer', r'unpaid\s*invoice', r'invoice\s*overdue', r'cryptocurrency', r'gift\s*card', r'bank\s*details\s*changed']
    bec_pats = [r'from\s*the\s*ceo', r'confidential\s*transaction', r'urgent\s*favor', r'are\s*you\s*at\s*your\s*desk']

    found_urgency = any(re.search(p, full_text, re.IGNORECASE) for p in urgency_pats)
    found_credential = any(re.search(p, full_text, re.IGNORECASE) for p in credential_pats)
    found_payment = any(re.search(p, full_text, re.IGNORECASE) for p in payment_pats)
    found_bec = any(re.search(p, full_text, re.IGNORECASE) for p in bec_pats)

    if found_credential:
        score += 25
        rules_applied.append("Credential theft attempt (+25)")
        red_flags.append({"flag": "Credential Harvesting Lure", "evidence": "Message solicits password, login, or verification", "severity": "Critical"})

    if found_urgency:
        score += 15
        rules_applied.append("Artificial urgency tactic (+15)")
        red_flags.append({"flag": "Artificial Urgency Pressure", "evidence": "Short deadline or suspension threat demanded", "severity": "Medium"})

    if found_payment:
        score += 20
        rules_applied.append("Payment fraud / fake invoice pattern (+20)")
        red_flags.append({"flag": "Payment or Invoice Scam", "evidence": "Wire transfer, overdue invoice, or banking change pattern", "severity": "High"})

    if found_bec:
        score += 20
        rules_applied.append("Executive BEC impersonation (+20)")
        red_flags.append({"flag": "Executive Impersonation (BEC)", "evidence": "Claimed leadership request to bypass standard controls", "severity": "Critical"})

    if spf == "PASS" and dkim == "PASS" and not reply_to_mismatch:
        score = max(0, score - 20)
        rules_applied.append("Clean cryptographic discount (-20)")
        trust_signals.append({"signal": "Aligned Cryptographic Authentication", "evidence": "Both SPF and DKIM signatures verified cleanly"})

    if len(urls) == 0:
        trust_signals.append({"signal": "No External Hyperlinks", "evidence": "Message body contains no external click trackers or links"})

    score = min(100, max(0, score))

    if score >= 80:
        classification = "Phishing"
        severity = "Critical"
    elif score >= 60:
        classification = "Likely Phishing"
        severity = "High"
    elif score >= 35:
        classification = "Suspicious"
        severity = "Medium"
    elif score >= 15:
        classification = "Likely Safe"
        severity = "Low"
    else:
        classification = "Safe"
        severity = "Low"

    return {
        "score": score,
        "classification": classification,
        "severity": severity,
        "rules_applied": rules_applied,
        "red_flags": red_flags,
        "trust_signals": trust_signals,
        "tech": {
            "spf": spf,
            "dkim": dkim,
            "dmarc": dmarc,
            "reply_to": reply_to,
            "reply_to_mismatch": reply_to_mismatch,
            "sender_domain": sender_domain,
            "attachments": attachments_found,
            "links": links_analyzed,
            "dns": dns_info
        }
    }

# Factual Q&A Chat Engine
def answer_forensic_question(subject: str, sender_name: str, sender_email: str, body: str, report: dict, question: str) -> str:
    q = question.lower()
    b = body.lower()

    if any(k in q for k in ["safe", "phishing", "legit", "real", "malicious", "danger"]):
        if report["score"] >= 60:
            return f"This message is classified as **{report['classification']}** with a risk score of **{report['score']}/100** ({report['severity']} severity). Red flags detected include: {', '.join([rf['flag'] for rf in report['red_flags'][:3]])}. Do not click links, open attachments, or send funds."
        else:
            return f"This email is evaluated as **{report['classification']}** (Risk score: {report['score']}/100). Valid trust signals observed: {len(report['trust_signals'])}. Exercise standard caution before sharing sensitive information."

    if any(k in q for k in ["sender", "who sent", "from", "domain"]):
        return f"Claimed sender: **{sender_name or 'Unknown'}** (<{sender_email}>). Sending domain: `{report['tech']['sender_domain']}`. Reply-To mismatch: **{'YES (Flagged)' if report['tech']['reply_to_mismatch'] else 'Aligned'}**."

    if any(k in q for k in ["link", "url", "website"]):
        links = report["tech"]["links"]
        if not links:
            return "No external hyperlinks or click-trackers were detected in this message."
        risky = [l['url'] for l in links if l['risk'] != 'Safe']
        return f"Found {len(links)} link(s). Risky links: {', '.join(risky) if risky else 'None detected as overtly malicious'}."

    if any(k in q for k in ["spf", "dkim", "dmarc", "auth", "header"]):
        return f"Cryptographic Verification:\n- SPF: **{report['tech']['spf']}**\n- DKIM: **{report['tech']['dkim']}**\n- DMARC: **{report['tech']['dmarc']}**\n- Live MX Records: {', '.join(report['tech']['dns']['mx_records']) if report['tech']['dns']['has_mx'] else 'None'}"

    return f"Regarding '{subject}' from {sender_email}: The message discusses: '{body[:200]}...'. Ask about sender legitimacy, links, authentication headers, or threat patterns for specific details."

# Streamlit App Navigation
st.sidebar.image("https://img.icons8.com/fluency/96/shield.png", width=64)
st.sidebar.title("Mail Verifier AI")
st.sidebar.caption("Open-Source Email Forensics & Threat Intelligence")

menu = st.sidebar.radio(
    "Navigation",
    ["🔍 Single Email Audit", "📬 Bulk Inbox Scanner", "🛡️ Threat Intelligence", "💬 Forensic Q&A Assistant"],
    index=0
)

st.sidebar.markdown("---")
st.sidebar.markdown("### ⚙️ Engine Status")
st.sidebar.success("Database: SQLite (`data/mailverifier.db`)")
st.sidebar.info("Forensic Engine: Open-Source Heuristics + Live DNS")

# PRESETS
PRESET_EMAILS = {
    "PayPal Phishing (Lookalike + IP Link)": {
        "subject": "URGENT: Unauthorized login detected - Confirm identity within 24 hours",
        "sender_name": "PayPal Support Desk",
        "sender_email": "security@paypa1-verify.com",
        "body": "Dear Valued Customer,\n\nWe detected unauthorized access to your account from an unknown IP address. To prevent permanent suspension, you must verify your password and credentials immediately within 24 hours:\n\nhttp://185.220.101.5/login\n\nFailure to confirm will lead to immediate account termination.\n\nThank you,\nPayPal Security Team",
        "headers": "From: PayPal Support Desk <security@paypa1-verify.com>\nSubject: URGENT: Unauthorized login detected\nReceived-SPF: fail\ndkim=fail\ndmarc=fail\nReply-To: attacker-harvest@scam-mail.org\nfilename=\"account_statement.exe\""
    },
    "CEO Wire Fraud (BEC Scam)": {
        "subject": "Confidential: Urgent wire transfer request from CEO",
        "sender_name": "Executive Management",
        "sender_email": "ceo@external-relay.xyz",
        "body": "Are you at your desk right now? I need an urgent favor regarding a confidential corporate transaction. Please process an expedited wire transfer of $45,000 to our strategic consultant before 4 PM today. Do not discuss this with anyone in accounting as it is strictly confidential.\n\nSent from my iPhone",
        "headers": "From: Executive Management <ceo@external-relay.xyz>\nSubject: Confidential: Urgent wire transfer request from CEO\nReceived-SPF: softfail\ndkim=fail\ndmarc=fail"
    },
    "Legitimate Corporate Meeting": {
        "subject": "Sprint planning notes and Thursday roadmap sync",
        "sender_name": "Project Lead",
        "sender_email": "lead@company.com",
        "body": "Hello team,\n\nHere are the notes from today's sprint planning session. All milestone objectives are on track for Q4. No urgent action is required before our sync on Thursday.\n\nBest regards,\nEngineering Team",
        "headers": "From: Project Lead <lead@company.com>\nSubject: Sprint planning notes\nReceived-SPF: pass\ndkim=pass; d=company.com\ndmarc=pass\nMessage-ID: <sprint-2026-sync@company.com>"
    }
}

# ----------------- 1. SINGLE EMAIL AUDIT -----------------
if menu == "🔍 Single Email Audit":
    st.title("🔍 Single Email Threat Audit")
    st.markdown("Perform comprehensive, evidence-based cryptographic verification and psychological threat analysis on incoming messages.")

    preset_choice = st.selectbox("Load Sample Email Preset:", ["-- Select or enter custom below --"] + list(PRESET_EMAILS.keys()))

    if preset_choice in PRESET_EMAILS:
        sample = PRESET_EMAILS[preset_choice]
        default_subj = sample["subject"]
        default_sender_name = sample["sender_name"]
        default_sender_email = sample["sender_email"]
        default_body = sample["body"]
        default_headers = sample["headers"]
    else:
        default_subj = ""
        default_sender_name = ""
        default_sender_email = ""
        default_body = ""
        default_headers = ""

    with st.form("audit_form"):
        col1, col2 = st.columns([1, 1])
        with col1:
            sender_name = st.text_input("Sender Display Name", value=default_sender_name, placeholder="e.g. PayPal Security")
            sender_email = st.text_input("Sender Email Address", value=default_sender_email, placeholder="e.g. service@paypa1.com")
            subject = st.text_input("Email Subject", value=default_subj, placeholder="e.g. Urgent verification required")
        with col2:
            headers = st.text_area("Transport Headers (Optional, RFC 5322 format)", value=default_headers, height=125, placeholder="Received-SPF: pass\ndkim=pass\ndmarc=pass")

        body = st.text_area("Full Email Body", value=default_body, height=160, placeholder="Paste email content here...")
        submitted = st.form_submit_button("⚡ Run Forensic Analysis", use_container_width=True)

    if submitted or preset_choice in PRESET_EMAILS:
        if not sender_email or not subject:
            st.warning("Please provide at least a sender email and subject to run the analysis.")
        else:
            with st.spinner("Analyzing cryptographic headers, live DNS records, domain typosquatting, and social engineering lures..."):
                report = run_forensic_analysis(subject, sender_name, sender_email, body, headers)
                st.session_state["current_report"] = report
                st.session_state["current_email"] = {
                    "subject": subject,
                    "sender_name": sender_name,
                    "sender_email": sender_email,
                    "body": body
                }

            # Top Score Bar
            score = report["score"]
            sev = report["severity"]
            cls = report["classification"]

            if score >= 60:
                score_color = "#ef4444"
                status_icon = "🚨"
            elif score >= 35:
                score_color = "#f59e0b"
                status_icon = "⚠️"
            else:
                score_color = "#10b981"
                status_icon = "✅"

            st.markdown(f"""
                <div style="background-color: #131b2e; padding: 20px; border-radius: 12px; border-left: 8px solid {score_color}; margin-bottom: 25px;">
                    <h2 style="margin: 0; color: #f3f4f6;">{status_icon} Classification: <span style="color: {score_color};">{cls}</span></h2>
                    <h4 style="margin: 5px 0 0 0; color: #9ca3af;">Risk Threat Score: <strong style="color: {score_color};">{score}/100</strong> | Severity Level: <strong style="color: {score_color};">{sev}</strong></h4>
                </div>
            """, unsafe_allow_html=True)

            # Quick Metric Columns
            m1, m2, m3, m4, m5 = st.columns(5)
            m1.metric("SPF Status", report["tech"]["spf"])
            m2.metric("DKIM Status", report["tech"]["dkim"])
            m3.metric("DMARC Status", report["tech"]["dmarc"])
            m4.metric("Reply-To Mismatch", "MISMATCH" if report["tech"]["reply_to_mismatch"] else "ALIGNED")
            m5.metric("Detected Red Flags", len(report["red_flags"]))

            st.markdown("---")

            # Red Flags & Trust Signals
            r_col, t_col = st.columns([1, 1])
            with r_col:
                st.subheader("🚩 Specific Red Flags Detected")
                if not report["red_flags"]:
                    st.info("No critical threat indicators or malicious signatures detected.")
                else:
                    for rf in report["red_flags"]:
                        st.error(f"**[{rf['severity']}] {rf['flag']}**\n\n*Evidence:* `{rf['evidence']}`")

            with t_col:
                st.subheader("🛡️ Legitimate Trust Signals")
                if not report["trust_signals"]:
                    st.warning("No verified cryptographic or structural trust signals found.")
                else:
                    for ts in report["trust_signals"]:
                        st.success(f"**{ts['signal']}**\n\n{ts['evidence']}")

            # Links analyzed
            if report["tech"]["links"]:
                st.subheader("🔗 Hyperlinks & Domain Inspection")
                st.dataframe(
                    [{"URL": l["url"], "Domain": l["domain"], "Risk Assessment": l["risk"], "Target Brand": l.get("brand") or "N/A"} for l in report["tech"]["links"]],
                    use_container_width=True
                )

            # Recommended Action
            st.subheader("💡 Recommended Security Actions")
            if score >= 60:
                st.error("• **DO NOT** click any links, open attachments, or reply to this sender.\n• Flag or report this message as malicious phishing immediately.\n• If login credentials were entered, reset passwords on the legitimate corporate portal at once.")
            elif score >= 35:
                st.warning("• Exercise elevated caution with this message.\n• Verify sender identity out-of-band via trusted internal telephone or messaging channels.")
            else:
                st.success("• Sender pattern adheres to standard legitimate email patterns. Standard email vigilance applies.")

# ----------------- 2. BULK INBOX SCANNER -----------------
elif menu == "📬 Bulk Inbox Scanner":
    st.title("📬 Bulk Inbox Threat Scanner")
    st.markdown("Simulate scanning an entire corporate mailbox to categorize and triage risks across multiple messages.")

    sample_inbox = [
        {"subject": PRESET_EMAILS["PayPal Phishing (Lookalike + IP Link)"]["subject"], "sender": PRESET_EMAILS["PayPal Phishing (Lookalike + IP Link)"]["sender_email"], "body": PRESET_EMAILS["PayPal Phishing (Lookalike + IP Link)"]["body"], "headers": PRESET_EMAILS["PayPal Phishing (Lookalike + IP Link)"]["headers"]},
        {"subject": PRESET_EMAILS["CEO Wire Fraud (BEC Scam)"]["subject"], "sender": PRESET_EMAILS["CEO Wire Fraud (BEC Scam)"]["sender_email"], "body": PRESET_EMAILS["CEO Wire Fraud (BEC Scam)"]["body"], "headers": PRESET_EMAILS["CEO Wire Fraud (BEC Scam)"]["headers"]},
        {"subject": PRESET_EMAILS["Legitimate Corporate Meeting"]["subject"], "sender": PRESET_EMAILS["Legitimate Corporate Meeting"]["sender_email"], "body": PRESET_EMAILS["Legitimate Corporate Meeting"]["body"], "headers": PRESET_EMAILS["Legitimate Corporate Meeting"]["headers"]},
        {"subject": "Notice: Quarterly 401(k) retirement statement", "sender": "benefits@fidelity-notifications.com", "body": "Your 401(k) statement is available online. Log in to your employee portal to view.", "headers": "Received-SPF: pass\ndkim=pass\ndmarc=pass"},
        {"subject": "Urgent Invoice #4092 OVERDUE - Wire instructions attached", "sender": "billing@global-vendor-invoices.xyz", "body": "Please find attached the past due invoice. Kindly transfer payment via wire to the updated routing number.", "headers": "Received-SPF: fail\ndkim=fail\nfilename=\"invoice_4092.scr\""}
    ]

    if st.button("🚀 Run Inbox Threat Scan", use_container_width=True):
        results = []
        progress_bar = st.progress(0)
        for idx, item in enumerate(sample_inbox):
            rep = run_forensic_analysis(item["subject"], "", item["sender"], item["body"], item.get("headers", ""))
            results.append({
                "Subject": item["subject"],
                "Sender": item["sender"],
                "Classification": rep["classification"],
                "Risk Score": f"{rep['score']}/100",
                "Severity": rep["severity"],
                "Top Red Flag": rep["red_flags"][0]["flag"] if rep["red_flags"] else "Clean pattern"
            })
            progress_bar.progress((idx + 1) / len(sample_inbox))

        st.subheader(f"📊 Inbox Scan Results ({len(results)} messages)")
        st.dataframe(results, use_container_width=True)

# ----------------- 3. THREAT INTELLIGENCE -----------------
elif menu == "🛡️ Threat Intelligence":
    st.title("🛡️ Community Threat Intelligence")
    st.markdown("Search verified threat records submitted by the cybersecurity community or report a suspicious sender.")

    sub_tab1, sub_tab2, sub_tab3 = st.tabs(["🔎 Search Threat Database", "📝 Report a Suspicious Email", "📋 Check Specific Sender"])

    with sub_tab1:
        st.subheader("Approved Community Threat Feed")
        q = st.text_input("Filter by sender, domain, brand, or keyword:", placeholder="e.g. paypal, wire, suspension...")
        conn = get_db()
        c = conn.cursor()
        if q:
            pattern = f"%{q.lower().strip()}%"
            c.execute("""
                SELECT * FROM community_reports
                WHERE status = 'approved' AND (
                    LOWER(sender_email) LIKE ? OR
                    LOWER(subject) LIKE ? OR
                    LOWER(target_brand) LIKE ? OR
                    LOWER(reasons_json) LIKE ?
                )
                ORDER BY created_at DESC
            """, (pattern, pattern, pattern, pattern))
        else:
            c.execute("SELECT * FROM community_reports WHERE status = 'approved' ORDER BY created_at DESC")
        rows = c.fetchall()
        conn.close()

        if not rows:
            st.info("No reported threats matched your search criteria.")
        else:
            for r in rows:
                reasons = json.loads(r["reasons_json"]) if r["reasons_json"] else []
                with st.expander(f"⚠️ {r['subject']} ({r['sender_email']})"):
                    st.markdown(f"**Target Brand:** `{r['target_brand'] or 'Generic / Unknown'}`")
                    st.markdown(f"**Reasons:** {', '.join(reasons)}")
                    st.markdown(f"**Reported Date:** `{r['created_at']}`")
                    if r["body_excerpt"]:
                        st.markdown(f"**Body Excerpt:**\n> {r['body_excerpt']}")

    with sub_tab2:
        st.subheader("Submit Phishing / Scam Report")
        with st.form("submit_report_form"):
            rep_sender = st.text_input("Sender Email Address*", placeholder="e.g. phishing@malicious-domain.com")
            rep_display = st.text_input("Sender Display Name", placeholder="e.g. PayPal Security")
            rep_subj = st.text_input("Email Subject*", placeholder="e.g. Immediate account action required")
            rep_brand = st.text_input("Impersonated Brand (if any)", placeholder="e.g. PayPal, Microsoft, Netflix")
            rep_reasons = st.multiselect("Observed Indicators*", ["Phishing", "Credential Harvesting", "Brand Impersonation", "Malware Attachment", "Invoice Scam", "BEC Wire Fraud"])
            rep_excerpt = st.text_area("Suspicious Body Excerpt", placeholder="Paste body text or suspicious links...")
            rep_submit = st.form_submit_button("Submit Threat Report")

            if rep_submit:
                if not rep_sender or not rep_subj or not rep_reasons:
                    st.error("Please fill in Sender Email, Subject, and at least one Indicator.")
                else:
                    conn = get_db()
                    c = conn.cursor()
                    report_id = f"rep_{int(time.time())}_{os.urandom(4).hex()}"
                    now_str = datetime.utcnow().isoformat()
                    c.execute("""
                        INSERT INTO community_reports (
                            id, sender_display_name, sender_email, subject,
                            target_brand, reasons_json, body_excerpt,
                            status, created_at, updated_at
                        ) VALUES (?, ?, ?, ?, ?, ?, ?, 'approved', ?, ?)
                    """, (report_id, rep_display, rep_sender.lower().strip(), rep_subj, rep_brand, json.dumps(rep_reasons), rep_excerpt, now_str, now_str))
                    conn.commit()
                    conn.close()
                    st.success(f"Report `{report_id}` successfully submitted to the community threat intelligence database!")

    with sub_tab3:
        st.subheader("Sender Domain Threat Lookup")
        query_email = st.text_input("Enter Email or Domain to check:", placeholder="e.g. paypa1-verify.com")
        if query_email:
            conn = get_db()
            c = conn.cursor()
            pattern = f"%{query_email.lower().strip()}%"
            c.execute("SELECT * FROM community_reports WHERE LOWER(sender_email) LIKE ? AND status = 'approved'", (pattern,))
            matched = c.fetchall()
            conn.close()
            if matched:
                st.error(f"⚠️ **ALERT:** Found {len(matched)} community threat report(s) associated with `{query_email}`!")
                for m in matched:
                    st.markdown(f"- **{m['subject']}** (Reported: `{m['created_at']}`)")
            else:
                st.success(f"✅ No reports found for `{query_email}` in the community database.")

# ----------------- 4. FORENSIC Q&A CHAT -----------------
elif menu == "💬 Forensic Q&A Assistant":
    st.title("💬 Email Forensic Q&A Assistant")
    st.markdown("Ask specific, factual questions regarding an inspected email without hallucinations or emojis.")

    if "current_report" not in st.session_state or "current_email" not in st.session_state:
        st.info("💡 Run an email analysis under **🔍 Single Email Audit** first to enable the Q&A Assistant with context.")
    else:
        email = st.session_state["current_email"]
        report = st.session_state["current_report"]

        st.caption(f"Currently inspecting: **{email['subject']}** (`{email['sender_email']}`) | Risk: **{report['score']}/100**")

        if "messages" not in st.session_state:
            st.session_state.messages = [
                {"role": "assistant", "content": f"I am Mail Verifier AI Q&A Assistant. I have audited '{email['subject']}' from <{email['sender_email']}> (Risk Score: {report['score']}/100, {report['classification']}). How can I assist you with this message?"}
            ]

        for msg in st.session_state.messages:
            with st.chat_message(msg["role"]):
                st.markdown(msg["content"])

        if user_query := st.chat_input("Ask a question about this email (e.g. Is it safe to click links? Who is the real sender?)..."):
            st.session_state.messages.append({"role": "user", "content": user_query})
            with st.chat_message("user"):
                st.markdown(user_query)

            answer = answer_forensic_question(
                email["subject"],
                email["sender_name"],
                email["sender_email"],
                email["body"],
                report,
                user_query
            )

            st.session_state.messages.append({"role": "assistant", "content": answer})
            with st.chat_message("assistant"):
                st.markdown(answer)
