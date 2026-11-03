import { Puzzle } from "lucide-react"
import { useEffect, useState, type ReactNode } from "react"
import { Button } from "@/components/ui/button"
import { Kbd, KbdGroup } from "@/components/ui/kbd"
import { Switch } from "@/components/ui/switch"
import { getPlugins, removePlugin, setStatus, type StoredPlugin } from "@/core/external"
import { formatShortcut } from "@/core/keys"
import { getSettings, isEnabled, onSettingsChanged, setPluginEnabled, type Settings } from "@/core/settings"
import type { Plugin } from "@/core/types"
import { favicon } from "@/plugins/util"

export function Options({ plugins }: { plugins: Plugin[] }) {
  const [settings, setSettings] = useState<Settings>()
  const [external, setExternal] = useState<StoredPlugin[]>([])
  const [shortcuts, setShortcuts] = useState<chrome.commands.Command[]>([])

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
          <Row key={plugin.id} title={plugin.name} description={plugin.description}>
            {toggle(plugin)}
          </Row>
        ))}
      </Section>

      <Section
        title="From other extensions"
        description="Extensions built with @palette/sdk can add their own commands. They see the current tab's title and address when the palette asks them for commands."
      >
        {external.length === 0 && (
          <p className="py-3 text-sm text-muted-foreground">No plugins installed.</p>
        )}
        {external.map((plugin) => (
          <Row
            key={plugin.id}
            icon={<Puzzle className="size-4 text-muted-foreground" />}
            title={plugin.name}
            description={plugin.status === "pending" ? "Waiting for your approval" : plugin.description}
          >
            <div className="flex items-center gap-2">
              <Button variant="ghost" size="sm" onClick={() => void removePlugin(plugin.id)}>
                Remove
              </Button>
              <Switch
                checked={plugin.status === "allowed"}
                onCheckedChange={(on) => void setStatus(plugin.id, on ? "allowed" : "denied")}
                aria-label={plugin.name}
              />
            </div>
          </Row>
        ))}
      </Section>
    </main>
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
  children,
}: {
  icon?: ReactNode
  title: string
  description?: string
  children: ReactNode
}) {
  return (
    <div className="flex items-center gap-3 py-3">
      {icon && <div className="flex size-5 shrink-0 items-center justify-center">{icon}</div>}
      <div className="min-w-0 flex-1">
        <div className="text-sm font-medium">{title}</div>
        {description && <div className="text-xs text-muted-foreground">{description}</div>}
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
