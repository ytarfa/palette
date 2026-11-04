import { ChevronRight, Globe, Puzzle } from "lucide-react"
import { useState } from "react"
import { CommandItem, CommandShortcut } from "@/components/ui/command"
import { formatShortcutText } from "@/core/keys"
import type { Command as Item, Icon } from "@/core/types"

export function ItemRow({ item, onSelect }: { item: Item; onSelect: () => void }) {
  return (
    <CommandItem value={item.id} onSelect={onSelect} className="gap-2.5 py-2">
      <ItemIcon icon={item.icon} />
      <span className="max-w-[65%] shrink-0 truncate">{item.title}</span>
      {item.badge && (
        <span className="flex max-w-[30%] shrink-0 items-center gap-1 rounded-sm border px-1.5 text-[11px] text-muted-foreground">
          <Puzzle className="size-3" />
          <span className="truncate">{item.badge}</span>
        </span>
      )}
      {item.subtitle && (
        <span className="min-w-0 truncate text-xs text-muted-foreground">
          {item.subtitle}
        </span>
      )}
      {item.hint && (
        <CommandShortcut className="shrink-0 tracking-normal whitespace-nowrap">{item.hint}</CommandShortcut>
      )}
      {item.shortcut && <CommandShortcut>{formatShortcutText(item.shortcut)}</CommandShortcut>}
      {item.children && (
        <ChevronRight
          data-slot="command-shortcut"
          className="ml-auto text-muted-foreground"
        />
      )}
    </CommandItem>
  )
}

function ItemIcon({ icon }: { icon?: Icon }) {
  const [failed, setFailed] = useState(false)
  if (!icon) return <span className="size-4 shrink-0" />
  if (typeof icon !== "string") {
    const Component = icon
    return <Component className="text-muted-foreground" />
  }
  if (failed) return <Globe className="text-muted-foreground" />
  return (
    <img src={icon} alt="" className="size-4 shrink-0 rounded-[3px]" onError={() => setFailed(true)} />
  )
}
