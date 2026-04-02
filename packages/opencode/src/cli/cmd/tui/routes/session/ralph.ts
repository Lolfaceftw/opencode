import type { Part } from "@opencode-ai/sdk/v2"

const PASS = /Ralph loop pass (\d+) of (\d+)/
const STALE = /did not produce meaningful changes/i

export function parse(parts: Part[]) {
  const txt = parts
    .flatMap((part) => {
      if (part.type !== "text" || !part.synthetic || !part.text.includes("Ralph loop")) return []
      return [part.text]
    })
    .at(-1)
  if (!txt) return
  const pass = txt.match(PASS)
  if (pass)
    return {
      title: `Ralph pass ${pass[1]} of ${pass[2]}`,
      detail: STALE.test(txt) ? "Creative retry" : "Looping",
    }
  return {
    title: "Ralph active",
    detail: "Looping",
  }
}

export function indicator(input: {
  busy: boolean
  messages: Array<{
    id: string
    role: string
  }>
  parts: Record<string, Part[] | undefined>
}) {
  if (!input.busy) return
  const msg = input.messages.findLast((msg) => msg.role === "user")
  if (!msg) return
  return parse(input.parts[msg.id] ?? [])
}
