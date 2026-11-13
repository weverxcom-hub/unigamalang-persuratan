"use client";

import { useCallback, useEffect, useState } from "react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { validateNumberTemplate } from "@/lib/format";
import { exampleNumbers, TEMPLATE_2027 } from "@/lib/numbering-2027/catalog";
import type { ApplyPlan, PlanStep } from "@/lib/numbering-2027/plan";

const CONFIRM_WORD = "TERAPKAN";

type Policy = { template: string; appliedAt: string; appliedByEmail: string | null };
type PolicyResponse = { policy: Policy | null; template: string; plan: ApplyPlan };

function actionLabel(step: PlanStep): string {
  if (step.action === "create") return "Dibuat";
  if (step.action === "unchanged") return "Tetap";
  if (step.fromCode) return `Diubah dari ${step.fromCode}`;
  return step.reactivate ? "Diaktifkan kembali" : "Diubah";
}

function countSteps(steps: PlanStep[]) {
  const count = (action: PlanStep["action"]) => steps.filter((s) => s.action === action).length;
  return `${count("create")} dibuat, ${count("update")} diubah, ${count("unchanged")} tetap`;
}

// Rows that will change first, so the reviewer does not have to scroll past
// forty "Tetap" lines to find the three that matter.
function changesFirst(steps: PlanStep[]): PlanStep[] {
  return [...steps].sort(
    (a, b) => Number(a.action === "unchanged") - Number(b.action === "unchanged")
  );
}

function StepTable({ title, steps }: { title: string; steps: PlanStep[] }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>{title}</CardTitle>
        <CardDescription>{countSteps(steps)}</CardDescription>
      </CardHeader>
      <CardContent>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-[180px]">Kode</TableHead>
              <TableHead>Nama</TableHead>
              <TableHead className="w-[200px]">Tindakan</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {changesFirst(steps).map((step) => (
              <TableRow key={step.code}>
                <TableCell className="font-mono">{step.code}</TableCell>
                <TableCell>{step.name}</TableCell>
                <TableCell>
                  <Badge variant={step.action === "unchanged" ? "secondary" : "default"}>
                    {actionLabel(step)}
                  </Badge>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  );
}

export function NumberingRuleClient() {
  const [template, setTemplate] = useState(TEMPLATE_2027);
  const [data, setData] = useState<PolicyResponse | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [confirmText, setConfirmText] = useState("");
  const [applying, setApplying] = useState(false);
  const [applyError, setApplyError] = useState<string | null>(null);
  const [appliedNow, setAppliedNow] = useState(false);
  // The first response tells us the stored template (if the rule was applied
  // before); adopt it once, then the input belongs to the user.
  const [initialised, setInitialised] = useState(false);

  const templateError = validateNumberTemplate(template);

  const load = useCallback(async (tpl: string | null, signal?: AbortSignal) => {
    try {
      const query = tpl ? `?template=${encodeURIComponent(tpl)}` : "";
      const res = await fetch(`/api/numbering/policy${query}`, { signal });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Gagal memuat pratinjau");
      setData(json);
      setLoadError(null);
      return json as PolicyResponse;
    } catch (err) {
      if (err instanceof DOMException && err.name === "AbortError") return null;
      setLoadError(err instanceof Error ? err.message : "Terjadi kesalahan");
      return null;
    }
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    if (!initialised) {
      load(null, controller.signal).then((json) => {
        if (!json) return;
        setTemplate(json.template);
        setInitialised(true);
      });
      return () => controller.abort();
    }
    if (templateError) return;
    const timer = setTimeout(() => load(template, controller.signal), 400);
    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [initialised, template, templateError, load]);

  async function apply() {
    setApplying(true);
    setApplyError(null);
    try {
      const res = await fetch("/api/numbering/policy", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ template, confirm: confirmText }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Gagal menerapkan");
      setDialogOpen(false);
      setConfirmText("");
      setAppliedNow(true);
      await load(template);
    } catch (err) {
      setApplyError(err instanceof Error ? err.message : "Terjadi kesalahan");
    } finally {
      setApplying(false);
    }
  }

  if (loadError && !data) {
    return <p className="text-sm font-medium text-destructive">Gagal memuat: {loadError}</p>;
  }
  if (!data) {
    return <p className="text-sm text-muted-foreground">Memuat…</p>;
  }

  const { policy, plan } = data;
  const hasChanges = [...plan.units, ...plan.letterTypes].some((s) => s.action !== "unchanged");
  const untouched = [
    ...plan.untouchedUnits.map((u) => ({ ...u, kind: "Unit" })),
    ...plan.untouchedLetterTypes.map((t) => ({ ...t, kind: "Jenis surat" })),
  ];
  const year = new Date().getFullYear();

  return (
    <div className="space-y-6">
      <Card className={policy ? "border-emerald-500/40 bg-emerald-500/5" : undefined}>
        <CardContent className="pt-6">
          {policy ? (
            <p className="text-sm">
              <span className="font-semibold">Sudah diterapkan</span> pada{" "}
              {new Date(policy.appliedAt).toLocaleString("id-ID", {
                timeZone: "Asia/Jakarta",
                dateStyle: "long",
                timeStyle: "short",
              })}{" "}
              WIB{policy.appliedByEmail ? ` oleh ${policy.appliedByEmail}` : ""}, dengan template{" "}
              <code className="font-mono">{policy.template}</code>.
            </p>
          ) : (
            <p className="text-sm">
              <span className="font-semibold">Belum diterapkan.</span> Aplikasi memakai penomoran yang
              sekarang.
            </p>
          )}
          {appliedNow && (
            <p className="mt-2 text-sm font-medium text-emerald-600">
              Selesai. Nomor berikutnya memakai aturan ini.
            </p>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Template nomor</CardTitle>
          <CardDescription>
            Dipasang ke semua unit pada daftar di bawah. <code>[SEQ]</code> nomor urut tanpa nol,{" "}
            <code>[NO]</code> tiga digit, <code>[UNIT_CODE]</code>, <code>[TYPE_CODE]</code>,{" "}
            <code>[ROMAN_MONTH]</code>, <code>[YEAR]</code>.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="space-y-1.5">
            <Label htmlFor="numbering-template">Template</Label>
            <div className="flex flex-col gap-2 sm:flex-row">
              <Input
                id="numbering-template"
                className="font-mono"
                value={template}
                onChange={(e) => setTemplate(e.target.value)}
                spellCheck={false}
              />
              <Button
                type="button"
                variant="outline"
                className="shrink-0"
                onClick={() => setTemplate(TEMPLATE_2027)}
                disabled={template === TEMPLATE_2027}
              >
                Kembalikan ke bawaan
              </Button>
            </div>
            {templateError && <p className="text-sm font-medium text-destructive">{templateError}</p>}
          </div>
          {!templateError && (
            <div>
              <p className="text-sm text-muted-foreground">Contoh hasil:</p>
              <ul className="mt-1 space-y-0.5 font-mono text-sm">
                {exampleNumbers(template, year).map((n) => (
                  <li key={n}>{n}</li>
                ))}
              </ul>
            </div>
          )}
        </CardContent>
      </Card>

      {loadError && <p className="text-sm font-medium text-destructive">Gagal memuat: {loadError}</p>}

      <StepTable title="Unit" steps={plan.units} />
      <StepTable title="Jenis surat" steps={plan.letterTypes} />

      {untouched.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Tidak disentuh</CardTitle>
            <CardDescription>
              Unit dan jenis surat ini tidak ada di daftar baru. Kode dan templatenya tidak diubah.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <ul className="space-y-1 text-sm">
              {untouched.map((row) => (
                <li key={`${row.kind}-${row.id}`}>
                  <span className="text-muted-foreground">{row.kind}:</span>{" "}
                  <span className="font-mono">{row.code}</span> — {row.name}
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      )}

      <Card className="border-destructive/30">
        <CardContent className="flex flex-col items-start gap-3 pt-6 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-sm">
            Penerapan langsung berlaku untuk nomor berikutnya dan tidak bisa dibatalkan dari aplikasi.
            Buat cadangan database lebih dulu.
          </p>
          <Button
            className="shrink-0"
            onClick={() => {
              setApplyError(null);
              setDialogOpen(true);
            }}
            disabled={Boolean(templateError) || !hasChanges}
          >
            {hasChanges ? "Terapkan aturan baru" : "Tidak ada perubahan"}
          </Button>
        </CardContent>
      </Card>

      <AlertDialog
        open={dialogOpen}
        onOpenChange={(open) => {
          if (applying) return;
          setDialogOpen(open);
          if (!open) setConfirmText("");
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Terapkan aturan penomoran baru?</AlertDialogTitle>
            <AlertDialogDescription>
              Unit: {countSteps(plan.units)}. Jenis surat: {countSteps(plan.letterTypes)}. Nomor yang
              sudah terbit tidak berubah. Ketik {CONFIRM_WORD} untuk melanjutkan.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <Input
            aria-label={`Ketik ${CONFIRM_WORD}`}
            value={confirmText}
            onChange={(e) => setConfirmText(e.target.value)}
            placeholder={CONFIRM_WORD}
            autoComplete="off"
          />
          {applyError && <p className="text-sm font-medium text-destructive">Gagal: {applyError}</p>}
          <AlertDialogFooter>
            <AlertDialogCancel disabled={applying}>Batal</AlertDialogCancel>
            <Button onClick={apply} disabled={applying || confirmText !== CONFIRM_WORD}>
              {applying ? "Sedang menerapkan..." : "Terapkan"}
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
