import Link from "next/link";

export default function ArticleNotFound() {
  return (
    <main className="min-h-screen flex flex-col items-center justify-center gap-4 text-center p-5">
      <h1 className="text-xl font-medium">Article not found</h1>
      <p className="text-sm text-muted-foreground">
        This article doesn&apos;t exist or hasn&apos;t been published.
      </p>
      <Link href={"/"} className="text-sm font-medium hover:underline">
        Back to homepage
      </Link>
    </main>
  );
}
