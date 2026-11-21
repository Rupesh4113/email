const fs = require('fs');
let code = fs.readFileSync('src/App.tsx', 'utf8');
const target = `                              <span className="bg-orange/10 text-orange px-3 py-1.5 rounded-full text-[9px] font-black uppercase tracking-[3px] border border-orange/20">
                                Realtime Payment Router
                              </span>`;
const replacement = `                              <span className="bg-orange/10 text-orange px-3 py-1.5 rounded-full text-[9px] font-black uppercase tracking-[3px] border border-orange/20">
                                Hyparrow Gateway
                              </span>`;
if (code.includes(target)) {
  fs.writeFileSync('src/App.tsx', code.replace(target, replacement));
  console.log('replaced successfully');
} else {
  console.log('target not found');
}
