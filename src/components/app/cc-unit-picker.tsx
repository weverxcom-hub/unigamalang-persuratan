"use client";
import { useMemo, useState } from "react";
import { X } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";

export interface CcUnitOption {
  id: string;
  code: string;
  name: string;
}

interface CcUnitPickerProps {
  units: CcUnitOption[];
  value: string[];
  onChange: (ids: string[]) => void;
}

/** Multi-select unit tembusan: kotak cari + daftar centang + chip terpilih. */
export function CcUnitPicker({ units, value, onChange }: CcUnitPickerProps) {
  const [query, setQuery] = useState("");
  const selected = useMemo(() => new Set(value), [value]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return units;
    return units.filter(
      (u) => u.code.toLowerCase().includes(q) || u.name.toLowerCase().includes(q)
    );
  }, [units, query]);

  function toggle(id: string) {
    onChange(selected.has(id) ? value.filter((v) => v !== id) : [...value, id]);
  }

  const chosen = units.filter((u) => selected.has(u.id));

  return (
    <div className="space-y-2">
      {chosen.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {chosen.map((u) => (
            <Badge key={u.id} variant="secondary" className="gap-1">
              {u.code}
              <button
                type="button"
                onClick={() => toggle(u.id)}
                aria-label={`Hapus tembusan ${u.name}`}
                className="rounded-full hover:text-destructive"
              >
                <X className="h-3 w-3" />
              </button>
            </Badge>
          ))}
        </div>
      )}
      <Input
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder="Cari unit tembusan…"
        aria-label="Cari unit tembusan"
      />
      <div className="max-h-44 overflow-y-auto rounded-md border">
        {filtered.length === 0 ? (
          <p className="px-3 py-2 text-xs text-muted-foreground">Tidak ada unit yang cocok.</p>
        ) : (
          filtered.map((u) => (
            <label
              key={u.id}
              className="flex cursor-pointer items-center gap-2 px-3 py-1.5 text-sm hover:bg-accent"
            >
              <input
                type="checkbox"
                checked={selected.has(u.id)}
                onChange={() => toggle(u.id)}
                className="h-4 w-4"
              />
              <span className="font-mono text-xs">{u.code}</span>
              <span className="truncate">{u.name}</span>
            </label>
          ))
        )}
      </div>
    </div>
  );
}
