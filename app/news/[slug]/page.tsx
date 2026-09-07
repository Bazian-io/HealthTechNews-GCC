import { createClient } from "@/lib/supabase/server";
import {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent,
  CardFooter,
} from "@/components/ui/card";
import Link from "next/link";
import { notFound } from "next/navigation";

// Same reasoning as the homepage: this fetches per-request Supabase data,
// so it's marked as allowed to block rather than prerendered.
export const instant = false;

async function getPublishedArticleBySlug(slug: string) {
  const supabase = await createClient();
  const { data } = await supabase
    .from("articles")
    .select("title, summary, country, category, original_url, published_at")
    .eq("slug", slug)
    .eq("status", "published")
    .maybeSingle();

  return data;
}

export default async function ArticlePage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const article = await getPublishedArticleBySlug(slug);

  if (!article) {
    notFound();
  }

  return (
    <main className="min-h-screen flex flex-col items-center">
      <div className="flex-1 w-full flex flex-col gap-10 items-center max-w-3xl p-5">
        <nav className="w-full flex items-center h-16 border-b border-b-foreground/10 text-sm">
          <Link href={"/"} className="font-semibold">
            GCC HealthTech News
          </Link>
        </nav>

        <Card className="w-full">
          <CardHeader>
            <CardTitle className="text-2xl">{article.title}</CardTitle>
            <CardDescription>
              {[article.country, article.category]
                .filter(Boolean)
                .join(" · ")}
              {article.published_at &&
                ` · ${new Date(article.published_at).toLocaleDateString()}`}
            </CardDescription>
          </CardHeader>
          {article.summary && <CardContent>{article.summary}</CardContent>}
          <CardFooter>
            <a
              href={article.original_url}
              target="_blank"
              rel="noreferrer"
              className="text-sm font-medium hover:underline"
            >
              Read original
            </a>
          </CardFooter>
        </Card>
      </div>
    </main>
  );
}
