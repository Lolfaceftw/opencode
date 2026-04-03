import z from "zod"

const MARK = "opencode:ralph:"
const END = "</system-reminder>"

export namespace Ralph {
  export const Mode = z.enum(["auto", "always", "manual"])

  const Raw = z.union([
    z.boolean(),
    z
      .object({
        enabled: z.boolean().optional(),
        mode: Mode.optional(),
        persist: z.boolean().optional(),
        max: z.number().int().positive().optional(),
        instructions: z.string().optional(),
        override: z.boolean().optional(),
        prompt: z.string().optional(),
      })
      .strict(),
  ])

  export const Info = z
    .object({
      enabled: z.boolean().default(true),
      mode: Mode.default("auto"),
      persist: z.boolean().default(false),
      max: z.number().int().positive().default(3),
      instructions: z.string().optional(),
      override: z.boolean().default(false),
      prompt: z.string().optional(),
    })
    .strict()

  export type Info = z.infer<typeof Info>

  function clean(input: Info) {
    const instructions = input.instructions?.trim() || undefined
    const prompt = input.prompt?.trim() || undefined
    return {
      ...input,
      instructions,
      override: prompt ? input.override : false,
      prompt,
    } satisfies Info
  }

  export function blank(enabled = false) {
    return clean(Info.parse({ enabled }))
  }

  export function normalize(input: unknown) {
    if (input === undefined || input === null) return
    const raw = Raw.safeParse(input)
    if (!raw.success) return
    if (raw.data === true) return blank(true)
    if (raw.data === false) return blank(false)
    return clean(Info.parse(raw.data))
  }

  export function encode(input: unknown) {
    const cfg = normalize(input)
    if (!cfg) return
    return MARK + JSON.stringify(cfg)
  }

  export function clear() {
    return MARK + "null"
  }

  export function decode(input: string) {
    const line = input
      .split("\n")
      .toReversed()
      .find((item) => item.startsWith(MARK))
    if (!line) return
    if (line === clear()) return null
    try {
      return normalize(JSON.parse(line.slice(MARK.length)))
    } catch {
      return
    }
  }

  export function stamp(text: string, input: unknown) {
    const mark = input === null ? clear() : encode(input)
    if (!mark) return text
    const clean = text
      .split("\n")
      .filter((line) => !line.startsWith(MARK))
      .join("\n")
      .trimEnd()
    if (clean.includes(END)) return clean.replace(END, `${mark}\n${END}`)
    return `${clean}\n${mark}`
  }

  export function current<T extends { parts: { type: string; text?: string; synthetic?: boolean }[] }>(messages: T[]) {
    return messages
      .toReversed()
      .flatMap((msg) => msg.parts.toReversed())
      .flatMap((part) =>
        part.type === "text" && part.synthetic && typeof part.text === "string" ? [decode(part.text)] : [],
      )
      .find((item) => item !== undefined)
  }
}
