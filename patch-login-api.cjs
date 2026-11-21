const fs = require('fs');
let code = fs.readFileSync('src/App.tsx', 'utf8');

const regex = /body: JSON\.stringify\(\{\s*email: authFormData\.email,\s*password: authFormData\.password,\s*\}\),/;
const replacement = `body: JSON.stringify({
          email: authFormData.email,
          password: authFormData.password,
          rememberMe: authFormData.rememberMe,
        }),`;

if (regex.test(code)) {
  fs.writeFileSync('src/App.tsx', code.replace(regex, replacement));
  console.log("Success");
} else {
  console.log("Failed");
}
