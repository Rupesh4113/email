const fs = require('fs');
let code = fs.readFileSync('api/index.ts', 'utf8');

const regex = /app\.post\("\/api\/auth\/login", authLimiter, async \(req, res\) => \{\s*const \{ email, password \} = req\.body;/;
const replacement = `app.post("/api/auth/login", authLimiter, async (req, res) => {
  const { email, password, rememberMe } = req.body;`;

const regex2 = /req\.session!\.userId = user\.id;/;
const replacement2 = `req.session!.userId = user.id;
    if (rememberMe) {
      req.sessionOptions.maxAge = 30 * 24 * 60 * 60 * 1000; // 30 days
    } else {
      req.sessionOptions.maxAge = 24 * 60 * 60 * 1000; // 1 day
    }`;

if (regex.test(code) && regex2.test(code)) {
  code = code.replace(regex, replacement).replace(regex2, replacement2);
  fs.writeFileSync('api/index.ts', code);
  console.log("Success");
} else {
  console.log("Failed");
}
