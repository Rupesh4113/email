const fs = require('fs');
let code = fs.readFileSync('src/App.tsx', 'utf8');

const regex = /<label className="text-\[10px\] font-black uppercase tracking-widest text-navy\/40 ml-2">\s*Secret Password\s*<\/label>([\s\S]*?)<div className="flex justify-end pr-2">\s*<button\s*type="button"\s*onClick=\{\(\) => setLoginMode\("forgot"\)\}\s*className="text-\[9px\] font-black uppercase tracking-widest text-orange hover:text-navy transition-colors"\s*>\s*Forgot Password\?\s*<\/button>\s*<\/div>/;

const replacement = `<label className="text-[10px] font-black uppercase tracking-widest text-navy/40 ml-2">
                              Password
                            </label>$1<div className="flex justify-between items-center px-2">
                              <label className="flex items-center gap-2 cursor-pointer">
                                <input
                                  type="checkbox"
                                  checked={authFormData.rememberMe}
                                  onChange={(e) =>
                                    setAuthFormData({
                                      ...authFormData,
                                      rememberMe: e.target.checked,
                                    })
                                  }
                                  className="w-3.5 h-3.5 accent-orange focus:ring-orange/20"
                                />
                                <span className="text-[10px] font-bold tracking-widest uppercase text-navy/60">Keep me logged in</span>
                              </label>
                              <button
                                type="button"
                                onClick={() => setLoginMode("forgot")}
                                className="text-[9px] font-black uppercase tracking-widest text-orange hover:text-navy transition-colors"
                              >
                                Forgot Password?
                              </button>
                            </div>`;

if (regex.test(code)) {
  fs.writeFileSync('src/App.tsx', code.replace(regex, replacement));
  console.log("Success");
} else {
  console.log("Failed");
}
