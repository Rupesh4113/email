import fs from 'fs';

function resolveTechnicalData(headersStr: string) {
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
  if (ipMatch) {
    verified.ip = ipMatch[1];
  }
  return verified;
}

const mockHeaders = [
  { name: "Authentication-Results", value: "mx.google.com; dkim=pass header.i=@gmail.com header.s=20230601 header.b=E2sOWDqV; spf=pass (google.com: domain of sender@gmail.com designates 209.85.220.41 as permitted sender) smtp.mailfrom=sender@gmail.com; dmarc=pass (p=NONE sp=QUARANTINE dis=NONE) header.from=gmail.com" },
  { name: "Received", value: "from mail-sor-f41.google.com (mail-sor-f41.google.com. [209.85.220.41]) by mx.google.com" }
];

console.log(resolveTechnicalData(JSON.stringify(mockHeaders, null, 2)));
