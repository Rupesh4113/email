const fs = require('fs');
let code = fs.readFileSync('src/App.tsx', 'utf8');

const regex = /const selectEmail = \(msg: GmailMessage\) => \{/;
const replacement = `const selectEmail = (msg: GmailMessage) => {
    // Mark as read in Gmail in the background
    const currentUid = user?.id;
    if (currentUid && msg.id) {
      fetch("/api/gmail/mark-read", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-firebase-uid": currentUid
        },
        body: JSON.stringify({ messageId: msg.id })
      }).catch(err => console.error("Failed to mark as read:", err));
      
      // Optioanlly update local state to reflect it's read immediately
      setInbox(prev => prev.map(m => m.id === msg.id ? { ...m, labelIds: (m.labelIds || []).filter(l => l !== 'UNREAD') } : m));
    }`;

if (regex.test(code)) {
  fs.writeFileSync('src/App.tsx', code.replace(regex, replacement));
  console.log("Success");
} else {
  console.log("Failed");
}
