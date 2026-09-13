import path from "path"
import tailwindcss from "@tailwindcss/vite"
import react from "@vitejs/plugin-react"
import { defineConfig } from "vite"

// Route-level code splitting (React.lazy) already makes every page its own
// chunk; this groups the heavy third-party vendors into stable, cacheable
// buckets so a library version bump doesn't invalidate unrelated chunks.
// Keep leaf libraries (wagmi/viem, recharts, supabase, ipfs) OUT of the
// shared vendor chunk so routes that never use them don't download them.
function manualChunks(id: string): string | undefined {
  if (!id.includes("node_modules")) return undefined
  if (/(wagmi|viem|rainbowkit|@rainbow-me|walletconnect|coinbase|metamask|@safe-global)/.test(id))
    return "web3"
  if (/(recharts|lodash|d3-|@reduxjs)/.test(id)) return "charts"
  if (/(helia|@helia|libp2p|multiformats|ipfs-|blockstore)/.test(id)) return "ipfs"
  if (/(@radix-ui|radix-ui|lucide-react|class-variance-authority|tw-animate)/.test(id))
    return "ui"
  if (/(@supabase|jose|aws4fetch)/.test(id)) return "backend"
  if (/(react-router|react-i18next|i18next|@tanstack)/.test(id)) return "data"
  if (/(sonner|framer-motion|motion|@fontsource)( |\/|$)/.test(id)) return "fx"
  if (/(react|react-dom|react-is|scheduler)( |\/|$)/.test(id)) return "react"
  return "vendor"
}

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
      react: path.resolve(__dirname, "./node_modules/react"),
      "react-dom": path.resolve(__dirname, "./node_modules/react-dom"),
    },
    dedupe: ["react", "react-dom"],
  },
  define: {
    'process.env': '{}',
    global: 'globalThis',
  },
  build: {
    reportCompressedSize: true,
    // Alert the moment a single chunk outgrows ~1/4 of the web3 fixture —
    // route chunks should stay well under this after code splitting.
    chunkSizeWarningLimit: 500,
    rollupOptions: {
      output: {
        manualChunks,
      },
    },
  },
})
