"use client";
import { useRouter, useSearchParams } from "next/navigation";
import { useState } from "react";
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
import { DISPOSITION_STATUS_LABEL } from "@/lib/reports";

const ANY = "__any__";
const STATUS_OPTIONS: (keyof typeof DISPOSITION_STATUS_LABEL)[] = [
  "PENDING",
  "ACKNOWLEDGED",
  "COMPLETED",
  "REJECTED",
];

interface UnitOption {
  id: string;
  code: string;
  name: string;
}

interface Props {
  initial: { from?: string; to?: string; unitId?: string; status?: string };
  units: UnitOption[];
  isSuper: boolean;
}

export function DispositionsReportFilters({ initial, units, isSuper }: Props) {
  const router = useRouter();
  const search = useSearchParams();

  const now = new Date();
  const [from, setFrom] = useState(initial.from ?? `${now.getFullYear()}-01-01`);
  const [to, setTo] = useState(initial.to ?? `${now.getFullYear()}-12-31`);
  const [unitId, setUnitId] = useState(initial.unitId ?? ANY);
  const [status, setStatus] = useState(initial.status ?? ANY);

  function apply() {
    const params = new URLSearchParams(search.toString());
    setOrDelete(params, "from", from);
    setOrDelete(params, "to", to);
    setOrDelete(params, "unitId", isSuper && unitId !== ANY ? unitId : "");
    setOrDelete(params, "status", status !== ANY ? status : "");
    router.push(`/dashboard/reports/dispositions?${params.toString()}`);
  }

  function reset() {
    router.push("/dashboard/reports/dispositions");
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
            <Label>Unit Penerima</Label>
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
          <Label>Status</Label>
          <Select value={status} onValueChange={setStatus}>
            <SelectTrigger>
              <SelectValue placeholder="Semua status" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={ANY}>Semua status</SelectItem>
              {STATUS_OPTIONS.map((s) => (
                <SelectItem key={s} value={s}>
                  {DISPOSITION_STATUS_LABEL[s]}
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
