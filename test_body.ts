import fs from 'fs';

function extractBody(payload: any): string {
  if (!payload) return "";
  if (payload.body && payload.body.data) {
    return payload.body.data;
  }
  if (payload.parts) {
    for (const part of payload.parts) {
      if (part.mimeType === "text/plain") {
        return part.body?.data || "";
      }
    }
    // If no text/plain, try text/html
    for (const part of payload.parts) {
      if (part.mimeType === "text/html") {
        return part.body?.data || "";
      }
    }
    // If parts contain parts
    for (const part of payload.parts) {
      if (part.parts) {
        const nested = extractBody(part);
        if (nested) return nested;
      }
    }
  }
  return "";
}

console.log("Function created");
