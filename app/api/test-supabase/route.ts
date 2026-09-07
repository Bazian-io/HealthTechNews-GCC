import { createClient } from "@/lib/supabase/server";
import { NextResponse } from "next/server";

/**
 * Minimal server-side connectivity check.
 *
 * No tables exist yet, so we query one that doesn't exist on purpose.
 * A structured "table not found" error back from Supabase means the
 * request reached the project and authenticated correctly:
 * - 42P01: raw Postgres "relation does not exist"
 * - PGRST205: PostgREST "table not found in schema cache"
 * Any other error (network failure, invalid API key, etc.) means the
 * connection itself is broken.
 */
export async function GET() {
  const supabase = await createClient();
  const { error } = await supabase.from("_connection_check").select("*").limit(1);

  const connected = !error || ["42P01", "PGRST205"].includes(error.code);

  return NextResponse.json({
    connected,
    detail: error ? { code: error.code, message: error.message } : "No error returned",
  });
}
