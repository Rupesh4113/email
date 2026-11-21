import fs from 'fs';
let content = fs.readFileSync('api/index.ts', 'utf8');
content = content.replace(
  '3. ESTABLISH UNCERTAINTY: If headers or other metadata are missing or indicate nothing, clearly state "None detected in headers" or "Analysis inconclusive due to missing technical headers" instead of fabricating IP addresses, locations, or findings.',
  '3. ESTABLISH UNCERTAINTY: You will be given pre-verified technical data. Do not invent or estimate any technical values yourself — only summarize and explain the verified data you are given. If a specific data point was not provided to you, you must say "Not available" rather than estimating it.'
);
fs.writeFileSync('api/index.ts', content, 'utf8');
