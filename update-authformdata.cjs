const fs = require('fs');
let code = fs.readFileSync('src/App.tsx', 'utf8');

const regex = /const \[authFormData, setAuthFormData\] = useState\(\{[\s\S]*?consent: false,[\s\S]*?\}\);/;
const replacement = `const [authFormData, setAuthFormData] = useState({
    name: "",
    email: "",
    phone: "",
    password: "",
    consent: false,
    rememberMe: false,
  });`;

if (regex.test(code)) {
  fs.writeFileSync('src/App.tsx', code.replace(regex, replacement));
  console.log("Success");
} else {
  console.log("Failed");
}
