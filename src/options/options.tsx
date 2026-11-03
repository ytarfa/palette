import { ChevronRight, Puzzle } from "lucide-react"
import { useEffect, useMemo, useState, type ReactNode } from "react"
import { Button } from "@/components/ui/button"
import { Kbd, KbdGroup } from "@/components/ui/kbd"
import { Switch } from "@/components/ui/switch"
import { describeAccess, getPlugins, removePlugin, setStatus, type StoredPlugin } from "@/core/external"
import { formatShortcut } from "@/core/keys"
import { builtInNames, pluginName } from "@/core/plugin-names"
import {
  getSettings,
  isCommandEnabled,
  isEnabled,
  onSettingsChanged,
  setCommandEnabled,
  setPluginEnabled,
  type Settings,
} from "@/core/settings"
import type { Plugin } from "@/core/types"
import { favicon } from "@/plugins/util"

export function Options({ plugins }: { plugins: Plugin[] }) {
  const [settings, setSettings] = useState<Settings>()
  const [external, setExternal] = useState<StoredPlugin[]>([])
  const [shortcuts, setShortcuts] = useState<chrome.commands.Command[]>([])
  // Same renaming as in the palette, so a plugin can't pass for a built-in one here either.
  const reserved = useMemo(() => builtInNames(plugins), [plugins])

  useEffect(() => {
    void getSettings().then(setSettings)
    const loadExternal = () => void getPlugins().then(setExternal)
    loadExternal()
    // "open-tabs" before "open-commands".
    void chrome.commands.getAll().then((all) => setShortcuts(all.sort((a, b) => (b.name ?? "").localeCompare(a.name ?? ""))))
    chrome.storage.onChanged.addListener(loadExternal)
    const off = onSettingsChanged(setSettings)
    return () => {
      off()
      chrome.storage.onChanged.removeListener(loadExternal)
    }
  }, [])

  if (!settings) return null

  const toggle = (plugin: Plugin) => (
    <Switch
      checked={isEnabled(plugin, settings)}
      onCheckedChange={(on) => void setPluginEnabled(plugin.id, on)}
      aria-label={plugin.name}
    />
  )
  const sites = plugins.filter((p) => p.category === "site")
  const general = plugins.filter((p) => p.category === "general")

  return (
    <main className="mx-auto max-w-2xl px-6 py-14">
      <header className="flex items-center gap-4">
        <img src="/icons/128.png" alt="" className="size-11 rounded-[10px]" />
        <div>
          <h1 className="font-heading text-xl font-semibold tracking-tight">Palette</h1>
          <p className="text-sm text-muted-foreground">Settings</p>
        </div>
      </header>

      <Section title="Keyboard shortcuts">
        {shortcuts
          .filter((c) => c.name?.startsWith("open-"))
          .map((command) => (
            <Row key={command.name} title={command.description ?? command.name ?? ""}>
              {command.shortcut ? (
                <KbdGroup>
                  {[...command.shortcut].map((key, i) => (
                    <Kbd key={i}>{key}</Kbd>
                  ))}
                </KbdGroup>
              ) : (
                <span className="text-sm text-muted-foreground">Not set</span>
              )}
            </Row>
          ))}
        <Row title="Change shortcuts" description="Chrome manages extension shortcuts on its own page.">
          <Button variant="outline" size="sm" onClick={() => void chrome.tabs.create({ url: "chrome://extensions/shortcuts" })}>
            Open
          </Button>
        </Row>
      </Section>

      <Section
        title="Sites"
        description={
          <>
            Commands for the website you're on, at the top of the command list (
            <ShortcutText shortcut="mod+shift+k" />
            ).
          </>
        }
      >
        {sites.map((plugin) => (
          <Row
            key={plugin.id}
            icon={<SiteIcon url={plugin.url} />}
            title={plugin.name}
            description={plugin.description}
          >
            {toggle(plugin)}
          </Row>
        ))}
      </Section>

      <Section title="General">
        {general.map((plugin) => (
          <GeneralPlugin key={plugin.id} plugin={plugin} settings={settings} toggle={toggle(plugin)} />
        ))}
      </Section>

      <Section
        title="From other extensions"
        description="Extensions built with @palette/sdk can add their own commands. Each one sees only what's listed under it. Check the extension ID before allowing one: the name and description come from the plugin itself."
      >
        {external.length === 0 && (
          <p className="py-3 text-sm text-muted-foreground">No plugins installed.</p>
        )}
        {external.map((plugin) => (
          <Row
            key={plugin.id}
            icon={<Puzzle className="size-4 text-muted-foreground" />}
            title={pluginName(plugin.name, reserved)}
            description={[plugin.description, describeAccess(plugin.access)].filter(Boolean).join(" · ")}
            detail={`Extension ID ${plugin.id}`}
          >
            <div className="flex items-center gap-2">
              {plugin.status !== "allowed" && (
                <span className="text-xs text-muted-foreground">
                  {plugin.status === "pending" ? "Waiting for approval" : "Blocked"}
                </span>
              )}
              {plugin.status === "pending" ? (
                <Button variant="ghost" size="sm" onClick={() => void setStatus(plugin.id, "denied")}>
                  Block
                </Button>
              ) : (
                <Button variant="ghost" size="sm" onClick={() => void removePlugin(plugin.id)}>
                  Remove
                </Button>
              )}
              {plugin.status === "allowed" ? (
                <Switch
                  checked
                  onCheckedChange={() => void setStatus(plugin.id, "denied")}
                  aria-label={`Turn off ${pluginName(plugin.name, reserved)}`}
                />
              ) : (
                <Button size="sm" onClick={() => void setStatus(plugin.id, "allowed")}>
                  Allow
                </Button>
              )}
            </div>
          </Row>
        ))}
      </Section>
    </main>
  )
}

/** A plugin row. Plugins with static commands expand to switch each command on or off. */
function GeneralPlugin({ plugin, settings, toggle }: { plugin: Plugin; settings: Settings; toggle: ReactNode }) {
  const [open, setOpen] = useState(false)
  const commands = plugin.commands ?? []
  const on = isEnabled(plugin, settings)

  return (
    <div>
      <Row title={plugin.name} description={plugin.description}>
        {commands.length > 0 && (
          <Button
            variant="ghost"
            size="sm"
            className="text-muted-foreground"
            aria-expanded={open}
            onClick={() => setOpen(!open)}
          >
            {commands.length} commands
            <ChevronRight className={`transition-transform ${open ? "rotate-90" : ""}`} />
          </Button>
        )}
        {toggle}
      </Row>
      {open && (
        <div className={`mb-3 divide-y rounded-lg border bg-muted/30 px-3 ${on ? "" : "opacity-50"}`}>
          {commands.map((command) => {
            const id = `${plugin.id}:${command.id}`
            const Icon = typeof command.icon === "string" ? undefined : command.icon
            return (
              <Row
                key={id}
                icon={Icon && <Icon className="size-4 text-muted-foreground" />}
                title={command.title}
                description={command.subtitle}
              >
                <Switch
                  checked={isCommandEnabled(id, command, settings)}
                  disabled={!on}
                  onCheckedChange={(enabled) => void setCommandEnabled(id, enabled)}
                  aria-label={command.title}
                />
              </Row>
            )
          })}
        </div>
      )}
    </div>
  )
}

function Section({ title, description, children }: { title: string; description?: ReactNode; children: ReactNode }) {
  return (
    <section className="mt-12">
      <h2 className="text-sm font-medium">{title}</h2>
      {description && <p className="mt-1 text-sm text-muted-foreground">{description}</p>}
      <div className="mt-3 divide-y rounded-xl border bg-card px-4">{children}</div>
    </section>
  )
}

function Row({
  icon,
  title,
  description,
  detail,
  children,
}: {
  icon?: ReactNode
  title: string
  description?: string
  /** A smaller monospace line, e.g. an extension ID. */
  detail?: string
  children: ReactNode
}) {
  return (
    <div className="flex items-center gap-3 py-3">
      {icon && <div className="flex size-5 shrink-0 items-center justify-center">{icon}</div>}
      <div className="min-w-0 flex-1">
        <div className="text-sm font-medium">{title}</div>
        {description && <div className="text-xs text-muted-foreground">{description}</div>}
        {detail && <div className="mt-0.5 font-mono text-[11px] break-all text-muted-foreground">{detail}</div>}
      </div>
      {children}
    </div>
  )
}

function SiteIcon({ url }: { url?: string }) {
  const src = favicon(url)
  return src ? <img src={src} alt="" className="size-4 rounded-[3px]" /> : null
}

function ShortcutText({ shortcut }: { shortcut: string }) {
  return <>{formatShortcut(shortcut).join("")}</>
}
