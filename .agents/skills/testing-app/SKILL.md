---
name: testing-app
description: Test the Sistem Persuratan Universitas Gajayana application end-to-end. Use when verifying archive management, approve/reject flows, letter numbering, dispositions, or role-based access.
---

# Testing — Sistem Persuratan Universitas Gajayana

## Devin Secrets Needed

- `VERCEL_BYPASS_TOKEN_UNIGAMALANG` (repo-scoped) — Vercel "Protection Bypass for Automation" token. Required to access SSO-protected preview deployments. Generate from Vercel Dashboard → Project Settings → Deployment Protection → Protection Bypass for Automation.

## Seed Accounts (from `prisma/seed.ts`)

All accounts share password: `Password123!`

| Email | Role | Unit |
|---|---|---|
| `superadmin@unigamalang.ac.id` | SUPER_ADMIN | — |
| `admin.rektorat@unigamalang.ac.id` | ADMIN_UNIT | UNIGA (Rektorat) |
| `admin.yayasan@unigamalang.ac.id` | ADMIN_UNIT | YAS (Yayasan) |
| `staff@unigamalang.ac.id` | USER | UNIGA (Rektorat) |

Note: These are demo/seed credentials and may not exist if the database was re-seeded or migrated. Always check `prisma/seed.ts` for the latest accounts.

## Accessing Vercel Preview Deployments

Vercel previews are SSO-protected (HTTP 401 without auth). To bypass:

1. **Via browser URL param** (sets a cookie for the session):
   ```
   https://<preview-url>/login?x-vercel-protection-bypass=<TOKEN>&x-vercel-set-bypass-cookie=true
   ```
2. **Via curl/fetch header:**
   ```
   curl -H "x-vercel-protection-bypass: <TOKEN>" https://<preview-url>/login
   ```

Preview URL pattern: `unigamalang-persuratan-git-devi-<hash>-weverxcom-9750s-projects.vercel.app`

To find preview URLs: run `git_pr(action="view_pr")` and look for base64-encoded Vercel bot comments containing `previewUrl`, or grep the PR page content for the pattern above.

## Production vs Preview

- **Production** (`https://unigamalang-persuratan.vercel.app`) deploys from `main` branch — may lag behind the dev branch.
- **Default dev branch**: `devin/1777049103-scaffold-unigamalang-persuratan` — PRs target this branch.
- PRs merged into dev branch are NOT automatically deployed to production until dev branch is merged to `main`.
- Each PR has its own Vercel preview that includes only that PR's changes on top of the base branch.

## Key Test Flows

### Sidebar (PR A scope)
- Login as superadmin → verify 4 section labels (Aktivitas, Akun, Master Data, Sistem)
- Check badge counts: Pengarsipan and Tiket Laporan should show non-zero badges; Disposisi should NOT show "0"
- Login as ADMIN_UNIT → verify no Master Data/Sistem sections, badge count is scoped (lower than superadmin)
- Test collapse button (chevron at bottom) → icon-only rail with dot badges
- localStorage key: `uniga.sidebar.collapsed`

### Dark Mode (PR B scope)
- Theme toggle button is in the topbar header (next to user name)
- Cycle: system → light → dark → system
- Button tooltip shows current mode in Indonesian: "saat ini: ikuti sistem" / "saat ini: terang" / "saat ini: gelap"
- localStorage key: `uniga.theme`
- Anti-FOUC: `<script>` injected in `<head>` reads localStorage and applies class before React hydrates
- Test persistence: set to dark, hard reload (Ctrl+Shift+R), verify no white flash

### Reports (PR C scope)
- Navigate to `/dashboard/reports` → 4 cards for superadmin, 2 disabled for non-superadmin
- Disabled cards show "Hanya untuk Super Admin." label and are not wrapped in `<a>` tags
- Direct URL to restricted reports (e.g., `/dashboard/reports/tickets`) redirects non-superadmin to `/dashboard/reports`
- Laporan Surat: filter by date range, verify summary cards + breakdown + detail table
- CSV export: check for UTF-8 BOM (`EF BB BF`), correct headers, formula injection guard (no cells starting with `=+\-@\t` without `'` prefix)
- XLSX export: uses ExcelJS, similar hardening
- Print button triggers `window.print()` — filter form hidden via `@media print`

### Archive Approve/Reject Flow (PR #34 scope)
- Navigate to `/dashboard/archives` → look for archives with status "Menunggu Persetujuan" (PENDING)
- PENDING archives show ✓ (Setujui) and ✗ (Tolak) action buttons — only visible to ADMIN_UNIT and SUPER_ADMIN (not USER)
- **Approve (✓)**: Calls `PATCH /api/archives/[id]` with `{ action: "APPROVE" }` — allocates real sequence number via `allocateNextNumber()` and transitions to PENDING_PROOF
- **Reject (✗)**: Opens "Tolak Arsip" dialog with optional rejection reason textarea, then calls `PATCH /api/archives/[id]` with `{ action: "REJECT" }` — soft-deletes the archive
- Status filter dropdown should include "Menunggu Persetujuan" option (6 total options)
- **Test order matters**: Only test reject dialog UI (open + cancel) before approve, since approve/reject are destructive and consume the PENDING archive. If only 1 PENDING archive exists, test reject dialog UI first (cancel without rejecting), then approve.
- To create PENDING archives for testing: login as USER role (`staff@unigamalang.ac.id`) and create a surat keluar via `/dashboard/generate`

### ManualArchiveDialog Form Reset Bug (PR #34 scope)
- Open "Arsipkan Surat (Lama / Masuk)" dialog on `/dashboard/archives`
- Fill in Perihal and Diteruskan ke fields with test values
- Change Unit dropdown (only available for SUPER_ADMIN — disabled for ADMIN_UNIT)
- Verify Perihal and Diteruskan ke fields are NOT reset after unit change
- Jenis Surat dropdown may change if selected type is invalid for new unit (expected behavior)

## Common Issues

- **Vercel SSO 401**: Ensure bypass token is set via URL param or header. Token might expire if regenerated in Vercel dashboard. Note: The bypass token approach might not work if the team uses Vercel Authentication (team SSO) instead of standard deployment protection — in that case, deploy changes to production via main branch merge instead.
- **No data in reports**: Seed data only exists if `prisma db seed` was run. Check if DB has archives/dispositions.
- **Badge count = 0 everywhere**: Might mean no pending items in DB. Create test data or check seed.
- **Theme toggle not visible**: Only present in PR B (dark mode) branch. Production/other PRs might not have it unless PR B is merged into their base.
- **Preview deployment inaccessible**: If Vercel preview returns 401 despite bypass token, the project might use Vercel Authentication (team SSO) which cannot be bypassed via automation tokens. Workaround: create a sync PR to merge dev → main, have the user merge it, then test on production URL.
- **Approve flow error "Gagal menyetujui arsip"**: The APPROVE path in `PATCH /api/archives/[id]` might throw unhandled exceptions from `allocateNextNumber()` if the archive's `letterTypeId` references a deleted/invalid letter type. Check Vercel function logs for the actual error. The PATCH handler might need better error handling (try-catch) around the approve transaction.
- **Only 1 PENDING archive available**: If you need to test both approve and reject, test reject dialog UI first (open → verify → cancel) then approve. Don't reject first or you'll lose the only test archive.
