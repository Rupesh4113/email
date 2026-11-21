const fs = require('fs');
let code = fs.readFileSync('src/App.tsx', 'utf8');

const regex = /onClick=\{\(\) => \{\s*setIsProcessingCheckout\(true\);\s*setPaymentTrackerStep\(0\);\s*handleCheckoutSubmit\(\{ preventDefault: \(\) => \{\} \}\);\s*\}\}/s;
const replacement = `onClick={(e) => {
                                e.preventDefault();
                                handleCheckoutSubmit(e as any);
                              }}`;

if (regex.test(code)) {
  fs.writeFileSync('src/App.tsx', code.replace(regex, replacement));
  console.log('replaced successfully');
} else {
  console.log('target not found');
}
