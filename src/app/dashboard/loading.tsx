import { UnigaLoader } from "@/components/brand/uniga-loader";

/**
 * Default dashboard loading state. Next renders this whenever a child route
 * server-component is suspended (initial fetch, route change, revalidate)
 * unless the segment provides its own `loading.tsx`.
 */
export default function DashboardLoading() {
  return (
    <div className="flex min-h-[50vh] items-center justify-center">
      <UnigaLoader caption="Memuat halaman…" />
    </div>
  );
}
