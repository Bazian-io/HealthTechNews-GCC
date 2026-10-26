export function ProductFooter() {
  return (
    <footer className="border-t border-border bg-card">
      <div className="mx-auto flex w-full max-w-6xl flex-col gap-3 px-5 py-8 text-sm sm:flex-row sm:items-center sm:justify-between sm:px-8 sm:py-10">
        <p className="font-editorial text-lg font-semibold text-foreground">
          GCC HealthTech News
        </p>
        <p className="text-muted-foreground">
          HealthTech news discovery across the six GCC countries.
        </p>
      </div>
    </footer>
  );
}
