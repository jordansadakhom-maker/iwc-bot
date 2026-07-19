"use client";

import { useState, useRef, useCallback } from "react";
import { ImagePlus, Loader2, X } from "lucide-react";
import { uploadPhoto } from "@/app/(app)/actions-upload";

// Zone de dépôt réutilisable : glisser / choisir une image → envoi vers Supabase
// Storage → renvoie l'URL publique via onUploaded. Sûr, best-effort.

export function PhotoDrop({
  dossier,
  onUploaded,
  label = "Glisse une photo ici ou clique pour choisir",
  compact = false,
}: {
  dossier: string;
  onUploaded: (url: string) => void;
  label?: string;
  compact?: boolean;
}) {
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [drag, setDrag] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const envoyer = useCallback(async (file: File) => {
    setErr(null); setBusy(true);
    const fd = new FormData();
    fd.set("file", file);
    fd.set("dossier", dossier);
    const r = await uploadPhoto(fd);
    setBusy(false);
    if (!r.ok || !r.url) { setErr(r.error || "Envoi impossible."); return; }
    onUploaded(r.url);
  }, [dossier, onUploaded]);

  const onDrop = (e: React.DragEvent) => {
    e.preventDefault(); setDrag(false);
    const f = e.dataTransfer.files?.[0];
    if (f) envoyer(f);
  };

  return (
    <div className="flex flex-col gap-1.5">
      <button
        type="button"
        onClick={() => inputRef.current?.click()}
        onDragOver={(e) => { e.preventDefault(); setDrag(true); }}
        onDragLeave={() => setDrag(false)}
        onDrop={onDrop}
        disabled={busy}
        className={`flex ${compact ? "min-h-[64px]" : "min-h-[100px]"} w-full flex-col items-center justify-center gap-1.5 rounded-[12px] border-2 border-dashed px-4 py-3 text-center text-[0.8rem] transition disabled:opacity-70`}
        style={{
          borderColor: drag ? "var(--accent)" : "var(--border)",
          background: drag ? "color-mix(in srgb,var(--accent) 8%,transparent)" : "var(--surface-2)",
          color: "var(--muted)",
        }}
      >
        {busy ? <Loader2 className="h-5 w-5 animate-spin" style={{ color: "var(--accent)" }} /> : <ImagePlus className="h-5 w-5" style={{ color: "var(--faint)" }} />}
        <span>{busy ? "Envoi en cours…" : label}</span>
      </button>
      <input ref={inputRef} type="file" accept="image/png,image/jpeg,image/webp,image/gif" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; if (f) envoyer(f); e.target.value = ""; }} />
      {err ? <p className="flex items-center gap-1 text-[0.76rem]" style={{ color: "var(--oxblood)" }}><X className="h-3 w-3" /> {err}</p> : null}
    </div>
  );
}
