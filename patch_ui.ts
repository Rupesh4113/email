import fs from 'fs';
let content = fs.readFileSync('src/App.tsx', 'utf8');

content = content.replace(
  /result\?\.threat_intelligence\?\.malware_hosting_match \? "DETECTED" : "NONE"/g,
  'result?.threat_intelligence?.malware_hosting_match === "NOT VERIFIED" ? "NOT VERIFIED" : (result?.threat_intelligence?.malware_hosting_match ? "DETECTED" : "NONE")'
);

content = content.replace(
  /result\?\.threat_intelligence\?\.malware_hosting_match \? "text-red-500" : "text-navy\/30"/g,
  'result?.threat_intelligence?.malware_hosting_match === "NOT VERIFIED" ? "text-orange" : (result?.threat_intelligence?.malware_hosting_match ? "text-red-500" : "text-navy/30")'
);

content = content.replace(
  /result\?\.location_intelligence\?\.vpn_detected \|\| result\?\.location_intelligence\?\.proxy_detected\) \? "DETECTED" : "CLEAN"/g,
  'result?.location_intelligence?.vpn_detected === "NOT VERIFIED" ? "NOT VERIFIED" : ((result?.location_intelligence?.vpn_detected || result?.location_intelligence?.proxy_detected) ? "DETECTED" : "CLEAN")'
);

content = content.replace(
  /result\?\.location_intelligence\?\.vpn_detected \|\| result\?\.location_intelligence\?\.proxy_detected\) \? "text-red-500" : "text-green-500"/g,
  'result?.location_intelligence?.vpn_detected === "NOT VERIFIED" ? "text-orange" : ((result?.location_intelligence?.vpn_detected || result?.location_intelligence?.proxy_detected) ? "text-red-500" : "text-green-500")'
);

fs.writeFileSync('src/App.tsx', content, 'utf8');
