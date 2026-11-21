import fs from 'fs';
let content = fs.readFileSync('src/App.tsx', 'utf8');

const regex = /result\?\.authentication_analysis\?\.domain_alignment \? "text-green-500" : "text-red-500"\)/g;
const replacement = 'result?.authentication_analysis?.domain_alignment === "NOT VERIFIED" ? "text-orange" : (result?.authentication_analysis?.domain_alignment ? "text-green-500" : "text-red-500"))';
content = content.replace(regex, replacement);

const regex2 = /result\?\.authentication_analysis\?\.domain_alignment \? "TRUE" : "FALSE"/g;
const replacement2 = 'result?.authentication_analysis?.domain_alignment === "NOT VERIFIED" ? "NOT VERIFIED" : (result?.authentication_analysis?.domain_alignment ? "TRUE" : "FALSE")';
content = content.replace(regex2, replacement2);

fs.writeFileSync('src/App.tsx', content, 'utf8');
