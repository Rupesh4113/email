import fetch from "node-fetch"; // Assuming fetch is available globally in Node 18+

function parseHeaders(headersStr: string) {
  const verified = {
    spf: "NOT VERIFIED",
    dkim: "NOT VERIFIED",
    dmarc: "NOT VERIFIED",
    ip: "NOT VERIFIED",
  };
  if (!headersStr) return verified;
  
  const spfMatch = headersStr.match(/spf=(pass|fail|softfail|neutral|none)/i);
  if (spfMatch) verified.spf = spfMatch[1].toUpperCase();

  const dkimMatch = headersStr.match(/dkim=(pass|fail|neutral|none)/i);
  if (dkimMatch) verified.dkim = dkimMatch[1].toUpperCase();
  
  const dmarcMatch = headersStr.match(/dmarc=(pass|fail)/i);
  if (dmarcMatch) verified.dmarc = dmarcMatch[1].toUpperCase();

  const ipMatch = headersStr.match(/\[([0-9]{1,3}\.[0-9]{1,3}\.[0-9]{1,3}\.[0-9]{1,3})\]/);
  if (ipMatch) verified.ip = ipMatch[1];
  
  return verified;
}
