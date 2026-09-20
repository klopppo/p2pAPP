import { Component, type ErrorInfo, type ReactNode } from "react"
import { AlertTriangle, RotateCcw } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Text } from "@/components/ui/text"
import { reportError } from "@/error-logger"

interface AppErrorBoundaryProps {
  children: ReactNode
  /** Changing this key after an error resets the boundary (route change). */
  resetKey?: string
}

interface AppErrorBoundaryState {
  hasError: boolean
  message?: string
}

/**
 * Top-level React boundary. Catches render errors from any route chunk,
 * reports them through the self-hosted pipeline (ADR-013) and swaps in a
 * token-styled fallback instead of a white screen. `resetKey` lets the
 * router clear the boundary on navigation so the app recovers in place.
 */
export class AppErrorBoundary extends Component<
  AppErrorBoundaryProps,
  AppErrorBoundaryState
> {
  state: AppErrorBoundaryState = { hasError: false }

  static getDerivedStateFromError(error: unknown): AppErrorBoundaryState {
    return {
      hasError: true,
      message: error instanceof Error ? error.message : "Unknown error",
    }
  }

  componentDidCatch(error: unknown, info: ErrorInfo): void {
    reportError({
      error,
      error_type: "react_render",
      stack: info.componentStack ?? undefined,
      message: error instanceof Error ? error.message : undefined,
    })
  }

  componentDidUpdate(prevProps: AppErrorBoundaryProps): void {
    if (this.state.hasError && prevProps.resetKey !== this.props.resetKey) {
      this.setState({ hasError: false, message: undefined })
    }
  }

  render(): ReactNode {
    if (this.state.hasError) {
      return (
        <section className="py-16">
          <div className="mx-auto max-w-md space-y-4 text-center">
            <div className="mx-auto w-fit rounded-full bg-destructive/10 p-3">
              <AlertTriangle className="h-6 w-6 text-destructive" />
            </div>
            <Text variant="h3">Something went wrong</Text>
            <Text variant="muted" className="break-words">
              {this.state.message}
            </Text>
            <Button
              className="rounded-full shadow-none"
              onClick={() => window.location.reload()}
            >
              <RotateCcw className="h-4 w-4" />
              Reload page
            </Button>
          </div>
        </section>
      )
    }
    return this.props.children
  }
}
