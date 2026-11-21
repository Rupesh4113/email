const fs = require('fs');
let code = fs.readFileSync('src/App.tsx', 'utf8');

const targetRegex = /  const handleCheckoutSubmit = async \(e: React\.FormEvent\) => \{.*?\n  \};\n\n  const handleDowngradeToFree/s;
const replacement = `  const handleCheckoutSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!checkoutPlan) return;

    setIsProcessingCheckout(true);
    setPaymentTrackerStep(0);
    
    // Simulate short UI loading then redirect
    setTimeout(() => {
        window.location.href = "https://hyparrow.com/";
    }, 1500);
  };

  const handleDowngradeToFree`;

if (targetRegex.test(code)) {
    fs.writeFileSync('src/App.tsx', code.replace(targetRegex, replacement));
    console.log("Success");
} else {
    console.log("Failed to match regex");
}
