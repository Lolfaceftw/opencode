import { TextAttributes, TextareaRenderable } from "@opentui/core"
import { useKeyboard } from "@opentui/solid"
import { createMemo, createSignal, onMount, Show } from "solid-js"
import { createStore } from "solid-js/store"
import type { Part } from "@opencode-ai/sdk/v2"
import { Keybind } from "@/util/keybind"
import { Ralph } from "@/session/ralph"
import { useDialog } from "@tui/ui/dialog"
import { DialogSelect } from "@tui/ui/dialog-select"
import { useLocal } from "@tui/context/local"
import { useSDK } from "@tui/context/sdk"
import { useSync } from "@tui/context/sync"
import { useTheme } from "@tui/context/theme"
import { useToast } from "@tui/ui/toast"

type Value = "enabled" | "mode" | "persist" | "max" | "instructions" | "override" | "prompt" | "reset" | "save"

function line(input?: string) {
  const text = input?.trim()
  if (!text) return "Empty"
  const first =
    text
      .split("\n")
      .find((item) => item.trim())
      ?.trim() ?? text
  return first.length > 32 ? first.slice(0, 29) + "..." : first
}

function copy(input: Ralph.Info) {
  return {
    enabled: input.enabled,
    mode: input.mode,
    persist: input.persist,
    max: input.max,
    instructions: input.instructions,
    override: input.override,
    prompt: input.prompt,
  } satisfies Ralph.Info
}

function editor(input: {
  title: string
  value?: string
  placeholder?: string
  single?: boolean
  onSave: (value: string) => void
  onCancel: () => void
}) {
  return <DialogRalphEditor {...input} />
}

function DialogRalphEditor(props: {
  title: string
  value?: string
  placeholder?: string
  single?: boolean
  onSave: (value: string) => void
  onCancel: () => void
}) {
  const dialog = useDialog()
  const { theme } = useTheme()
  let input: TextareaRenderable

  useKeyboard((evt) => {
    if (evt.name === "escape") {
      evt.preventDefault()
      evt.stopPropagation()
      props.onCancel()
      return
    }
    if (evt.ctrl && evt.name === "s") {
      evt.preventDefault()
      evt.stopPropagation()
      props.onSave(input.plainText)
      return
    }
  })

  onMount(() => {
    dialog.setSize("large")
    setTimeout(() => {
      if (!input || input.isDestroyed) return
      input.focus()
      input.gotoLineEnd()
    }, 1)
  })

  return (
    <box paddingLeft={2} paddingRight={2} gap={1}>
      <box flexDirection="row" justifyContent="space-between">
        <text attributes={TextAttributes.BOLD} fg={theme.text}>
          {props.title}
        </text>
        <text fg={theme.textMuted} onMouseUp={() => props.onCancel()}>
          esc
        </text>
      </box>
      <box gap={1}>
        <text fg={theme.textMuted}>
          {props.single ? "Press enter or ctrl+s to save." : "Use enter for new lines. Press ctrl+s to save."}
        </text>
        <textarea
          ref={(val: TextareaRenderable) => (input = val)}
          initialValue={props.value}
          placeholder={props.placeholder ?? "Type here"}
          placeholderColor={theme.textMuted}
          minHeight={props.single ? 1 : 6}
          maxHeight={props.single ? 3 : 14}
          textColor={theme.text}
          focusedTextColor={theme.text}
          cursorColor={theme.primary}
          keyBindings={props.single ? [{ name: "return", action: "submit" }] : []}
          onSubmit={() => {
            if (!props.single) return
            props.onSave(input.plainText)
          }}
        />
      </box>
      <box paddingBottom={1} flexDirection="row" gap={2}>
        <Show when={props.single} fallback={undefined}>
          <text fg={theme.text}>
            enter <span style={{ fg: theme.textMuted }}>save</span>
          </text>
        </Show>
        <text fg={theme.text}>
          ctrl+s <span style={{ fg: theme.textMuted }}>save</span>
        </text>
        <text fg={theme.text}>
          esc <span style={{ fg: theme.textMuted }}>back</span>
        </text>
      </box>
    </box>
  )
}

export function DialogRalph(props: { sessionID: string; value?: Ralph.Info; clear?: boolean }) {
  const dialog = useDialog()
  const sdk = useSDK()
  const sync = useSync()
  const local = useLocal()
  const toast = useToast()

  const base = createMemo(() => {
    if (props.value) return copy(props.value)
    const raw = Ralph.normalize(sync.data.config.experimental?.ralph_loop) ?? Ralph.blank()
    const messages = (sync.data.message[props.sessionID] ?? []).map((info) => ({
      parts: sync.data.part[info.id] ?? [],
    }))
    const sessionValue = Ralph.current(messages)
    if (sessionValue === null) return copy(raw)
    if (sessionValue) return copy(sessionValue)
    const localValue = local.ralph.get(props.sessionID)
    if (localValue === null) return copy(raw)
    if (localValue) return copy(localValue)
    return copy(raw)
  })
  const [store, setStore] = createStore(copy(base()))
  const [clear, setClear] = createSignal(
    props.clear ??
      (() => {
        const messages = (sync.data.message[props.sessionID] ?? []).map((info) => ({
          parts: sync.data.part[info.id] ?? [],
        }))
        const sessionValue = Ralph.current(messages)
        if (sessionValue === null) return true
        return sessionValue === undefined && local.ralph.get(props.sessionID) === null
      })(),
  )
  const busy = createMemo(() => (sync.data.session_status[props.sessionID]?.type ?? "idle") !== "idle")
  const [saving, setSaving] = createSignal(false)

  function snap() {
    return Ralph.normalize(copy(store)) ?? Ralph.blank()
  }

  function reopen(next = snap(), reset = clear()) {
    dialog.replace(() => <DialogRalph sessionID={props.sessionID} value={next} clear={reset} />)
  }

  function open(render: () => any) {
    dialog.replace(() => render())
  }

  function cycle() {
    setClear(false)
    const list = Ralph.Mode.options
    const at = list.indexOf(store.mode)
    setStore("mode", list[(at + 1) % list.length])
  }

  function reset() {
    setClear(true)
    const next = Ralph.normalize(sync.data.config.experimental?.ralph_loop) ?? Ralph.blank()
    setStore(copy(next))
  }

  async function save() {
    if (saving()) return
    const cfg = clear() ? null : snap()
    const text = clear() ? Ralph.clear() : Ralph.encode(cfg)
    if (!text) return
    const model = local.model.current()
    const msg = (sync.data.message[props.sessionID] ?? []).findLast((item) => item.role === "user")
    const part = msg
      ? (sync.data.part[msg.id] ?? []).findLast(
          (item): item is Part & { type: "text"; text: string; synthetic?: boolean } =>
            item.type === "text" &&
            item.synthetic === true &&
            (Ralph.decode(item.text) !== undefined || item.text.includes("Ralph loop")),
        )
      : undefined
    const queued = busy() && !part

    setSaving(true)

    let result
    try {
      if (busy() && part) {
        result = await sdk.client.part.update({
          sessionID: props.sessionID,
          messageID: part.messageID,
          partID: part.id,
          part: {
            ...part,
            text: cfg
              ? Ralph.stamp(part.text, cfg)
              : Ralph.stamp(
                  `<system-reminder>
Ralph loop is disabled for this session.

Stop after the current response finishes.
</system-reminder>`,
                  null,
                ),
          },
        })
      } else if (!busy()) {
        result = await sdk.client.session.prompt({
          sessionID: props.sessionID,
          agent: local.agent.current().name,
          ...(model ? { model } : {}),
          noReply: true,
          parts: [{ type: "text", text, synthetic: true, ignored: true }],
        })
      }
    } catch {
      toast.show({
        message: "Failed to update Ralph",
        variant: "error",
        duration: 4000,
      })
      return
    } finally {
      setSaving(false)
    }

    if (result?.error) {
      const message =
        typeof result.error === "object" &&
        result.error !== null &&
        "data" in result.error &&
        typeof result.error.data === "object" &&
        result.error.data !== null &&
        "message" in result.error.data &&
        typeof result.error.data.message === "string"
          ? result.error.data.message
          : "Failed to update Ralph"
      toast.show({
        message,
        variant: "error",
        duration: 4000,
      })
      return
    }

    if (clear()) local.ralph.clear(props.sessionID)
    else local.ralph.set(props.sessionID, snap())
    toast.show({
      message: queued ? "Ralph will apply on your next prompt" : "Ralph updated for this session",
      variant: "success",
      duration: 2500,
    })
    dialog.clear()
  }

  function pick(value: Value) {
    if (value === "enabled") {
      setClear(false)
      return setStore("enabled", !store.enabled)
    }
    if (value === "mode") return cycle()
    if (value === "persist") {
      setClear(false)
      return setStore("persist", !store.persist)
    }
    if (value === "override") {
      setClear(false)
      return setStore("override", !store.override)
    }
    if (value === "reset") return reset()
    if (value === "save") return void save()
    if (value === "max") {
      const prev = snap()
      open(() =>
        editor({
          title: "Ralph max passes",
          value: String(store.max),
          placeholder: "Enter a positive integer",
          single: true,
          onSave: (value) => {
            const max = Number.parseInt(value.trim(), 10)
            if (!Number.isInteger(max) || max <= 0) {
              toast.show({
                message: "Max passes must be a positive integer",
                variant: "warning",
                duration: 3000,
              })
              return
            }
            reopen({ ...prev, max }, false)
          },
          onCancel: () => reopen(prev, clear()),
        }),
      )
      return
    }
    if (value === "instructions") {
      const prev = snap()
      open(() =>
        editor({
          title: "Ralph developer instructions",
          value: store.instructions,
          placeholder: "Add extra developer instructions for Ralph",
          onSave: (value) => reopen({ ...prev, instructions: value.trim() || undefined }, false),
          onCancel: () => reopen(prev, clear()),
        }),
      )
      return
    }
    if (value === "prompt") {
      const prev = snap()
      open(() =>
        editor({
          title: "Ralph override prompt",
          value: store.prompt,
          placeholder: "Replace the built-in Ralph reminder for this session",
          onSave: (value) => reopen({ ...prev, prompt: value.trim() || undefined }, false),
          onCancel: () => reopen(prev, clear()),
        }),
      )
    }
  }

  function flip(value: Value) {
    if (!["enabled", "mode", "persist", "override"].includes(value)) return
    pick(value)
  }

  const options = createMemo(
    () =>
      [
        {
          value: "enabled",
          title: "Enabled",
          description: "Turn Ralph loop on or off for this session",
          footer: store.enabled ? "On" : "Off",
        },
        {
          value: "mode",
          title: "Mode",
          description: "Choose how Ralph starts",
          footer: store.mode,
        },
        {
          value: "persist",
          title: "Creative retries",
          description: "Keep nudging after no-change passes",
          footer: store.persist ? "On" : "Off",
        },
        {
          value: "max",
          title: "Max passes",
          description: "Set the Ralph loop pass limit",
          footer: String(store.max),
        },
        {
          value: "instructions",
          title: "Developer instructions",
          description: "Append your own Ralph-specific guidance",
          footer: line(store.instructions),
        },
        {
          value: "override",
          title: "Override built-in prompt",
          description: "Replace the default Ralph reminder with your own",
          footer: store.override ? "On" : "Off",
        },
        {
          value: "prompt",
          title: "Override prompt",
          description: "Edit the custom Ralph reminder text",
          footer: line(store.prompt),
        },
        {
          value: "reset",
          title: "Use config defaults",
          description: "Reset this dialog to your configured defaults",
          category: "Actions",
        },
        {
          value: "save",
          title: saving() ? "Saving..." : "Save to current session",
          description: busy() ? "Wait for the current turn to finish" : "Persist these Ralph settings for this session",
          category: "Actions",
        },
      ] satisfies { value: Value; title: string; description: string; footer?: string; category?: string }[],
  )

  return (
    <DialogSelect
      title="Ralph"
      placeholder="Search Ralph settings"
      options={options().map((item) => ({
        ...item,
        onSelect: () => pick(item.value),
      }))}
      keybind={[
        {
          keybind: Keybind.parse("space")[0],
          title: "Toggle",
          onTrigger: (option) => flip(option.value as Value),
        },
        {
          keybind: Keybind.parse("ctrl+r")[0],
          title: "Defaults",
          onTrigger: () => reset(),
        },
        {
          keybind: Keybind.parse("ctrl+s")[0],
          title: "Save",
          onTrigger: () => void save(),
        },
      ]}
    />
  )
}
