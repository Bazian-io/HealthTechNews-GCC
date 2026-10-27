"use client";

import { layoutBubbles } from "@/lib/theme-landscape.mjs";
import Link from "next/link";
import { type KeyboardEvent, useId, useMemo, useState } from "react";

type LandscapeTheme = {
  id: string;
  label: string;
  short_label: string;
  story_count: number;
  previous_count: number;
  change: number;
  momentum: number;
  status: "Gaining" | "Steady" | "Fading" | "Not compared";
  publisher_count: number;
  limited: boolean;
  headlines: Array<{
    id: string;
    title: string;
    slug: string | null;
    source_name: string | null;
  }>;
};

type LandscapePeriod = {
  id: string;
  label: string;
  comparison: string;
  has_comparison: boolean;
  mapped: boolean;
  themes: LandscapeTheme[];
};

export type ThemeLandscapeAnalysis = {
  generated_at: string;
  periods: LandscapePeriod[];
};

type BubbleNode = {
  id: string;
  x: number;
  y: number;
  radius: number;
  inside: boolean;
};

// Two drawings of the same data: labels stay readable on phones and desktops.
// Margins keep bubbles clear of the corner tags and the bottom axis.
const CANVASES = {
  wide: {
    width: 800, height: 430, padding: 72, minRadius: 16, maxRadius: 58, font: 13,
    topMargin: 40, bottomMargin: 58,
  },
  narrow: {
    width: 360, height: 430, padding: 48, minRadius: 13, maxRadius: 40, font: 12,
    topMargin: 38, bottomMargin: 56,
  },
} as const;

type Canvas = (typeof CANVASES)[keyof typeof CANVASES];

function tagWidth(text: string, font: number) {
  return text.length * (font - 1) * 0.74 + 18;
}

// A small uppercase pill in the site's editorial style, drawn inside the SVG.
function ChartTag({
  x,
  y,
  text,
  tone,
  font,
  anchor = "start",
}: {
  x: number;
  y: number;
  text: string;
  tone: "primary" | "accent";
  font: number;
  anchor?: "start" | "end";
}) {
  const size = font - 1;
  const width = tagWidth(text, font);
  const height = size + 12;
  const left = anchor === "end" ? x - width : x;

  return (
    // Full class names, so Tailwind keeps both tone styles in the build.
    <g
      className={`landscape-tag ${tone === "primary" ? "landscape-tag-primary" : "landscape-tag-accent"}`}
      aria-hidden="true"
    >
      <rect x={left} y={y} width={width} height={height} rx={height / 2} />
      <text
        x={left + width / 2}
        y={y + height / 2}
        textAnchor="middle"
        dominantBaseline="central"
        fontSize={size}
      >
        {text}
      </text>
    </g>
  );
}

function defaultPeriod(periods: LandscapePeriod[]) {
  return (
    periods.find((period) => period.mapped && period.has_comparison)
    ?? periods.find((period) => period.mapped)
    ?? periods[0]
  );
}

function busiestTheme(period: LandscapePeriod | undefined) {
  return [...(period?.themes ?? [])].sort(
    (a, b) => b.story_count - a.story_count || a.label.localeCompare(b.label),
  )[0];
}

function changeText(theme: LandscapeTheme, period: LandscapePeriod) {
  if (!period.has_comparison) {
    return "Not enough earlier coverage to compare yet";
  }
  if (theme.change === 0) {
    return `Same as ${period.comparison}`;
  }
  const arrow = theme.change > 0 ? "↑" : "↓";
  return `${arrow} ${Math.abs(theme.change)} vs ${period.comparison}`;
}

function Bubbles({
  period,
  canvas,
  selectedId,
  busiestId,
  onSelect,
}: {
  period: LandscapePeriod;
  canvas: Canvas;
  selectedId: string | undefined;
  busiestId: string | undefined;
  onSelect: (id: string) => void;
}) {
  const layout = useMemo(
    () => layoutBubbles(period.themes, canvas) as Map<string, BubbleNode>,
    [period, canvas],
  );
  const middle = canvas.height / 2;
  const axisY = canvas.height - 16;
  // Gradient ids must be unique: the wide and narrow drawings share a page.
  const gradientId = useId().replace(/:/g, "");

  function handleKey(event: KeyboardEvent<SVGGElement>, id: string) {
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      onSelect(id);
    }
  }

  return (
    <svg
      viewBox={`0 0 ${canvas.width} ${canvas.height}`}
      className="h-auto w-full overflow-visible"
      role="group"
      aria-label={`Theme bubbles for ${period.label.toLocaleLowerCase()}`}
    >
      <defs>
        <linearGradient id={`${gradientId}-gain`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" className="landscape-zone-gain" stopOpacity={0.09} />
          <stop offset="100%" className="landscape-zone-gain" stopOpacity={0} />
        </linearGradient>
        <linearGradient id={`${gradientId}-fade`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" className="landscape-zone-fade" stopOpacity={0} />
          <stop offset="100%" className="landscape-zone-fade" stopOpacity={0.09} />
        </linearGradient>
        <marker
          id={`${gradientId}-arrow`}
          viewBox="0 0 10 10"
          refX="9"
          refY="5"
          markerWidth="7"
          markerHeight="7"
          orient="auto"
        >
          <path d="M 0 0 L 10 5 L 0 10 z" className="landscape-axis-arrow" />
        </marker>
      </defs>

      {period.has_comparison && (
        <>
          {/* Faint teal above the steady line, faint burgundy below it. */}
          <rect x={0} y={0} width={canvas.width} height={middle} fill={`url(#${gradientId}-gain)`} rx={8} />
          <rect x={0} y={middle} width={canvas.width} height={axisY - middle} fill={`url(#${gradientId}-fade)`} />
        </>
      )}

      <line
        x1={0}
        // Stop short of the "STEADY" tag so the line never crosses its text.
        x2={period.has_comparison ? canvas.width - tagWidth("STEADY", canvas.font) - 12 : canvas.width}
        y1={middle}
        y2={middle}
        className={period.has_comparison ? "landscape-steady" : "landscape-guide"}
        strokeDasharray="6 6"
      />

      {period.has_comparison ? (
        <>
          <ChartTag x={6} y={8} text="↑ GAINING" tone="primary" font={canvas.font} />
          <ChartTag x={6} y={axisY - canvas.font - 46} text="↓ FADING" tone="accent" font={canvas.font} />
          <ChartTag
            x={canvas.width - 6}
            y={middle - (canvas.font + 11) / 2}
            text="STEADY"
            tone="accent"
            font={canvas.font}
            anchor="end"
          />
        </>
      ) : (
        <ChartTag
          x={6}
          y={8}
          text="MOMENTUM NEEDS EARLIER DATA"
          tone="primary"
          font={canvas.font}
        />
      )}

      {/* Bottom axis: fewer stories on the left, more on the right. */}
      <line
        x1={6}
        x2={canvas.width - 8}
        y1={axisY - 18}
        y2={axisY - 18}
        className="landscape-axis-line"
        markerEnd={`url(#${gradientId}-arrow)`}
      />
      <text x={6} y={axisY} className="landscape-axis" fontSize={canvas.font - 2}>
        FEWER STORIES
      </text>
      <text
        x={canvas.width - 6}
        y={axisY}
        textAnchor="end"
        className="landscape-axis"
        fontSize={canvas.font - 2}
      >
        MORE STORIES
      </text>

      {period.themes.map((theme) => {
        const node = layout.get(theme.id);
        if (!node) return null;
        const selected = theme.id === selectedId;

        return (
          <g
            key={theme.id}
            role="button"
            tabIndex={0}
            aria-pressed={selected}
            aria-label={`${theme.label}: ${theme.story_count} ${theme.story_count === 1 ? "story" : "stories"}, ${theme.status.toLocaleLowerCase()}`}
            className={`landscape-bubble ${theme.limited ? "landscape-bubble-limited" : ""} ${theme.id === busiestId ? "landscape-bubble-busiest" : ""}`}
            style={{ transform: `translate(${node.x}px, ${node.y}px)` }}
            onClick={() => onSelect(theme.id)}
            onMouseEnter={() => onSelect(theme.id)}
            onFocus={() => onSelect(theme.id)}
            onKeyDown={(event) => handleKey(event, theme.id)}
          >
            {/* A unit circle scaled to size, so size changes animate smoothly. */}
            <circle
              r={1}
              className="landscape-circle"
              style={{
                transform: `scale(${node.radius})`,
                fill: `hsl(var(--theme-${theme.id}) / ${selected ? 0.34 : theme.limited ? 0.1 : 0.2})`,
                stroke: `hsl(var(--theme-${theme.id}))`,
                strokeWidth: selected ? 2.5 : 1.25,
              }}
              vectorEffect="non-scaling-stroke"
            />
            {node.inside ? (
              <text textAnchor="middle" className="landscape-label" fontSize={canvas.font}>
                <tspan x={0} dy={-2}>{theme.short_label}</tspan>
                <tspan x={0} dy={canvas.font + 3} className="landscape-count" fontSize={canvas.font - 2}>
                  {theme.story_count} {theme.story_count === 1 ? "story" : "stories"}
                </tspan>
              </text>
            ) : (
              <text
                x={0}
                y={node.radius + canvas.font + 2}
                textAnchor="middle"
                className="landscape-label landscape-label-below"
                fontSize={canvas.font}
              >
                {theme.short_label}
              </text>
            )}
          </g>
        );
      })}
    </svg>
  );
}

export function ThemeLandscape({ analysis }: { analysis: ThemeLandscapeAnalysis }) {
  const [periodId, setPeriodId] = useState(() => defaultPeriod(analysis.periods)?.id);
  const period =
    analysis.periods.find((candidate) => candidate.id === periodId)
    ?? defaultPeriod(analysis.periods);
  const busiest = busiestTheme(period);
  const [selectedId, setSelectedId] = useState<string | undefined>(busiest?.id);
  const selected =
    period?.themes.find((theme) => theme.id === selectedId) ?? busiest;

  if (!period) {
    return null;
  }

  return (
    <section
      id="theme-landscape"
      className="mt-12 scroll-mt-24 overflow-hidden rounded-lg border border-border bg-card px-6 py-7 shadow-panel sm:mt-14 sm:px-10 sm:py-9"
      aria-labelledby="theme-landscape-heading"
    >
      <div className="flex flex-col justify-between gap-5 lg:flex-row lg:items-end">
        <div>
          <p className="editorial-kicker editorial-accent">Theme landscape</p>
          <h2
            id="theme-landscape-heading"
            className="mt-2 font-editorial text-3xl font-medium leading-tight tracking-tight sm:text-[2rem]"
          >
            Where GCC HealthTech coverage is moving
          </h2>
          <p className="mt-3 max-w-2xl text-sm leading-6 text-muted-foreground">
            Bigger bubbles have more stories. Higher bubbles are gaining compared
            with the period before. Based on stories in this briefing.
          </p>
        </div>
        <div
          className="flex w-fit rounded-md border border-border bg-muted/40 p-1"
          role="group"
          aria-label="Time period"
        >
          {analysis.periods.map((option) => (
            <button
              key={option.id}
              type="button"
              aria-pressed={option.id === period.id}
              onClick={() => {
                setPeriodId(option.id);
                setSelectedId(busiestTheme(option)?.id);
              }}
              className={`min-h-9 rounded px-3 text-xs font-medium transition-colors sm:text-sm ${
                option.id === period.id
                  ? "bg-card text-foreground shadow-sm"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              {option.label}
            </button>
          ))}
        </div>
      </div>

      {period.mapped ? (
        <div className="mt-7 grid gap-6 lg:grid-cols-[minmax(0,1fr)_18rem] lg:items-start">
          <div className="dark-surface-depth rounded-lg border border-border/80 bg-muted/25 p-3 sm:p-5">
            <div className="hidden sm:block">
              <Bubbles
                period={period}
                canvas={CANVASES.wide}
                selectedId={selected?.id}
                busiestId={busiest?.id}
                onSelect={setSelectedId}
              />
            </div>
            <div className="sm:hidden">
              <Bubbles
                period={period}
                canvas={CANVASES.narrow}
                selectedId={selected?.id}
                busiestId={busiest?.id}
                onSelect={setSelectedId}
              />
            </div>
          </div>

          {selected && (
            <aside
              className="rounded-lg border border-border bg-background/40 p-5"
              aria-live="polite"
              aria-atomic="true"
            >
              <div className="flex items-center gap-2">
                <span
                  aria-hidden="true"
                  className="h-3 w-3 rounded-full"
                  style={{ backgroundColor: `hsl(var(--theme-${selected.id}))` }}
                />
                <span className="rounded-full border border-border px-2 py-0.5 text-[0.6875rem] font-semibold uppercase tracking-[0.1em] text-muted-foreground">
                  {selected.status}
                </span>
              </div>
              <h3 className="mt-3 font-editorial text-2xl font-medium leading-snug">
                {selected.label}
              </h3>
              <p className="mt-2 text-sm tabular-nums">
                <strong className="font-semibold">{selected.story_count}</strong>{" "}
                {selected.story_count === 1 ? "story" : "stories"} ·{" "}
                <strong className="font-semibold">{selected.publisher_count}</strong>{" "}
                {selected.publisher_count === 1 ? "publisher" : "publishers"}
              </p>
              <p className="mt-1 text-sm text-muted-foreground">
                {changeText(selected, period)}
              </p>
              {selected.limited && (
                <p className="mt-3 text-xs leading-5 text-muted-foreground">
                  Limited data: fewer than two stories in this period.
                </p>
              )}
              {selected.headlines.length > 0 && (
                <ul className="mt-4 space-y-3 border-t border-border pt-4">
                  {selected.headlines.map((headline) => (
                    <li key={headline.id}>
                      {headline.slug ? (
                        <Link
                          href={`/news/${headline.slug}`}
                          className="font-editorial text-base leading-snug underline-offset-4 hover:text-primary hover:underline"
                        >
                          {headline.title}
                        </Link>
                      ) : (
                        <span className="font-editorial text-base leading-snug">
                          {headline.title}
                        </span>
                      )}
                      {headline.source_name && (
                        <p className="mt-1 text-xs text-muted-foreground">
                          {headline.source_name}
                        </p>
                      )}
                    </li>
                  ))}
                </ul>
              )}
              <p className="mt-4 text-xs text-muted-foreground">
                Hover, tap, or tab to a bubble to explore it.
              </p>
            </aside>
          )}
        </div>
      ) : (
        <div className="mt-7 border-y border-border py-8">
          <h3 className="font-editorial text-2xl font-medium">
            Not enough coverage to map this period yet
          </h3>
          <p className="reading-copy mt-2 max-w-2xl">
            The map appears when at least three themes have stories. Try a
            longer period, or check back as more stories arrive.
          </p>
        </div>
      )}
    </section>
  );
}
