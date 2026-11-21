import fs from 'fs';
let content = fs.readFileSync('api/index.ts', 'utf8');

// I will refactor the analyze logic into analyzeEmailHelper
// First let's check what's inside.
