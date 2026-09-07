import { EnvVarWarning } from "@/components/env-var-warning";
import { AuthButton } from "@/components/auth-button";
import { ThemeSwitcher } from "@/components/theme-switcher";
import {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent,
  CardFooter,
} from "@/components/ui/card";
import { hasEnvVars } from "@/lib/utils";
import { createClient } from "@/lib/supabase/server";
import Link from "next/link";
import { Suspense } from "react";

// This page fetches articles at request time (Cache Components' "instant
// navigation" prerender check would otherwise flag that as blocking). We'll
// revisit caching once there's real content to cache.
export const instant = false;

type Article = {
  id: string;
  slug: string;
  title: string;
  summary: string | null;
  country: string | null;
  category: string | null;
  published_at: string | null;
};

async function getPublishedArticles(): Promise<Article[]> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("articles")
    .select("id, slug, title, summary, country, category, published_at")
    .eq("status", "published")
    .order("published_at", { ascending: false });

  return data ?? [];
}

export default async function Home() {
  const articles = await getPublishedArticles();

  return (
    <main className="min-h-screen flex flex-col items-center">
      <div className="flex-1 w-full flex flex-col gap-20 items-center">
        <nav className="w-full flex justify-center border-b border-b-foreground/10 h-16">
          <div className="w-full max-w-5xl flex justify-between items-center p-3 px-5 text-sm">
            <Link href={"/"} className="font-semibold">
              GCC HealthTech News
            </Link>
            {!hasEnvVars ? (
              <EnvVarWarning />
            ) : (
              <Suspense>
                <AuthButton />
              </Suspense>
            )}
          </div>
        </nav>
        <div className="flex-1 flex flex-col gap-20 max-w-5xl p-5 w-full">
          <main className="flex-1 flex flex-col gap-6 px-4">
            <h2 className="font-medium text-xl mb-4">Latest Articles</h2>
            <div className="flex flex-col gap-4">
              {articles.map((article) => (
                <Card key={article.id}>
                  <CardHeader>
                    <CardTitle>
                      <Link
                        href={`/news/${article.slug}`}
                        className="hover:underline"
                      >
                        {article.title}
                      </Link>
                    </CardTitle>
                    <CardDescription>
                      {[article.country, article.category]
                        .filter(Boolean)
                        .join(" · ")}
                      {article.published_at &&
                        ` · ${new Date(article.published_at).toLocaleDateString()}`}
                    </CardDescription>
                  </CardHeader>
                  {article.summary && (
                    <CardContent>{article.summary}</CardContent>
                  )}
                  <CardFooter>
                    <Link
                      href={`/news/${article.slug}`}
                      className="text-sm font-medium hover:underline"
                    >
                      Read article
                    </Link>
                  </CardFooter>
                </Card>
              ))}
            </div>
          </main>
        </div>

        <footer className="w-full flex items-center justify-center border-t mx-auto text-center text-xs gap-8 py-16">
          <ThemeSwitcher />
        </footer>
      </div>
    </main>
  );
}
