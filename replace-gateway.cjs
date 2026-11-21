const fs = require('fs');
let code = fs.readFileSync('src/App.tsx', 'utf8');

const regex = /\{\/\* Hyparrow Visual Gateway Card \*\/\}.*?<\/form>/s;
const replacement = `                            {/* Hyparrow Gateway Notice */}
                            <div className="bg-navy/[0.03] p-6 rounded-3xl border border-navy/10 text-center space-y-4 mb-6">
                              <ShieldCheck className="w-8 h-8 text-orange mx-auto opacity-50" />
                              <p className="text-xs font-semibold text-navy/70 leading-relaxed max-w-sm mx-auto">
                                You will be redirected to the secure Hyparrow payment platform to complete your transaction.
                              </p>
                            </div>

                            <button
                              onClick={() => {
                                setIsProcessingCheckout(true);
                                setPaymentTrackerStep(0);
                                handleCheckoutSubmit({ preventDefault: () => {} });
                              }}
                              className="w-full bg-navy text-orange hover:bg-navy/95 py-4 rounded-2xl font-black uppercase tracking-widest text-xs transition-all shadow-xl shadow-navy/10 flex items-center justify-center gap-2 cursor-pointer"
                            >
                              <Lock className="w-3.5 h-3.5" />
                              Continue to Hyparrow
                            </button>`;

if (regex.test(code)) {
  fs.writeFileSync('src/App.tsx', code.replace(regex, replacement));
  console.log('replaced successfully');
} else {
  console.log('target not found');
}
