import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { defineConfig } from "vitest/config";

// react = JSX support, tailwindcss = the official Tailwind plugin for Vite.
// "test" is for Vitest: our tests only check plain functions, so no browser is needed.
export default defineConfig({
  plugins: [react(), tailwindcss()],
  test: { environment: "node", include: ["src/**/*.test.js"] },
});
