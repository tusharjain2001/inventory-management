"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { ImagePlus, Star, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { useConfirm } from "@/components/common/confirm";
import { useSession } from "@/components/session-provider";
import { api, errorMessage } from "@/lib/api-client";
import { compressImage } from "@/lib/image";
import { cn } from "@/lib/utils";
import type { ProductDetail } from "./types";

const ACCEPT = "image/jpeg,image/png,image/webp";
const HINT = "JPG, PNG or WEBP. Large photos are resized automatically. The first photo is the main one.";

/** Uploads photos to a saved product (multipart field "files"). */
export async function uploadProductPhotos(productId: number, files: File[]) {
  const form = new FormData();
  for (const f of files) form.append("files", await compressImage(f));
  const res = await fetch(`/api/products/${productId}/images`, { method: "POST", body: form });
  if (!res.ok) throw new Error((await res.json().catch(() => null))?.error ?? "Upload failed");
}

/** Photos of a saved product: upload, make primary, remove. */
export function ProductPhotos({ product }: { product: ProductDetail }) {
  const qc = useQueryClient();
  const confirm = useConfirm();
  const { can } = useSession();
  const input = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const editable = can("products.edit");
  const refresh = () => {
    qc.invalidateQueries({ queryKey: ["product", product.id] });
    qc.invalidateQueries({ queryKey: ["products"] });
  };

  async function upload(files: FileList | null) {
    if (!files?.length) return;
    setUploading(true);
    try {
      await uploadProductPhotos(product.id, Array.from(files));
      toast.success("Photos uploaded");
      refresh();
    } catch (err) {
      toast.error(errorMessage(err));
    } finally {
      setUploading(false);
      if (input.current) input.current.value = "";
    }
  }

  async function makePrimary(imageId: number) {
    try {
      await api.patch(`/api/product-images/${imageId}`, { isPrimary: true });
      refresh();
    } catch (err) {
      toast.error(errorMessage(err));
    }
  }

  async function remove(imageId: number) {
    if (!(await confirm({ title: "Remove this photo?", confirmText: "Remove", destructive: true }))) return;
    try {
      await api.delete(`/api/product-images/${imageId}`);
      refresh();
    } catch (err) {
      toast.error(errorMessage(err));
    }
  }

  return (
    <div className="space-y-3">
      {product.images.length === 0 ? (
        <div className="rounded-lg border border-dashed p-6 text-center text-sm text-muted-foreground">No photos yet</div>
      ) : (
        <div className="grid grid-cols-3 gap-3 sm:grid-cols-4 lg:grid-cols-6">
          {product.images.map((img) => (
            <div key={img.id} className={cn("group relative overflow-hidden rounded-lg border", img.isPrimary && "ring-2 ring-primary")}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={img.url} alt="" className="aspect-square w-full object-cover" />
              {img.isPrimary && (
                <span className="absolute top-1.5 left-1.5 rounded bg-primary px-1.5 py-0.5 text-[10px] text-primary-foreground">Main</span>
              )}
              {editable && (
                <div className="absolute inset-x-0 bottom-0 flex justify-end gap-1 bg-gradient-to-t from-black/60 p-1.5 opacity-100 transition-opacity sm:opacity-0 sm:group-hover:opacity-100">
                  {!img.isPrimary && (
                    <Button type="button" size="icon-sm" variant="secondary" onClick={() => makePrimary(img.id)} title="Make main photo">
                      <Star />
                    </Button>
                  )}
                  <Button type="button" size="icon-sm" variant="secondary" onClick={() => remove(img.id)} title="Remove">
                    <Trash2 />
                  </Button>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
      {editable && (
        <div>
          <input ref={input} type="file" accept={ACCEPT} multiple hidden onChange={(e) => upload(e.target.files)} />
          <Button type="button" variant="outline" onClick={() => input.current?.click()} disabled={uploading}>
            <ImagePlus /> {uploading ? "Uploading…" : "Add Photos"}
          </Button>
          <p className="mt-1 text-xs text-muted-foreground">{HINT}</p>
        </div>
      )}
    </div>
  );
}

/** Photos chosen while adding a product; they are uploaded once the product is saved. */
export function PendingPhotos({ files, onChange }: { files: File[]; onChange: (files: File[]) => void }) {
  const input = useRef<HTMLInputElement>(null);
  const urls = useMemo(() => files.map((f) => URL.createObjectURL(f)), [files]);
  useEffect(() => () => urls.forEach((u) => URL.revokeObjectURL(u)), [urls]);

  return (
    <div className="space-y-3">
      {files.length > 0 && (
        <div className="grid grid-cols-3 gap-3 sm:grid-cols-4 lg:grid-cols-6">
          {urls.map((url, i) => (
            <div key={url} className={cn("relative overflow-hidden rounded-lg border", i === 0 && "ring-2 ring-primary")}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={url} alt="" className="aspect-square w-full object-cover" />
              {i === 0 && <span className="absolute top-1.5 left-1.5 rounded bg-primary px-1.5 py-0.5 text-[10px] text-primary-foreground">Main</span>}
              <Button
                type="button"
                size="icon-sm"
                variant="secondary"
                className="absolute right-1.5 bottom-1.5"
                onClick={() => onChange(files.filter((_, j) => j !== i))}
                title="Remove"
              >
                <Trash2 />
              </Button>
            </div>
          ))}
        </div>
      )}
      <div>
        <input
          ref={input}
          type="file"
          accept={ACCEPT}
          multiple
          hidden
          onChange={(e) => {
            if (e.target.files?.length) onChange([...files, ...Array.from(e.target.files)]);
            e.target.value = "";
          }}
        />
        <Button type="button" variant="outline" onClick={() => input.current?.click()}>
          <ImagePlus /> Add Photos
        </Button>
        <p className="mt-1 text-xs text-muted-foreground">{HINT}</p>
      </div>
    </div>
  );
}
