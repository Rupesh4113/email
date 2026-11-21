const fs = require('fs');
let code = fs.readFileSync('api/index.ts', 'utf8');

const regex = /maxAge: 30 \* 24 \* 60 \* 60 \* 1000, \/\/ 30 days/;
const replacement = `maxAge: 24 * 60 * 60 * 1000, // 1 day default`;

if (regex.test(code)) {
  fs.writeFileSync('api/index.ts', code.replace(regex, replacement));
  console.log("Success");
} else {
  console.log("Failed");
}
