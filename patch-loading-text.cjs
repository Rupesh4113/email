const fs = require('fs');
let code = fs.readFileSync('src/App.tsx', 'utf8');

const regexImport = /import React, \{ useState, useEffect \} from "react";/;
const replacementImport = `import React, { useState, useEffect } from "react";`;

const regexState = /const \[isAnalyzing, setIsAnalyzing\] = useState\(false\);/;
const replacementState = `const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [loadingStep, setLoadingStep] = useState(0);

  useEffect(() => {
    let interval: NodeJS.Timeout;
    if (isAnalyzing) {
      setLoadingStep(0);
      interval = setInterval(() => {
        setLoadingStep(prev => (prev + 1) % 4);
      }, 800);
    }
    return () => clearInterval(interval);
  }, [isAnalyzing]);
  
  const loadingTexts = [
    "Interrogating message headers...",
    "Scanning for spoofing patterns...",
    "Analyzing links and attachments...",
    "Finalizing neural audit..."
  ];`;

const regexJsx = /<p className="text-\[10px\] font-medium text-navy\/30 italic">\s*Interrogating message headers\.\.\.\s*<\/p>/;
const replacementJsx = `<p className="text-[10px] font-medium text-navy/30 italic">
                        {loadingTexts[loadingStep]}
                      </p>`;

if (regexState.test(code) && regexJsx.test(code)) {
  code = code.replace(regexState, replacementState).replace(regexJsx, replacementJsx);
  fs.writeFileSync('src/App.tsx', code);
  console.log("Success");
} else {
  console.log("Failed", {s: regexState.test(code), j: regexJsx.test(code)});
}
