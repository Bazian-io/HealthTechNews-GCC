"use client";

import {
  isUsableImageWidth,
  publisherInitial,
  safeImageUrl,
} from "@/lib/article-images.mjs";
import Image from "next/image";
import { useState } from "react";

type ImageStatus = "loading" | "loaded" | "failed";

// Publisher images are loaded from the publisher's own address, not copied or
// optimized here, so any public host works without a remotePatterns list.
export function ArticleImage({
  src,
  sizes,
  className = "",
  eager = false,
  fallback = "brand",
  publisher,
  placeholderSize = "sm",
  caption,
}: {
  src: string | null | undefined;
  sizes: string;
  className?: string;
  eager?: boolean;
  // "brand" keeps card layouts even; "hide" leaves list rows text-only.
  fallback?: "brand" | "hide";
  publisher?: string | null;
  placeholderSize?: "sm" | "lg";
  caption?: string | null;
}) {
  const imageUrl = safeImageUrl(src);
  // Track the address each status belongs to, so a new image starts fresh.
  const [result, setResult] = useState<{ src: string; status: ImageStatus } | null>(null);
  const status: ImageStatus =
    imageUrl && result?.src === imageUrl ? result.status : "loading";
  const hasImage = Boolean(imageUrl) && status !== "failed";

  if (!hasImage && fallback === "hide") {
    return null;
  }

  const frame = (
    <div
      className={`relative overflow-hidden rounded-md border border-border bg-muted ${
        hasImage && status === "loading" ? "animate-pulse motion-reduce:animate-none" : ""
      } ${className}`}
    >
      {hasImage && imageUrl ? (
        <Image
          src={imageUrl}
          alt=""
          fill
          unoptimized
          sizes={sizes}
          loading={eager ? "eager" : "lazy"}
          referrerPolicy="no-referrer"
          onLoad={(event) =>
            setResult({
              src: imageUrl,
              status: isUsableImageWidth(event.currentTarget.naturalWidth)
                ? "loaded"
                : "failed",
            })
          }
          onError={() => setResult({ src: imageUrl, status: "failed" })}
          className={`object-cover transition-opacity duration-500 motion-reduce:transition-none ${
            status === "loaded" ? "opacity-100" : "opacity-0"
          }`}
        />
      ) : (
        <BrandPlaceholder publisher={publisher} size={placeholderSize} />
      )}
    </div>
  );

  if (!caption || status !== "loaded") {
    return frame;
  }

  return (
    <figure>
      {frame}
      <figcaption className="mt-2 text-xs text-muted-foreground">
        {caption}
      </figcaption>
    </figure>
  );
}

function BrandPlaceholder({
  publisher,
  size,
}: {
  publisher?: string | null;
  size: "sm" | "lg";
}) {
  const initial = publisherInitial(publisher);
  const large = size === "lg";

  return (
    <div
      aria-hidden="true"
      className="image-placeholder flex h-full w-full items-center justify-center"
    >
      <div
        className={`image-placeholder-mark flex rotate-45 items-center justify-center rounded-[22%] ${
          large ? "h-24 w-24 sm:h-28 sm:w-28" : "h-10 w-10"
        }`}
      >
        {initial ? (
          <span
            className={`-rotate-45 font-editorial font-medium leading-none ${
              large ? "text-4xl sm:text-5xl" : "text-lg"
            }`}
          >
            {initial}
          </span>
        ) : (
          <span
            className={`image-placeholder-core rounded-[30%] ${large ? "h-8 w-8" : "h-3.5 w-3.5"}`}
          />
        )}
      </div>
    </div>
  );
}
