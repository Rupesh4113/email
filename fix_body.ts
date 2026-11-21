import fs from 'fs';
let content = fs.readFileSync('src/App.tsx', 'utf8');

const oldBodyExtraction = `    // Attempt simpler body extraction
    let bodyData = "";
    if (msg.fullData?.payload?.parts) {
      const part =
        msg.fullData.payload.parts.find(
          (p: any) => p.mimeType === "text/plain",
        ) || msg.fullData.payload.parts[0];
      bodyData = part?.body?.data || "";
    } else {
      bodyData = msg.fullData?.payload?.body?.data || "";
    }`;

const newBodyExtraction = `    // More robust body extraction
    const extractBody = (payload: any): string => {
      if (!payload) return "";
      if (payload.body && payload.body.data) return payload.body.data;
      if (payload.parts) {
        for (const part of payload.parts) {
          if (part.mimeType === "text/plain" && part.body?.data) return part.body.data;
        }
        for (const part of payload.parts) {
          if (part.mimeType === "text/html" && part.body?.data) return part.body.data;
        }
        for (const part of payload.parts) {
          if (part.parts) {
            const nested = extractBody(part);
            if (nested) return nested;
          }
        }
      }
      return "";
    };
    let bodyData = extractBody(msg.fullData?.payload);`;

content = content.replace(oldBodyExtraction, newBodyExtraction);
fs.writeFileSync('src/App.tsx', content, 'utf8');
