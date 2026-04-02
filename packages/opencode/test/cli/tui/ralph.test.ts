import { describe, expect, test } from "bun:test"
import { indicator, parse } from "../../../src/cli/cmd/tui/routes/session/ralph"
import type { Part } from "@opencode-ai/sdk/v2"

describe("tui Ralph indicator", () => {
  test("parses active Ralph reminders", () => {
    const part: Part = {
      id: "prt_1",
      messageID: "msg_1",
      sessionID: "ses_1",
      type: "text",
      synthetic: true,
      text: "<system-reminder>\nRalph loop is enabled for this task.\n</system-reminder>",
    }

    expect(parse([part])).toEqual({
      title: "Ralph active",
      detail: "Looping",
    })
  })

  test("parses stale Ralph passes", () => {
    const part: Part = {
      id: "prt_1",
      messageID: "msg_1",
      sessionID: "ses_1",
      type: "text",
      synthetic: true,
      text: "<system-reminder>\nRalph loop pass 3 of 9. The previous pass did not produce meaningful changes. Be more creative, think out of the box, and try a different angle before giving up.\n</system-reminder>",
    }

    expect(parse([part])).toEqual({
      title: "Ralph pass 3 of 9",
      detail: "Creative retry",
    })
  })

  test("finds the latest busy Ralph user message", () => {
    const msgs = [
      {
        id: "msg_1",
        sessionID: "ses_1",
        role: "user",
        time: { created: 1 },
        agent: "build",
      },
      {
        id: "msg_2",
        sessionID: "ses_1",
        role: "assistant",
        time: { created: 2 },
        agent: "build",
        modelID: "x",
        providerID: "y",
        mode: "",
        path: { cwd: "/", root: "/" },
        parentID: "msg_1",
      },
      {
        id: "msg_3",
        sessionID: "ses_1",
        role: "user",
        time: { created: 3 },
        agent: "build",
      },
    ]

    const parts: Record<string, Part[] | undefined> = {
      msg_3: [
        {
          id: "prt_3",
          messageID: "msg_3",
          sessionID: "ses_1",
          type: "text",
          synthetic: true,
          text: "<system-reminder>\nRalph loop pass 2 of 4. Review the latest state and only keep going if there is another worthwhile improvement to make.\n</system-reminder>",
        },
      ],
    }

    expect(indicator({ busy: true, messages: msgs, parts })).toEqual({
      title: "Ralph pass 2 of 4",
      detail: "Looping",
    })
  })

  test("stays hidden when idle", () => {
    const msgs = [
      {
        id: "msg_1",
        sessionID: "ses_1",
        role: "user",
        time: { created: 1 },
        agent: "build",
      },
    ]
    const parts: Record<string, Part[] | undefined> = {
      msg_1: [
        {
          id: "prt_1",
          messageID: "msg_1",
          sessionID: "ses_1",
          type: "text",
          synthetic: true,
          text: "<system-reminder>\nRalph loop is enabled for this task.\n</system-reminder>",
        },
      ],
    }

    expect(indicator({ busy: false, messages: msgs, parts })).toBeUndefined()
  })

  test("ignores older Ralph reminders once a new user turn starts", () => {
    const msgs = [
      {
        id: "msg_1",
        sessionID: "ses_1",
        role: "user",
        time: { created: 1 },
        agent: "build",
      },
      {
        id: "msg_2",
        sessionID: "ses_1",
        role: "assistant",
        time: { created: 2 },
      },
      {
        id: "msg_3",
        sessionID: "ses_1",
        role: "user",
        time: { created: 3 },
        agent: "build",
      },
    ]
    const parts: Record<string, Part[] | undefined> = {
      msg_1: [
        {
          id: "prt_1",
          messageID: "msg_1",
          sessionID: "ses_1",
          type: "text",
          synthetic: true,
          text: "<system-reminder>\nRalph loop is enabled for this task.\n</system-reminder>",
        },
      ],
      msg_3: [
        {
          id: "prt_3",
          messageID: "msg_3",
          sessionID: "ses_1",
          type: "text",
          text: "plain task",
        },
      ],
    }

    expect(indicator({ busy: true, messages: msgs, parts })).toBeUndefined()
  })
})
