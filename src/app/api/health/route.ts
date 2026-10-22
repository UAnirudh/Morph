import { NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { isProviderConfigured, providerModel } from "@/lib/morph/provider";
import { PROMPT_VERSION } from "@/lib/morph/prompt";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const db = getDb();
    const row = db.prepare("SELECT COUNT(*) AS users FROM users").get() as { users: number };
    return NextResponse.json({
      status: "ok",
      database: "sqlite",
      users: row.users,
      engine: isProviderConfigured() ? providerModel() : "local-planner",
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
