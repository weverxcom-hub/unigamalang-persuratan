"use client";
import { useRouter, useSearchParams } from "next/navigation";
import { useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { ARCHIVE_STATUS_LABEL, DIRECTION_LABEL } from "@/lib/reports";

interface UnitOption {
  id: string;
  code: string;
  name: string;
}
interface LetterTypeOption {
  id: string;
  code: string;
  name: string;
}

interface Props {
  initial: {
    from?: string;
    to?: string;
    unitId?: string;
    letterTypeId?: string;
    direction?: string;
    status?: string;
  };
  units: UnitOption[];
  letterTypes: LetterTypeOption[];
  isSuper: boolean;
}

const ANY = "__any__";
const STATUS_OPTIONS: (keyof typeof ARCHIVE_STATUS_LABEL)[] = [
  "DRAFT",
  "PENDING",
  "PENDING_PROOF",
  "APPROVED",
  "ISSUED",
  "OVERDUE",
  "VOID",
];
const DIRECTION_OPTIONS: (keyof typeof DIRECTION_LABEL)[] = ["OUTGOING", "INCOMING"];

export function LettersFilters({ initial, units, letterTypes, isSuper }: Props) {
  const router = useRouter();
  const search = useSearchParams();

  const defaults = useMemo(() => {
    const now = new Date();
    const fromIso = `${now.getFullYear()}-01-01`;
    const toIso = `${now.getFullYear()}-12-31`;
    return { fromIso, toIso };
  }, []);

  const [from, setFrom] = useState(initial.from ?? defaults.fromIso);
  const [to, setTo] = useState(initial.to ?? defaults.toIso);
  const [unitId, setUnitId] = useState(initial.unitId ?? ANY);
  const [letterTypeId, setLetterTypeId] = useState(initial.letterTypeId ?? ANY);
  const [direction, setDirection] = useState(initial.direction ?? ANY);
  const [status, setStatus] = useState(initial.status ?? ANY);

  function apply() {
    const params = new URLSearchParams(search.toString());
    setOrDelete(params, "from", from);
    setOrDelete(params, "to", to);
    setOrDelete(params, "unitId", isSuper && unitId !== ANY ? unitId : "");
    setOrDelete(params, "letterTypeId", letterTypeId !== ANY ? letterTypeId : "");
    setOrDelete(params, "direction", direction !== ANY ? direction : "");
    setOrDelete(params, "status", status !== ANY ? status : "");
    router.push(`/dashboard/reports/letters?${params.toString()}`);
  }

  function reset() {
    router.push("/dashboard/reports/letters");
  }

  return (
    <div className="space-y-4">
      <div className="grid gap-3 md:grid-cols-3">
        <div className="space-y-1">
          <Label htmlFor="from">Dari Tanggal</Label>
          <Input id="from" type="date" value={from} onChange={(e) => setFrom(e.target.value)} />
        </div>
        <div className="space-y-1">
          <Label htmlFor="to">Sampai Tanggal</Label>
          <Input id="to" type="date" value={to} onChange={(e) => setTo(e.target.value)} />
        </div>
        {isSuper && (
          <div className="space-y-1">
            <Label>Unit</Label>
            <Select value={unitId} onValueChange={setUnitId}>
              <SelectTrigger>
                <SelectValue placeholder="Semua unit" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={ANY}>Semua unit</SelectItem>
                {units.map((u) => (
                  <SelectItem key={u.id} value={u.id}>
                    {u.code} — {u.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        )}
        <div className="space-y-1">
          <Label>Jenis Surat</Label>
          <Select value={letterTypeId} onValueChange={setLetterTypeId}>
            <SelectTrigger>
              <SelectValue placeholder="Semua jenis" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={ANY}>Semua jenis</SelectItem>
              {letterTypes.map((t) => (
                <SelectItem key={t.id} value={t.id}>
                  {t.code} — {t.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1">
          <Label>Arah</Label>
          <Select value={direction} onValueChange={setDirection}>
            <SelectTrigger>
              <SelectValue placeholder="Semua arah" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={ANY}>Semua arah</SelectItem>
              {DIRECTION_OPTIONS.map((d) => (
                <SelectItem key={d} value={d}>
                  {DIRECTION_LABEL[d]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1">
          <Label>Status</Label>
          <Select value={status} onValueChange={setStatus}>
            <SelectTrigger>
              <SelectValue placeholder="Semua status" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={ANY}>Semua status</SelectItem>
              {STATUS_OPTIONS.map((s) => (
                <SelectItem key={s} value={s}>
                  {ARCHIVE_STATUS_LABEL[s]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <Button onClick={apply}>Terapkan</Button>
        <Button variant="outline" onClick={reset}>
          Atur Ulang
        </Button>
      </div>
    </div>
  );
}

function setOrDelete(params: URLSearchParams, key: string, value: string) {
  if (value && value !== "") params.set(key, value);
  else params.delete(key);
}
