import { runFreeNewsCron } from "@/lib/free-news-cron.mjs";

export const maxDuration = 300;

export async function GET(request: Request) {
  return runFreeNewsCron(request);
}
