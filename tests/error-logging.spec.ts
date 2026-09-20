// Unit tests for the self-hosted error reporting pipeline's shared logic
// (src/lib/errorReports.ts). Pure functions only — window/fetch wiring lives
// in src/error-logger.ts and is exercised via the UI/e2e suites.

import { describe, expect, it } from "vitest"
import {
  buildFingerprint,
  buildReport,
  extractMessage,
  scrubText,
  truncate,
} from "@/lib/errorReports"

describe("scrubText — privacy masking", () => {
  it("masks EVM addresses (40 hex) and tx hashes (64 hex)", () => {
    expect(
      scrubText("sent to 0xAb5801a7D398351b8bE11C439e05C5B3259aeC9B")
    ).toBe("sent to 0x…")
    expect(
      scrubText(
        "hash 0xabcdefabcdefabcdefabcdefabcdefabcdefabcdefabcd" +
          "efabcdefabcdefabcdefab"
      )
    ).toBe("hash 0x…")
  })

  it("does not mangle short hex (route ids, error codes)", () => {
    expect(scrubText("offer OFF-3F2A9C1B")).toBe("offer OFF-3F2A9C1B")
  })

  it("masks emails and URL query values but keeps param names", () => {
    expect(scrubText("contact test@example.com")).toBe("contact [email]")
    expect(scrubText("fetch /api?a=secret&b=1")).toBe(
      "fetch /api?a=[redacted]&b=[redacted]"
    )
  })

  it("keeps normal messages intact", () => {
    expect(scrubText("User rejected the request")).toBe(
      "User rejected the request"
    )
  })
})

describe("truncate", () => {
  it("cuts long strings with an ellipsis and passes short ones through", () => {
    expect(truncate("hello", 10)).toBe("hello")
    expect(truncate("hello world", 5)).toBe("hello…")
  })
})

describe("buildFingerprint", () => {
  it("groups identical errors and separates distinct ones", () => {
    const a = buildFingerprint({
      error_type: "error",
      message: "Boom",
      route: "/app/trades",
    })
    expect(
      buildFingerprint({
        error_type: "error",
        message: "Boom",
        route: "/app/trades",
      })
    ).toBe(a)
    expect(
      buildFingerprint({
        error_type: "error",
        message: "Boom",
        route: "/app/offers",
      })
    ).not.toBe(a)
    expect(
      buildFingerprint({
        error_type: "unhandledrejection",
        message: "Boom",
        route: "/app/trades",
      })
    ).not.toBe(a)
  })

  it("ignores transient wallet addresses when comparing", () => {
    const a = buildFingerprint({
      error_type: "error",
      message: "call to 0xAb5801a7D398351b8bE11C439e05C5B3259aeC9B failed",
    })
    const b = buildFingerprint({
      error_type: "error",
      message: "call to 0xab5801a7d398351b8be11c439e05c5b3259aec9b failed",
    })
    expect(a).toBe(b)
  })
})

describe("extractMessage", () => {
  it("handles Error instances, strings, objects and null", () => {
    expect(extractMessage(new Error("nope"))).toBe("nope")
    expect(extractMessage("plain")).toBe("plain")
    expect(extractMessage({ message: "obj" })).toBe("obj")
    expect(extractMessage(null)).toBe("Unknown error")
  })
})

describe("buildReport", () => {
  it("maps a raw ErrorEvent onto a scrubbed, truncated report", () => {
    const report = buildReport(
      {
        error: new Error("revert 0xAb5801a7D398351b8bE11C439e05C5B3259aeC9B"),
        source: "https://coffernode.app/assets/main.js",
        line: 12,
        col: 34,
        error_type: "error",
      },
      "/app/offer/OFF-3F2A9C1B",
      "Mozilla/5.0 (test)",
      "en-US"
    )
    expect(report.error_type).toBe("error")
    expect(report.message).toBe("revert 0x…")
    expect(report.route).toBe("/app/offer/OFF-3F2A9C1B")
    expect(report.source).toBe("https://coffernode.app/assets/main.js")
    expect(report.line).toBe(12)
    expect(report.count).toBe(1)
    expect(report.occurred_at).toMatch(/^\d{4}-\d{2}-\d{2}T/)
  })

  it("truncates oversized messages", () => {
    const long = "x".repeat(5000)
    const report = buildReport({ message: long, error_type: "error" }, "/")
    expect(report.message.length).toBeLessThanOrEqual(501)
  })
})
