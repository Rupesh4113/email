const fs = require('fs');
let code = fs.readFileSync('src/App.tsx', 'utf8');
const target = `                                { id: 0, text: "Validating safe card instruments..." },
                                { id: 1, text: "Exchanging secure tokens with gateway..." },
                                { id: 2, text: "Authenticating premium fund clearance..." },
                                { id: 3, text: "Activating premium neural routing cluster..." }`;
const replacement = `                                { id: 0, text: "Initiating Hyparrow Secure Session..." },
                                { id: 1, text: "Tokenizing payment instruments via Hyparrow API..." },
                                { id: 2, text: "Authenticating funds with issuing bank..." },
                                { id: 3, text: "Activating premium neural routing cluster..." }`;
if (code.includes(target)) {
  fs.writeFileSync('src/App.tsx', code.replace(target, replacement));
  console.log('replaced successfully');
} else {
  console.log('target not found');
}
