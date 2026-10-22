import { NextResponse } from "next/server";
import { AuthError } from "@/lib/auth";

/** Converts AuthError to a JSON response; returns null for anything else so the caller can handle it. */
export function authErrorResponse(e: unknown) {
  if (!(e instanceof AuthError)) return null;
  return NextResponse.json({ error: e.status === 401 ? "Please sign in again." : "You do not have access to this workspace." }, { status: e.status });
}

/** Reads a request body as text, enforcing a real byte limit (works for chunked requests too). */
export async function readLimitedText(request: Request, maxBytes: number): Promise<string | null> {
  const declared = Number(request.headers.get("content-length") || 0);
  if (declared > maxBytes) return null;
  if (!request.body) return "";
  const reader = request.body.getReader();
  const chunks: Uint8Array[] = []; let size = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > maxBytes) { await reader.cancel(); return null; }
    chunks.push(value);
  }
  return new TextDecoder().decode(Buffer.concat(chunks));
}
