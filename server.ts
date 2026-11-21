import express from "express";
import path from "path";
import dotenv from "dotenv";
import apiRoutes from "./api/index.js";

dotenv.config();

const app = express();
const PORT = 3000;

app.use(apiRoutes);

// Start Server with Vite
async function startServer() {
  if (process.env.NODE_ENV !== "production") {
    try {
      const viteModule = await import("vite");
      const vite = await viteModule.createServer({
        server: { middlewareMode: true },
        appType: "spa",
      });
      app.use(vite.middlewares);
    } catch (e) {
      console.warn("Vite not found, skipping dev middleware");
    }
  } else {
    // Check if we are running in a Vercel serverless environment
    // Vercel handles static files on its own, so we only need Express for `/api`
    if (!process.env.VERCEL) {
      const distPath = path.join(process.cwd(), "dist");
      app.use(express.static(distPath));
      app.get("*", (req, res) => {
        res.sendFile(path.join(distPath, "index.html"));
      });
    }
  }

  // Only start listening if NOT in a serverless environment (like Vercel)
  if (!process.env.VERCEL) {
    app.listen(PORT, "0.0.0.0", () => {
      console.log(`Server running on http://localhost:${PORT}`);
    });
  }
}

startServer();

export default app;
