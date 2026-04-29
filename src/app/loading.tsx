import { UnigaLoader } from "@/components/brand/uniga-loader";

export default function RootLoading() {
  return (
    <div className="flex min-h-[60vh] items-center justify-center px-4">
      <UnigaLoader caption="Memuat sistem persuratan…" />
    </div>
  );
}
