// Credits other publishers whose copies of the same story are grouped into one card.
export function AlsoReported({ publishers }: { publishers?: string[] }) {
  if (!publishers?.length) {
    return null;
  }

  return (
    <p className="text-xs leading-5 text-muted-foreground">
      Also reported by {publishers.join(", ")}
    </p>
  );
}
