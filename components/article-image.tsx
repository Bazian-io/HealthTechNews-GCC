"use client";

import { Newspaper } from "lucide-react";
import Image from "next/image";
import { useState } from "react";

// Publisher images are loaded from the publisher's own address, not copied or
// optimized here, so any public host works without a remotePatterns list.
export function ArticleImage({
  src,
  sizes,
  className = "",
  eager = false,
  hideWhenMissing = false,
  caption,
}: {
  src: string | null | undefined;
  sizes: string;
  className?: string;
  eager?: boolean;
  hideWhenMissing?: boolean;
  caption?: string | null;
}) {
  // Track which address failed, so a different image is tried again.
  const [failedSrc, setFailedSrc] = useState<string | null>(null);
  const hasImage = Boolean(src) && failedSrc !== src;

  if (!hasImage && hideWhenMissing) {
    return null;
  }

  const frame = (
    <div
      className={`relative overflow-hidden rounded-md border border-border bg-muted ${className}`}
    >
      {hasImage && src ? (
        <Image
          src={src}
          alt=""
          fill
          unoptimized
          sizes={sizes}
          loading={eager ? "eager" : "lazy"}
          referrerPolicy="no-referrer"
          onError={() => setFailedSrc(src)}
          className="object-cover"
        />
      ) : (
        <div
          aria-hidden="true"
          className="flex h-full w-full items-center justify-center text-muted-foreground/60"
        >
          <Newspaper className="h-8 w-8" strokeWidth={1.5} />
        </div>
      )}
    </div>
  );

  if (!caption || !hasImage) {
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
