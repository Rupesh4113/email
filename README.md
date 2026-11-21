# Mail Verifier - Open Source Email Security & Forensic Threat Engine

Mail Verifier is a real-time cybersecurity assistant and forensic intelligence platform designed for phishing detection, domain impersonation inspection, email authentication auditing, and community threat intelligence.

---

## 🚀 Key Highlights & Open-Source Architecture

This repository contains a **100% self-hosted, open-source backend** that operates independently without requiring proprietary cloud infrastructure or paid third-party API keys:

1. **Embedded Open-Source Database: SQLite (Node.js `node:sqlite`)**
   - **Zero external dependencies**: Built directly on native SQLite with Write-Ahead Logging (`WAL` mode) and ACID transaction support.
   - **Persistent Storage**: All user accounts, sessions, moderation reports, appeals, admin invites, and forensic analysis caches reside in `data/mailverifier.db`.
   - **Automatic Schema & Data Migration**: Detects and imports legacy `db.json` data on startup automatically.

2. **Open-Source Forensic Email Analysis Engine**
   - **Cryptographic Header Verification**: RFC 5322 header parser evaluating SPF (`pass`, `fail`, `softfail`, `neutral`), DKIM (`pass`, `fail`, PermError, domain alignment), DMARC policy, and ARC validation.
   - **Live Open-Source DNS Verification**: Standard `node:dns/promises` queries live domain MX records, published SPF TXT records, and DMARC policies (`_dmarc.<domain>`).
   - **Link & Typosquatting Forensics**:
     - Extracts URLs from plain text and HTML bodies.
     - Detects raw IP host URLs (e.g. `http://185.220.101.5/login`).
     - Detects obfuscated URL shorteners (`bit.ly`, `tinyurl.com`, `t.co`, etc.).
     - Detects typosquatting and homoglyph brand impersonation (e.g. `paypa1.com`, `rnicrosoft.com`) using Levenshtein distance and character substitution tables across 50+ major brands.
   - **Social Engineering & Content Heuristics**: Analyzes psychological triggers (artificial urgency, fear appeals, credential harvesting lures, fake invoices, and Executive BEC impersonation).
   - **Deterministic Risk Scoring (0–100)**: Transparent, evidence-based scoring algorithm classifying messages into `Safe`, `Likely Safe`, `Suspicious`, `Likely Phishing`, and `Phishing` with exact red flags and quoted evidence.

3. **Pluggable Open-Source AI / Local LLM Integration**
   - **Ollama & Local Model Support**: Connects to local inference servers (`http://localhost:11434`, e.g. Llama 3, Mistral, Qwen, Phi-3).
   - **Deterministic Factual Fallback Engine**: If no local LLM or API key is active, questions are answered factually from parsed email headers, sender domains, and body contents without hallucination or emojis.
   - **Optional Commercial Cloud Fallback**: Gracefully utilizes Google Gemini if `GEMINI_API_KEY` is provided in `.env`.

4. **Community Threat Database & Appeals**
   - Allows users to report suspicious emails with evidence.
   - Moderation dashboard with approval/rejection workflows.
   - Formal appeals process for domain owners and legitimate senders.
   - Real-time check endpoint (`/api/reports/check?email=...`) to alert users on incoming senders reported by the community.

---

## 📁 Repository Structure

```
├── backend/
│   ├── ai/
│   │   └── ollama-provider.ts    # Open-source Ollama & deterministic Q&A engine
│   ├── db/
│   │   └── sqlite.ts             # Native SQLite database (tables, indexes, migrations)
│   ├── engine/
│   │   ├── dns-checker.ts        # Live DNS MX, SPF, and DMARC resolver
│   │   ├── forensic-engine.ts    # Forensic orchestrator and report generator
│   │   ├── header-parser.ts      # RFC email header and cryptographic status parser
│   │   ├── link-analyzer.ts      # URL extraction, shortener, and typosquatting analysis
│   │   ├── risk-scorer.ts        # Deterministic 0-100 risk scoring & red flag generation
│   │   └── social-analyzer.ts    # Psychological urgency and credential theft heuristics
│   ├── routes/
│   │   ├── admin.ts              # Admin dashboard, users, reports, and invite management
│   │   ├── analyze.ts            # Email forensic analysis & inbox scanning endpoints
│   │   ├── auth.ts               # Registration, bcrypt login, lockout, and sessions
│   │   ├── chat.ts               # Context-locked Q&A assistant endpoint
│   │   ├── gmail.ts              # Gmail messages, OAuth, mark read, and send endpoints
│   │   ├── reports.ts            # Community reports submission, search, and appeals
│   │   └── sse.ts                # Server-Sent Events (SSE) real-time threat stream
│   ├── app.ts                    # Express app configuration & middleware
│   ├── server.ts                 # Standalone backend server entry point
│   └── types.ts                  # Shared TypeScript data contracts
├── api/                          # Backward-compatibility API bridge
├── data/                         # SQLite database file storage (mailverifier.db)
├── src/                          # React 19 + TypeScript + Vite + Tailwind CSS frontend
├── server.ts                     # Full-stack dev & production server
└── package.json                  # Scripts and dependencies
```

---

## 🛠️ Quick Start

### 1. Prerequisites
- Node.js >= 22.5.0 (Recommended: Node 22+ or Node 24 for built-in `node:sqlite`)
- npm

### 2. Installation
```bash
npm install
```

### 3. Environment Configuration
Copy `.env.example` to `.env` (optional - the open-source backend works out of the box with defaults):
```bash
cp .env.example .env
```

### 4. Running the Application

- **Full-stack (Frontend + Backend integrated):**
  ```bash
  npm run dev
  ```
  Starts the full application with Vite HMR at [http://localhost:3000](http://localhost:3000).

- **Standalone Backend Server (API only):**
  ```bash
  npm run backend
  ```
  Starts the modular open-source backend at [http://localhost:3001](http://localhost:3001).

- **Production Build:**
  ```bash
  npm run build
  npm start
  ```

---

## 📡 Core API Endpoints

| Method | Endpoint | Description |
|---|---|---|
| `GET` | `/api/health` | Health check & engine status |
| `POST` | `/api/auth/register` | Register new user account (bcrypt hashed) |
| `POST` | `/api/auth/login` | Login with rate limiting & brute-force lockout |
| `GET` | `/api/auth/me` | Fetch active authenticated session user |
| `POST` | `/api/auth/logout` | Terminate session |
| `POST` | `/api/analyze` | Run open-source forensic analysis (`SINGLE_EMAIL_VIEW`, `INBOX_SCAN`, `REALTIME_ALERT`) |
| `POST` | `/api/chat-message` | Inquire with the AI Q&A assistant about an email |
| `GET` | `/api/reports/public` | Search approved community threat reports |
| `GET` | `/api/reports/check` | Check if sender address/domain has community reports |
| `POST` | `/api/reports` | Submit an email threat report |
| `POST` | `/api/reports/:id/appeal` | Submit appeal for a flagged email report |
| `GET` | `/api/admin/users` | Admin: list all registered users |
| `GET` | `/api/admin/reports` | Admin: list and moderate community reports |
| `GET` | `/api/admin/admins` | Admin: manage admin privileges and invitations |
| `GET` | `/api/sse` | Server-Sent Events stream for real-time security alerts |

---

## 🔒 Security Best Practices
- **Rate Limiting**: Configured across API and authentication endpoints.
- **Lockout Protection**: Accounts are temporarily locked after consecutive failed login attempts.
- **Zero Fabrication**: Analysis reports are strictly evidence-backed based on verified headers, live DNS lookups, link heuristics, and body content.
