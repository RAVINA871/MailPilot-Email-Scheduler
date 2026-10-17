import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
const target = process.env.BACKEND_URL ?? "http://localhost:4000";
export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: { port: 5173, proxy: { "/api": target, "/auth": target, "/admin": target, "/health": target } },
});
