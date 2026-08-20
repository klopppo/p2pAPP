import { StrictMode } from "react"
import { createRoot } from "react-dom/client"

import "./i18n"
import "./index.css"
import "./error-logger"
import App from "./App.tsx"
import { ThemeProvider } from "@/components/theme-provider.tsx"

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <ThemeProvider defaultTheme="light">
      <App />
    </ThemeProvider>
  </StrictMode>
)
