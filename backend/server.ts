import app from "./app.js";

const PORT = Number(process.env.PORT) || 3001;

app.listen(PORT, "0.0.0.0", () => {
  console.log(`Open-Source Mail Verifier Backend running on http://localhost:${PORT}`);
  console.log(`Database: SQLite (WAL mode) at data/mailverifier.db`);
  console.log(`Forensic Engine: Open-Source Rule, Cryptographic Header & DNS Resolver`);
  console.log(`LLM Engine: Ollama / Local Open-Source AI (Fallback: Deterministic Fact-Engine)`);
});

export default app;
