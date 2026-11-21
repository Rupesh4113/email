const fs = require('fs');
let code = fs.readFileSync('src/App.tsx', 'utf8');

const regex1 = /const \[composeTo, setComposeTo\] = useState\(""\);/;
const replacement1 = `const [composeTo, setComposeTo] = useState("");\n  const [composeReplyToMessageId, setComposeReplyToMessageId] = useState<string | null>(null);`;

const regex2 = /setComposeSubject\(\n\s*`Re: \$\{formData\.subject\}`,\n\s*\);/;
const replacement2 = `setComposeSubject(
                                        \`Re: \${formData.subject}\`,
                                      );
                                      setComposeReplyToMessageId(formData.id || null);`;

const regex3 = /setComposeSubject\(\n\s*`Fwd: \$\{formData\.subject\}`,\n\s*\);/;
const replacement3 = `setComposeSubject(
                                        \`Fwd: \${formData.subject}\`,
                                      );
                                      setComposeReplyToMessageId(null);`;

const regex4 = /body: JSON\.stringify\(\{\n\s*to: composeTo,\n\s*subject: composeSubject,\n\s*body: composeQuote \? composeBody \+ "\\n\\n" \+ composeQuote : composeBody,\n\s*attachments: composeAttachments,\n\s*\}\),/;
const replacement4 = `body: JSON.stringify({
          to: composeTo,
          subject: composeSubject,
          body: composeQuote ? composeBody + "\\n\\n" + composeQuote : composeBody,
          attachments: composeAttachments,
          replyToMessageId: composeReplyToMessageId
        }),`;

if (regex1.test(code) && regex2.test(code) && regex3.test(code) && regex4.test(code)) {
  code = code.replace(regex1, replacement1)
             .replace(regex2, replacement2)
             .replace(regex3, replacement3)
             .replace(regex4, replacement4);
  fs.writeFileSync('src/App.tsx', code);
  console.log("Success");
} else {
  console.log("Failed", { r1: regex1.test(code), r2: regex2.test(code), r3: regex3.test(code), r4: regex4.test(code) });
}
