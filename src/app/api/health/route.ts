import { NextResponse } from "next/server";
import { getDb, resolveDbConfig } from "@/lib/db";
import { isProviderConfigured, resolveProvider } from "@/lib/morph/provider";
import { PROMPT_VERSION } from "@/lib/morph/prompt";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const db = getDb();
    const row = (await db.prepare<[], { users: number }>("SELECT COUNT(*) AS users FROM users").get())!;
    const provider = resolveProvider();
    return NextResponse.json({
      status: "ok",
      // "file" locally, "remote" on Turso — never the URL or token.
      database: resolveDbConfig().kind === "remote" ? "libsql-remote" : "libsql-file",
      users: row.users,
      engine: isProviderConfigured() ? provider!.model : "local-planner",
      provider: provider?.id ?? "none",
      promptVersion: PROMPT_VERSION,
      time: new Date().toISOString(),
    });
  } catch (error) {
    return NextResponse.json(
      {
        status: "error",
        message: error instanceof Error ? error.message : "unknown",
      },
      { status: 500 },
    );
  }
}
