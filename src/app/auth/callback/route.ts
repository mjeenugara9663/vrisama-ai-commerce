import { NextRequest, NextResponse } from "next/server";
import { appOrigin } from "@/lib/appurl";
import { createClient } from "@/lib/supabase/server";
import { safeNextPath } from "@/lib/utils";

export async function GET(request: NextRequest) {
  const origin = appOrigin(request);
  const params = new URL(request.url).searchParams;
  const code = params.get("code");
  const next = safeNextPath(params.get("next"));
  if (code) {
    const client = await createClient();
    const { error } = await client.auth.exchangeCodeForSession(code);
    if (!error) return NextResponse.redirect(new URL(next, origin));
  }
  return NextResponse.redirect(new URL("/login?error=confirm", origin));
}
