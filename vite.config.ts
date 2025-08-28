import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react' // or your framework
import tailwindcss from '@tailwindcss/vite'

export default defineConfig({
  // Required for GitHub Pages project site publishing
  // Adjust if your repo name changes
  base: '/pick-six-preseason/',
  plugins: [react(), tailwindcss()],
})