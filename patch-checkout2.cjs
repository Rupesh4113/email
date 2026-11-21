const fs = require('fs');
let code = fs.readFileSync('src/App.tsx', 'utf8');

const regex = /const handleCheckoutSubmit = async \(e: React\.FormEvent\) => \{.*?\};\n\n  const cancelSubscription/s;

const replacement = `const handleCheckoutSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!checkoutPlan) return;

    setIsProcessingCheckout(true);
    setPaymentTrackerStep(0);
    
    try {
      // 1. VISUAL TRACKER (Optional cool UI animation before redirecting)
      await new Promise((resolve) => setTimeout(resolve, 800));
      setPaymentTrackerStep(1);
      await new Promise((resolve) => setTimeout(resolve, 800));
      setPaymentTrackerStep(2);

      // --- 2. REAL HYPARROW INTEGRATION (Implementation Example) ---
      /*
      // Call your Node.js backend to securely generate a checkout session using your secret key
      const response = await fetch('/api/create-hyparrow-checkout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-firebase-uid': user?.id || '' },
        body: JSON.stringify({ plan: checkoutPlan, isAnnual: isAnnual })
      });
      const data = await response.json();
      
      if (data.checkoutUrl) {
        // Redirect the user to the Hyparrow hosted payment page
        window.location.href = data.checkoutUrl;
        return; 
      }
      */
      // -------------------------------------------------------------

      setPaymentTrackerStep(3);
      await new Promise((resolve) => setTimeout(resolve, 800));

      // (Fallback simulation for the AI Studio preview environment)
      setPaymentTrackerStep(4);
      let countdown = 5;
      setTrackerSuccessCountdown(countdown);
      
      const interval = setInterval(() => {
        countdown -= 1;
        setTrackerSuccessCountdown(countdown);
        if (countdown <= 0) {
          clearInterval(interval);
          // Simulate successful return from Hyparrow
          const renewDate = new Date();
          if (isAnnual) renewDate.setFullYear(renewDate.getFullYear() + 1);
          else renewDate.setMonth(renewDate.getMonth() + 1);

          const newInvoice = {
            id: \`INV-\${Math.random().toString(36).substr(2, 9).toUpperCase()}\`,
            date: new Date().toISOString(),
            amount: isAnnual ? 48.00 : 5.00,
            status: "paid" as const,
            plan: checkoutPlan,
          };

          const prevInvoices = subscription.invoices || [];
          setSubscription({
            plan: checkoutPlan,
            usage: subscription.usage,
            paymentMethod: 'Hyparrow Gateway',
            currentPeriodEnd: renewDate.toISOString(),
            trialStartDate: subscription.trialStartDate,
            invoices: [newInvoice, ...prevInvoices],
          });
          setIsProcessingCheckout(false);
          setCheckoutPlan(null);
          setPaymentTrackerStep(-1);
        }
      }, 1000);

    } catch (checkoutErr) {
      console.error("Failed to process payment checkout", checkoutErr);
      alert("Transaction verification failed. Please try again.");
      setIsProcessingCheckout(false);
      setPaymentTrackerStep(-1);
    }
  };

  const cancelSubscription`;

if (regex.test(code)) {
  fs.writeFileSync('src/App.tsx', code.replace(regex, replacement));
  console.log('replaced successfully');
} else {
  console.log('target not found');
}
