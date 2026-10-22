import { ProductFooter } from "@/components/product-footer";
import { ProductHeader } from "@/components/product-header";
import { SavedStoriesList } from "@/components/saved-stories";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Saved stories",
  description: "Your private GCC HealthTech News reading list.",
  robots: { index: false, follow: false },
};

export default function SavedStoriesPage() {
  return (
    <div className="flex min-h-screen flex-col bg-background">
      <ProductHeader />
      <main
        id="main-content"
        tabIndex={-1}
        className="mx-auto w-full max-w-4xl flex-1 px-5 py-10 focus:outline-none sm:px-8 sm:py-14"
      >
        <p className="text-xs font-semibold uppercase tracking-[0.16em] text-primary">
          Your reading list
        </p>
        <h1 className="mt-3 font-editorial text-4xl font-semibold tracking-tight sm:text-5xl">
          Saved stories
        </h1>
        <p className="mt-4 max-w-2xl text-base leading-7 text-muted-foreground">
          Keep useful coverage close at hand. Your saved stories stay on this
          device and are not sent to an account or the database.
        </p>
        <SavedStoriesList />
      </main>
      <ProductFooter />
    </div>
  );
}
