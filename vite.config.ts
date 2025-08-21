import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react' // or your framework
import tailwindcss from '@tailwindcss/vite'

export default defineConfig({
  // For GitHub Pages served under https://<user>.github.io/<repo>/
  // Default to this repo name; override locally/CI with VITE_BASE if needed
  base: process.env.VITE_BASE || '/pick-six-preseason/',
  plugins: [react(), tailwindcss()],
})