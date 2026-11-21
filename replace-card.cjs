const fs = require('fs');
let code = fs.readFileSync('src/App.tsx', 'utf8');
const target = `                            {/* Visual Virtual Card */}
                            <div className="bg-gradient-to-tr from-navy to-navy/80 text-white p-6 rounded-3xl space-y-8 shadow-xl shadow-navy/25 relative overflow-hidden">
                              <div className="absolute top-0 right-0 p-6 opacity-10">
                                <ShieldCheck className="w-24 h-24 text-orange" />
                              </div>
                              
                              <div className="flex justify-between items-start">
                                <span className="text-[9px] font-mono tracking-widest text-white/50 uppercase">
                                  MAIL VERIFIER AUDITOR
                                </span>
                                <Sparkles className="w-6 h-6 text-orange" />
                              </div>`;
const replacement = `                            {/* Hyparrow Visual Gateway Card */}
                            <div className="bg-gradient-to-tr from-[#1C1C1E] to-[#2C2C2E] text-white p-6 rounded-3xl space-y-8 shadow-xl relative overflow-hidden border border-white/5">
                              <div className="absolute top-0 right-0 p-6 opacity-20">
                                <ShieldCheck className="w-24 h-24 text-orange" />
                              </div>
                              
                              <div className="flex justify-between items-start">
                                <span className="text-[10px] font-black uppercase tracking-widest text-white/50 flex items-center gap-1">
                                  HYPARROW
                                </span>
                                <Lock className="w-5 h-5 text-orange" />
                              </div>`;
if (code.includes(target)) {
  fs.writeFileSync('src/App.tsx', code.replace(target, replacement));
  console.log('replaced successfully');
} else {
  console.log('target not found');
}
