import { connection, NextRequest } from "next/server";
import { getSessionUser } from "@/lib/auth";
import { readLocalUpload } from "@/lib/storage";

// Serves files stored on local disk (only used when Supabase Storage is not configured).
export async function GET(_req: NextRequest, ctx: { params: Promise<{ path: string[] }> }) {
  await connection();
  if (!(await getSessionUser())) return new Response("Unauthorized", { status: 401 });
  const { path } = await ctx.params;
  const file = await readLocalUpload(path.join("/"));
  if (!file) return new Response("Not found", { status: 404 });
  return new Response(new Uint8Array(file.data), {
    headers: { "Content-Type": file.type, "Cache-Control": "private, max-age=86400" },
  });
}
