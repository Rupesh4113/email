const fs = require('fs');
let code = fs.readFileSync('src/App.tsx', 'utf8');
const target = `                                <Lock className="w-3.5 h-3.5" />
                                Authenticate & Pay {isAnnual ? "$48.00" : "$5.00"}
                              </button>`;
const replacement = `                                <Lock className="w-3.5 h-3.5" />
                                Process with Hyparrow
                              </button>`;
if (code.includes(target)) {
  fs.writeFileSync('src/App.tsx', code.replace(target, replacement));
  console.log('replaced successfully');
} else {
  console.log('target not found');
}
