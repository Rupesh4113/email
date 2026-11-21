import fs from 'fs';
let content = fs.readFileSync('src/App.tsx', 'utf8');

const targetLine = '                                     <div className="flex justify-between items-center"><span className="text-[10px] uppercase font-bold text-navy/50">VPN / Proxy</span><span className={cn("text-xs font-black uppercase tracking-widest", (result?.location_intelligence?.vpn_detected === "NOT VERIFIED" ? "text-orange" : ((result?.location_intelligence?.vpn_detected || result?.location_intelligence?.proxy_detected) ? "text-red-500" : "text-green-500"))}>{(result?.location_intelligence?.vpn_detected === "NOT VERIFIED" ? "NOT VERIFIED" : ((result?.location_intelligence?.vpn_detected || result?.location_intelligence?.proxy_detected) ? "DETECTED" : "CLEAN")}</span></div>';

const fixedLine = '                                     <div className="flex justify-between items-center"><span className="text-[10px] uppercase font-bold text-navy/50">VPN / Proxy</span><span className={cn("text-xs font-black uppercase tracking-widest", result?.location_intelligence?.vpn_detected === "NOT VERIFIED" ? "text-orange" : ((result?.location_intelligence?.vpn_detected || result?.location_intelligence?.proxy_detected) ? "text-red-500" : "text-green-500"))}>{result?.location_intelligence?.vpn_detected === "NOT VERIFIED" ? "NOT VERIFIED" : ((result?.location_intelligence?.vpn_detected || result?.location_intelligence?.proxy_detected) ? "DETECTED" : "CLEAN")}</span></div>';

content = content.replace(targetLine, fixedLine);
fs.writeFileSync('src/App.tsx', content, 'utf8');
