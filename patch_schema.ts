import fs from 'fs';
let content = fs.readFileSync('api/index.ts', 'utf8');

// Change boolean to boolean | string
content = content.replace(/"phishing_domain_match": boolean,/g, '"phishing_domain_match": boolean | "NOT VERIFIED",');
content = content.replace(/"malware_hosting_match": boolean,/g, '"malware_hosting_match": boolean | "NOT VERIFIED",');
content = content.replace(/"spam_reputation_match": boolean,/g, '"spam_reputation_match": boolean | "NOT VERIFIED",');
content = content.replace(/"blacklist_match": boolean/g, '"blacklist_match": boolean | "NOT VERIFIED"');
content = content.replace(/"domain_alignment": boolean/g, '"domain_alignment": boolean | "NOT VERIFIED"');
content = content.replace(/"suspicious_links_detected": boolean,/g, '"suspicious_links_detected": boolean | "NOT VERIFIED",');
content = content.replace(/"url_shortener_used": boolean,/g, '"url_shortener_used": boolean | "NOT VERIFIED",');
content = content.replace(/"homograph_attack_detected": boolean,/g, '"homograph_attack_detected": boolean | "NOT VERIFIED",');
content = content.replace(/"domain_similarity_score": number/g, '"domain_similarity_score": number | "NOT VERIFIED"');

fs.writeFileSync('api/index.ts', content, 'utf8');
