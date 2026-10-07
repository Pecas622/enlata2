"use client";

import { useRef, useState, useTransition } from "react";
import { DeviceArt } from "@/components/DeviceArt";
import { removeDevicePhoto, uploadDevicePhoto } from "./actions";

// Las fotos del celular pesan varios MB: se achican en el navegador a 1200 px antes de subirlas.
async function shrink(file: File): Promise<Blob> {
  try {
    const img = await createImageBitmap(file);
    const scale = Math.min(1, 1200 / Math.max(img.width, img.height));
    if (scale === 1 && file.size < 900_000) return file;
    const canvas = document.createElement("canvas");
    canvas.width = Math.round(img.width * scale);
    canvas.height = Math.round(img.height * scale);
    canvas.getContext("2d")!.drawImage(img, 0, 0, canvas.width, canvas.height);
    const out = await new Promise<Blob | null>((ok) => canvas.toBlob(ok, "image/jpeg", 0.85));
    return out ?? file;
  } catch {
    return file;
  }
}

export function PhotoCell({ id, kind, color, photo }: { id: string; kind: string; color: string; photo: string | null }) {
  const [path, setPath] = useState(photo);
  const [error, setError] = useState("");
  const [pending, startTransition] = useTransition();
  const input = useRef<HTMLInputElement>(null);

  const upload = (file: File) => {
    setError("");
    startTransition(async () => {
      const blob = await shrink(file);
      const fd = new FormData();
      fd.set("device", id);
      fd.set("file", new File([blob], blob === file ? file.name : "foto.jpg", { type: blob.type || file.type }));
      const r = await uploadDevicePhoto(fd);
      if (r.error) setError(r.error);
      else setPath(r.path ?? null);
    });
  };
  const remove = () => {
    setError("");
    startTransition(async () => {
      const r = await removeDevicePhoto(id);
      if (r.error) setError(r.error);
      else setPath(null);
    });
  };

  return (
    <td>
      <div className="photo-cell">
        <button type="button" className="photo-thumb" onClick={() => input.current?.click()} disabled={pending} title={path ? "Cambiar foto" : "Subir foto"} data-testid={`photo-${id}`}>
          <DeviceArt kind={kind} color={color} photo={path} />
          {pending && <span className="photo-busy">…</span>}
        </button>
        {path && !pending && <button type="button" className="link-btn" onClick={remove} data-testid={`photo-remove-${id}`}>Quitar</button>}
        <input ref={input} type="file" accept="image/jpeg,image/png,image/webp" hidden data-testid={`photo-input-${id}`}
          onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ""; if (f) upload(f); }} />
      </div>
      {error && <div className="error" style={{ fontSize: 11.5 }} role="alert">{error}</div>}
    </td>
  );
}
