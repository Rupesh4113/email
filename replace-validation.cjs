const fs = require('fs');
let code = fs.readFileSync('src/App.tsx', 'utf8');
const target = `    if (!checkoutCardName || !checkoutCardNo || !checkoutCardExpiry || !checkoutCardCVC) {
      alert("Please enter all required security details for your payment card.");
      return;
    }`;
const replacement = `    // Redirect simulation logic
    // We bypassed local card validation to redirect to Hyparrow`;
if (code.includes(target)) {
  fs.writeFileSync('src/App.tsx', code.replace(target, replacement));
  console.log('replaced successfully');
} else {
  console.log('target not found');
}
