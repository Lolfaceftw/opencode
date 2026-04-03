import { describe, expect, test } from "bun:test"
import { Ralph } from "../../src/session/ralph"

describe("session.ralph", () => {
  test("normalizes config defaults", () => {
    expect(Ralph.normalize(true)).toEqual({
      enabled: true,
      mode: "auto",
      persist: false,
      max: 3,
      override: false,
      prompt: undefined,
      instructions: undefined,
    })

    expect(Ralph.normalize({ enabled: false, max: 9 })).toEqual({
      enabled: false,
      mode: "auto",
      persist: false,
      max: 9,
      override: false,
      prompt: undefined,
      instructions: undefined,
    })
  })

  test("encodes and decodes session overrides", () => {
    const text = Ralph.encode({
      enabled: true,
      mode: "always",
      persist: true,
      max: 7,
      instructions: "Commit after each step",
      override: true,
      prompt: "Use my custom Ralph reminder",
    })

    expect(text).toBeString()
    expect(Ralph.decode(text!)).toEqual({
      enabled: true,
      mode: "always",
      persist: true,
      max: 7,
      instructions: "Commit after each step",
      override: true,
      prompt: "Use my custom Ralph reminder",
    })
  })

  test("reads the latest session override from message history", () => {
    const first = Ralph.encode({ enabled: true, mode: "manual", max: 4, persist: false })!
    const second = Ralph.encode({ enabled: false, mode: "always", max: 8, persist: true })!

    expect(
      Ralph.current([
        { parts: [{ type: "text", text: first, synthetic: true }] },
        { parts: [{ type: "text", text: "plain" }] },
        { parts: [{ type: "text", text: second, synthetic: true }] },
      ]),
    ).toEqual({
      enabled: false,
      mode: "always",
      persist: true,
      max: 8,
      override: false,
      prompt: undefined,
      instructions: undefined,
    })
  })

  test("supports clearing the session override", () => {
    expect(Ralph.decode(Ralph.clear())).toBeNull()

    expect(
      Ralph.current([
        {
          parts: [
            {
              type: "text",
              text: Ralph.encode({ enabled: true, mode: "always", max: 5, persist: true })!,
              synthetic: true,
            },
          ],
        },
        { parts: [{ type: "text", text: Ralph.clear(), synthetic: true }] },
      ]),
    ).toBeNull()
  })

  test("decodes markers embedded in Ralph reminders", () => {
    const text = Ralph.stamp(
      `<system-reminder>
Ralph loop is enabled for this task.
</system-reminder>`,
      { enabled: true, mode: "always", persist: true, max: 6 },
    )

    expect(Ralph.decode(text)).toEqual({
      enabled: true,
      mode: "always",
      persist: true,
      max: 6,
      override: false,
      prompt: undefined,
      instructions: undefined,
    })
  })
})
