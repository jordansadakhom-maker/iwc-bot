"use client";

import { useState, useRef, useCallback } from "react";
import { ImagePlus, Loader2, X, Camera } from "lucide-react";
import { uploadPhoto } from "@/app/(app)/actions-upload";

// Zone de dépôt réutilisable : glisser / choisir une image OU la prendre en photo
// avec l'appareil (mobile) → envoi vers Supabase Storage → renvoie l'URL publique
// via onUploaded. Sûr, best-effort.

export function PhotoDrop({
  dossier,
  onUploaded,
  onManyUploaded,
  multiple = false,
  label = "Glisse une photo ici ou clique pour choisir",
  compact = false,
  camera = true,
}: {
  dossier: string;
  onUploaded: (url: string) => void;
  onManyUploaded?: (urls: string[]) => void; // appelé une fois avec toutes les URLs (mode multiple)
  multiple?: boolean;
  label?: string;
  compact?: boolean;
  camera?: boolean;
}) {
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [drag, setDrag] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const camRef = useRef<HTMLInputElement>(null);

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

  // Envoi de plusieurs fichiers d'un coup → une seule notification avec toutes les URLs.
  const envoyerPlusieurs = useCallback(async (files: File[]) => {
    if (!files.length) return;
    setErr(null); setBusy(true);
    const urls: string[] = [];
    for (const file of files) {
      const fd = new FormData(); fd.set("file", file); fd.set("dossier", dossier);
      const r = await uploadPhoto(fd);
      if (r.ok && r.url) urls.push(r.url);
    }
    setBusy(false);
    if (!urls.length) { setErr("Envoi impossible."); return; }
    if (onManyUploaded) onManyUploaded(urls); else urls.forEach((u) => onUploaded(u));
  }, [dossier, onManyUploaded, onUploaded]);

  const onDrop = (e: React.DragEvent) => {
    e.preventDefault(); setDrag(false);
    const fs = Array.from(e.dataTransfer.files || []);
    if (!fs.length) return;
    if (multiple) envoyerPlusieurs(fs); else envoyer(fs[0]);
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

      {camera ? (
        <button
          type="button"
          onClick={() => camRef.current?.click()}
          disabled={busy}
          className="inline-flex items-center justify-center gap-1.5 rounded-[10px] border px-3 py-2 text-[0.8rem] font-semibold transition disabled:opacity-60"
          style={{ borderColor: "color-mix(in srgb,var(--accent) 45%,var(--border))", color: "var(--accent)", background: "color-mix(in srgb,var(--accent) 8%,transparent)" }}
        >
          <Camera className="h-4 w-4" /> Prendre en photo
        </button>
      ) : null}

      {/* Choisir un fichier / galerie */}
      <input ref={inputRef} type="file" multiple={multiple} accept="image/png,image/jpeg,image/webp,image/gif,application/pdf" className="hidden" onChange={(e) => { const fs = Array.from(e.target.files || []); if (fs.length) { if (multiple) envoyerPlusieurs(fs); else envoyer(fs[0]); } e.target.value = ""; }} />
      {/* Appareil photo (mobile : ouvre directement la caméra arrière) */}
      <input ref={camRef} type="file" accept="image/*" capture="environment" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; if (f) envoyer(f); e.target.value = ""; }} />

      {err ? <p className="flex items-center gap-1 text-[0.76rem]" style={{ color: "var(--oxblood)" }}><X className="h-3 w-3" /> {err}</p> : null}
    </div>
  );
}
