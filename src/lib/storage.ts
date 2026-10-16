import { mkdir, readFile, unlink, writeFile } from "node:fs/promises";
import path from "node:path";
import { randomBytes } from "node:crypto";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { AppError } from "@/lib/http";

// Files go to Supabase Storage when configured, otherwise to ./uploads on local disk
// (served by /api/files). The bucket should be public so image URLs work in <img>.

const LOCAL_ROOT = path.resolve(process.cwd(), "uploads");
const MAX_BYTES = 8 * 1024 * 1024;
const ALLOWED = new Set(["image/jpeg", "image/png", "image/webp", "application/pdf"]);
const EXT: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
  "application/pdf": "pdf",
};

let supabase: SupabaseClient | null = null;
function supabaseClient() {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return null;
  supabase ??= createClient(url, key, { auth: { persistSession: false } });
  return supabase;
}
const bucket = () => process.env.SUPABASE_BUCKET || "uploads";

export async function saveUpload(file: File, folder: string): Promise<{ url: string; path: string }> {
  if (!ALLOWED.has(file.type)) throw new AppError(400, "Only JPG, PNG, WEBP images or PDF files are allowed");
  if (file.size > MAX_BYTES) throw new AppError(400, "File is too large (max 8 MB)");
  const safeFolder = folder.replace(/[^a-z0-9/_-]/gi, "");
  const key = `${safeFolder}/${Date.now()}-${randomBytes(6).toString("hex")}.${EXT[file.type]}`;
  const bytes = Buffer.from(await file.arrayBuffer());

  const sb = supabaseClient();
  if (sb) {
    const { error } = await sb.storage.from(bucket()).upload(key, bytes, { contentType: file.type, upsert: false });
    if (error) throw new AppError(500, `Upload failed: ${error.message}`);
    const { data } = sb.storage.from(bucket()).getPublicUrl(key);
    return { url: data.publicUrl, path: key };
  }

  const target = path.join(LOCAL_ROOT, key);
  await mkdir(path.dirname(target), { recursive: true });
  await writeFile(target, bytes);
  return { url: `/api/files/${key}`, path: key };
}

export async function deleteUpload(storagePath: string | null | undefined) {
  if (!storagePath) return;
  const sb = supabaseClient();
  if (sb) {
    await sb.storage.from(bucket()).remove([storagePath]);
    return;
  }
  const target = path.join(LOCAL_ROOT, storagePath);
  if (!target.startsWith(LOCAL_ROOT)) return;
  await unlink(target).catch(() => {});
}

/** Reads a locally stored file (local-disk mode only). */
export async function readLocalUpload(storagePath: string) {
  const target = path.resolve(LOCAL_ROOT, storagePath);
  if (!target.startsWith(LOCAL_ROOT + path.sep)) return null;
  try {
    const data = await readFile(target);
    const ext = path.extname(target).slice(1).toLowerCase();
    const type =
      ext === "pdf" ? "application/pdf" : ext === "png" ? "image/png" : ext === "webp" ? "image/webp" : "image/jpeg";
    return { data, type };
  } catch {
    return null;
  }
}
