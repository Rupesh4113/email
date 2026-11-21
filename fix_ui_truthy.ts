import fs from 'fs';
let content = fs.readFileSync('src/App.tsx', 'utf8');

// Function to replace boolean checks that evaluate truthy for strings
const fixes = [
  // Authentication
  [
    /result\?\.authentication_analysis\?\.domain_alignment \? "matching" : "mismatched"/g,
    'result?.authentication_analysis?.domain_alignment === "NOT VERIFIED" ? "Not Verified" : (result?.authentication_analysis?.domain_alignment ? "matching" : "mismatched")'
  ],
  // Link & Content
  [
    /result\?\.link_and_content_analysis\?\.suspicious_links_detected \? "DETECTED" : "NONE"/g,
    'result?.link_and_content_analysis?.suspicious_links_detected === "NOT VERIFIED" ? "NOT VERIFIED" : (result?.link_and_content_analysis?.suspicious_links_detected ? "DETECTED" : "NONE")'
  ],
  [
    /result\?\.link_and_content_analysis\?\.suspicious_links_detected \? "text-red-500" : "text-navy\/30"/g,
    'result?.link_and_content_analysis?.suspicious_links_detected === "NOT VERIFIED" ? "text-orange" : (result?.link_and_content_analysis?.suspicious_links_detected ? "text-red-500" : "text-navy/30")'
  ],
  [
    /result\?\.link_and_content_analysis\?\.url_shortener_used \? "DETECTED" : "NONE"/g,
    'result?.link_and_content_analysis?.url_shortener_used === "NOT VERIFIED" ? "NOT VERIFIED" : (result?.link_and_content_analysis?.url_shortener_used ? "DETECTED" : "NONE")'
  ],
  [
    /result\?\.link_and_content_analysis\?\.url_shortener_used \? "text-red-500" : "text-navy\/30"/g,
    'result?.link_and_content_analysis?.url_shortener_used === "NOT VERIFIED" ? "text-orange" : (result?.link_and_content_analysis?.url_shortener_used ? "text-red-500" : "text-navy/30")'
  ],
  // Social Eng & Threat
  [
    /result\?\.social_engineering_detection\?\.urgency_tactics \? "DETECTED" : "NONE"/g,
    'result?.social_engineering_detection?.urgency_tactics === "NOT VERIFIED" ? "NOT VERIFIED" : (result?.social_engineering_detection?.urgency_tactics ? "DETECTED" : "NONE")'
  ],
  [
    /result\?\.social_engineering_detection\?\.urgency_tactics \? "text-orange" : "text-navy\/30"/g,
    'result?.social_engineering_detection?.urgency_tactics === "NOT VERIFIED" ? "text-orange" : (result?.social_engineering_detection?.urgency_tactics ? "text-orange" : "text-navy/30")'
  ],
  [
    /result\?\.social_engineering_detection\?\.credential_theft_attempt \? "DETECTED" : "NONE"/g,
    'result?.social_engineering_detection?.credential_theft_attempt === "NOT VERIFIED" ? "NOT VERIFIED" : (result?.social_engineering_detection?.credential_theft_attempt ? "DETECTED" : "NONE")'
  ],
  [
    /result\?\.social_engineering_detection\?\.credential_theft_attempt \? "text-red-500" : "text-navy\/30"/g,
    'result?.social_engineering_detection?.credential_theft_attempt === "NOT VERIFIED" ? "text-orange" : (result?.social_engineering_detection?.credential_theft_attempt ? "text-red-500" : "text-navy/30")'
  ],
  // Domain Typo
  [
    /result\?\.domain_similarity_detection\?\.typosquatting_detected \? "DETECTED" : "NONE"/g,
    'result?.domain_similarity_detection?.typosquatting_detected === "NOT VERIFIED" ? "NOT VERIFIED" : (result?.domain_similarity_detection?.typosquatting_detected ? "DETECTED" : "NONE")'
  ],
  [
    /result\?\.domain_similarity_detection\?\.typosquatting_detected \? "text-red-500" : "text-navy\/30"/g,
    'result?.domain_similarity_detection?.typosquatting_detected === "NOT VERIFIED" ? "text-orange" : (result?.domain_similarity_detection?.typosquatting_detected ? "text-red-500" : "text-navy/30")'
  ]
];

fixes.forEach(([regex, replacement]) => {
  content = content.replace(regex, replacement as string);
});

fs.writeFileSync('src/App.tsx', content, 'utf8');
