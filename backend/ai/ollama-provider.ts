import { EmailData } from "../types.js";

interface ChatMessage {
  role: "user" | "assistant" | "model";
  text: string;
}

export async function answerEmailChatQuery(
  email: EmailData,
  history: ChatMessage[],
  question: string
): Promise<string> {
  const ollamaBaseUrl = process.env.OLLAMA_BASE_URL || "http://localhost:11434";
  const ollamaModel = process.env.OLLAMA_MODEL || "llama3.2";

  const systemPrompt = `You are Mail Verifier AI Q&A Assistant.
Answer questions factually, strictly and solely based on the provided email details.
STRICT RULES:
1. NO EMOJIS: Do not use any emojis whatsoever.
2. STRICTLY FACTUAL: Base your answer on the email headers, body, sender, or links. Never hallucinate.
3. IN-SCOPE REMINDERS: If the question is unrelated to this email or cybersecurity, politely remind the user you are scoped to this email.

EMAIL DETAILS:
- Subject: ${email.subject}
- Sender Name: ${email.senderName || "Unknown"}
- Sender Email: ${email.senderEmail || "Unknown"}
- Body:
${email.body}
`;

  // 1. Try Ollama if running
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 8000);

    const res = await fetch(`${ollamaBaseUrl}/api/generate`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        model: ollamaModel,
        prompt: `${systemPrompt}\n\nUser Question: ${question}\nAnswer:`,
        stream: false,
      }),
      signal: controller.signal,
    });
    clearTimeout(timeout);

    if (res.ok) {
      const data: any = await res.json();
      if (data && data.response) {
        return data.response.trim();
      }
    }
  } catch {
    // Ollama not reachable, fall back to rule-based Q&A engine
  }

  // 2. Open-Source Deterministic Fact-Extraction Engine
  const qLower = question.toLowerCase();
  const bodyLower = (email.body || "").toLowerCase();
  const senderLower = (email.senderEmail || "").toLowerCase();
  const subjectLower = (email.subject || "").toLowerCase();

  if (qLower.includes("safe") || qLower.includes("phishing") || qLower.includes("legit") || qLower.includes("real")) {
    const hasUrgency = /immediate|urgent|within\s*24|suspend/i.test(bodyLower);
    const hasCredential = /password|verify|login|credentials|click here/i.test(bodyLower);
    if (hasUrgency || hasCredential) {
      return `Based on an examination of this email, it contains significant risk factors. The message employs urgency cues and requests action regarding credentials or account status. Sender address is ${email.senderEmail}. Exercise extreme caution and do not click links or enter passwords.`;
    }
    return `Based on the provided email details, the message comes from ${email.senderEmail} regarding "${email.subject}". While no overt credential theft cues were flagged in the raw text, verify sender authenticity out-of-band before taking any action.`;
  }

  if (qLower.includes("sender") || qLower.includes("who sent") || qLower.includes("from")) {
    return `The email was sent by "${email.senderName || "Unknown"}" with the claimed email address <${email.senderEmail}>.`;
  }

  if (qLower.includes("link") || qLower.includes("url") || qLower.includes("website")) {
    const links = (email.body || "").match(/https?:\/\/[^\s<>"']+/gi) || [];
    if (links.length === 0) {
      return "No web links or URLs were detected in the text of this email.";
    }
    return `This email contains ${links.length} link(s): ${links.slice(0, 5).join(", ")}. Do not click links unless the domain is known and verified.`;
  }

  if (qLower.includes("attachment") || qLower.includes("file")) {
    return `Attachments mentioned in headers or text: ${email.headers?.includes("filename") ? "Attachment detected in headers." : "No explicit file attachments found."}`;
  }

  if (qLower.includes("what is this") || qLower.includes("summary") || qLower.includes("about")) {
    return `This email is titled "${email.subject}" from <${email.senderEmail}>. Message excerpt: "${(email.body || "").substring(0, 200)}..."`;
  }

  return `Regarding "${email.subject}" from <${email.senderEmail}>: The email discusses the following content: "${(email.body || "").substring(0, 150)}...". Please specify if you want an assessment of sender legitimacy, links, or specific claims.`;
}
