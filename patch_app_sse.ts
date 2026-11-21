import fs from 'fs';
let content = fs.readFileSync('src/App.tsx', 'utf8');

const sseEffect = `
  // SSE for Real-time push alerts
  useEffect(() => {
    if (user?.id) {
      const eventSource = new EventSource(\`/api/sse?uid=\${user.id}\`);
      eventSource.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data);
          if (data.type === "THREAT_DETECTED") {
            alert(\`Real-time Alert: \${data.message} (\${data.classification})\`);
            // Refresh inbox automatically to show new mail
            handleFetchGmail();
          }
        } catch (e) {
          console.error("Failed to parse SSE data", e);
        }
      };
      
      return () => {
        eventSource.close();
      };
    }
  }, [user]);

  useEffect(() => {
`;

content = content.replace("  useEffect(() => {\n    const checkAuth", sseEffect + "    const checkAuth");

// Also call /api/gmail/watch on connect
const watchCode = `
      // Start Gmail Push Notification Watch
      fetch("/api/gmail/watch", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-firebase-uid": user.id
        }
      }).catch(console.error);
`;

content = content.replace(/await handleFetchGmail\(\);\s+setIsConnected\(true\);/, "await handleFetchGmail();\n      setIsConnected(true);\n" + watchCode);

fs.writeFileSync('src/App.tsx', content, 'utf8');
