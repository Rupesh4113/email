const fs = require('fs');
let code = fs.readFileSync('src/App.tsx', 'utf8');
const target = `                        ) : (
                          /* Normal Credit Card Form layout */
                          <>
                            <div className="space-y-1">
                              <p className="text-[9px] font-black uppercase tracking-[3px] text-orange">
                                UPGRADE TRANSACTION
                              </p>
                              <h3 className="text-2xl font-display font-black uppercase italic tracking-tight text-navy">
                                SECURE CHECKOUT
                              </h3>
                            </div>`;
const replacement = `                        ) : (
                          /* Hyparrow Gateway Layout */
                          <>
                            <div className="flex justify-between items-start mb-2 border-b border-navy/5 pb-4">
                              <div className="space-y-1">
                                <p className="text-[9px] font-black uppercase tracking-[3px] text-orange">
                                  {isAnnual ? "$48.00 USD / YEAR" : "$5.00 USD / MONTH"}
                                </p>
                                <h3 className="text-2xl font-display font-black uppercase italic tracking-tight text-navy flex items-center gap-2">
                                  HYPARROW
                                </h3>
                              </div>
                              <div className="bg-navy/5 text-navy px-3 py-1.5 rounded-full flex items-center gap-2">
                                <Lock className="w-3 h-3 text-orange" />
                                <span className="text-[8px] font-black uppercase tracking-widest">SECURE PORTAL</span>
                              </div>
                            </div>`;
if (code.includes(target)) {
  fs.writeFileSync('src/App.tsx', code.replace(target, replacement));
  console.log('replaced successfully');
} else {
  console.log('target not found');
}
