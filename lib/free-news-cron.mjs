import { createCollectorClient } from "./collector-utils.mjs";
import { collectFreeNews } from "./free-news-collector.mjs";

function json(body, status) {
  return Response.json(body, {
    status,
    headers: { "Cache-Control": "no-store" },
  });
}

export async function runFreeNewsCron(request, {
  env = process.env,
  collect = collectFreeNews,
  createClient = createCollectorClient,
  logger = console,
} = {}) {
  const secret = env.CRON_SECRET;
  if (!secret || request.headers.get("authorization") !== `Bearer ${secret}`) {
    return json({ success: false, error: "Unauthorized" }, 401);
  }

  try {
    const result = await collect({ supabase: createClient(env) });
    const incomplete = result.failed > 0
      || result.searches.failed > 0
      || result.searches.skipped > 0;

    logger.info("FreeNewsAPI cron completed.", {
      saved: result.saved,
      duplicates: result.duplicates,
      failed: result.failed,
      searches: result.searches,
    });

    return json({ success: !incomplete, result }, incomplete ? 500 : 200);
  } catch (error) {
    logger.error("FreeNewsAPI cron failed.", error);
    return json({
      success: false,
      error: "Collection failed. Check the Vercel function logs.",
    }, 500);
  }
}
