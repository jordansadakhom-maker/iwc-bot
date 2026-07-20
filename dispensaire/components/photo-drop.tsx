"use client";

import { useRef, useState } from "react";
import { Camera, Loader2 } from "lucide-react";

// Réduit l'image (max ~1500px, JPEG) puis renvoie sa base64 sans le préfixe data:.
function reduire(file: File, maxDim = 1500, quality = 0.72): Promise<{ base64: string; mediaType: string }> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    const url = URL.createObjectURL(file);
    img.onload = () => {
      URL.revokeObjectURL(url);
      let { width, height } = img;
      if (Math.max(width, height) > maxDim) { const r = maxDim / Math.max(width, height); width = Math.round(width * r); height = Math.round(height * r); }
      const cv = document.createElement("canvas"); cv.width = width; cv.height = height;
      const ctx = cv.getContext("2d"); if (!ctx) return reject(new Error("canvas"));
      ctx.drawImage(img, 0, 0, width, height);
      const dataUrl = cv.toDataURL("image/jpeg", quality);
      resolve({ base64: dataUrl.split(",")[1] || "", mediaType: "image/jpeg" });
    };
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error("image")); };
    img.src = url;
  });
}

export function PhotoDrop({ onImage, busy, hint }: { onImage: (base64: string, mediaType: string) => void; busy?: boolean; hint?: string }) {
  const ref = useRef<HTMLInputElement>(null);
  const [over, setOver] = useState(false);

  async function handle(files: FileList | null) {
    const file = files?.[0]; if (!file || !file.type.startsWith("image/")) return;
    const { base64, mediaType } = await reduire(file);
    if (base64) onImage(base64, mediaType);
  }

  return (
    <div
      className={`dropzone ${over ? "over" : ""}`}
      onClick={() => !busy && ref.current?.click()}
      onDragOver={(e) => { e.preventDefault(); setOver(true); }}
      onDragLeave={() => setOver(false)}
      onDrop={(e) => { e.preventDefault(); setOver(false); if (!busy) handle(e.dataTransfer.files); }}
    >
      <input ref={ref} type="file" accept="image/*" className="hidden" onChange={(e) => handle(e.target.files)} />
      <div className="flex items-center justify-center gap-2 text-[0.9rem] font-semibold">
        {busy ? <Loader2 className="h-5 w-5 animate-spin" /> : <Camera className="h-5 w-5" />}
        {busy ? "Lecture de la photo…" : "Glisser une photo du coffre / panneau"}
      </div>
      <div className="mt-1 text-[0.76rem]">{hint || "ou cliquer pour choisir — l'IA lit les quantités et met à jour le stock"}</div>
    </div>
  );
}
