export function SiteFooter() {
  return (
    <footer className="mt-auto border-t bg-background/60 py-4">
      <div className="mx-auto flex max-w-7xl flex-col items-center justify-between gap-1 px-4 text-center text-xs text-muted-foreground sm:flex-row sm:px-6 lg:px-8">
        <span>
          &copy; {new Date().getFullYear()} Sistem Manajemen Persuratan Universitas Gajayana Malang
        </span>
        <span>
          Made by{" "}
          <a
            href="https://weverx.com"
            target="_blank"
            rel="noopener noreferrer"
            className="font-medium text-primary hover:underline"
          >
            weverx.com
          </a>
        </span>
      </div>
    </footer>
  );
}
