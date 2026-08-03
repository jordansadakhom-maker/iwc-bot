"use client";

import { useState } from "react";
import { Paperclip, ImageOff, Trash2, X, Maximize2 } from "lucide-react";
import { inputCls } from "@/components/edit-ui";
import { validerPieceJointe } from "@/lib/piece-jointe";

// Brique « pièce jointe » réutilisable — une référence visuelle par lien.
// Pensée pour évoluer : un bouton d'upload, les PDF ou plusieurs pièces
// viendront se greffer ici sans toucher aux fiches qui l'utilisent.

// Visionneuse plein écran (clic sur la miniature → image en taille réelle).
function Lightbox({ url, onClose }: { url: string; onClose: () => void }) {
  const [casse, setCasse] = useState(false);
  return (
    <div className="fixed inset-0 z-[60] grid place-items-center bg-black/80 p-4" onClick={onClose} role="dialog" aria-modal="true" aria-label="Aperçu de la pièce jointe">
      <button onClick={onClose} className="absolute right-4 top-4 grid h-9 w-9 place-items-center rounded-lg border border-white/25 text-white/90 hover:bg-white/10" aria-label="Fermer l'aperçu"><X className="h-5 w-5" /></button>
      {casse ? (
        <div className="flex flex-col items-center gap-2 text-white/80" onClick={(e) => e.stopPropagation()}>
          <ImageOff className="h-8 w-8" /><span className="text-[0.85rem]">L&apos;image n&apos;est plus disponible.</span>
          <a href={url} target="_blank" rel="noopener noreferrer" className="text-[0.78rem] underline">Ouvrir le lien</a>
        </div>
      ) : (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={url} alt="Pièce jointe" onClick={(e) => e.stopPropagation()} onError={() => setCasse(true)} className="max-h-[90vh] max-w-[92vw] rounded-[10px] object-contain shadow-card" />
      )}
    </div>
  );
}

// Miniature cliquable (consultation). Repli discret si le lien est cassé/absent.
export function PieceJointeVignette({ url, taille = "h-16 w-16" }: { url: string | null; taille?: string }) {
  const [casse, setCasse] = useState(false);
  const [zoom, setZoom] = useState(false);
  if (!url) return null;
  if (casse) {
    return (
      <span className="inline-flex items-center gap-1.5 text-[0.7rem] italic text-faint" title={url}>
        <ImageOff className="h-3.5 w-3.5" /> Image plus disponible
      </span>
    );
  }
  return (
    <>
      <button type="button" onClick={() => setZoom(true)} className={`group relative overflow-hidden rounded-[9px] border border-border ${taille}`} aria-label="Agrandir la pièce jointe" title="Agrandir">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={url} alt="Pièce jointe" onError={() => setCasse(true)} className="h-full w-full object-cover" />
        <span className="absolute inset-0 grid place-items-center bg-black/0 text-white/0 transition group-hover:bg-black/35 group-hover:text-white/90"><Maximize2 className="h-4 w-4" /></span>
      </button>
      {zoom ? <Lightbox url={url} onClose={() => setZoom(false)} /> : null}
    </>
  );
}

// Champ éditable : coller un lien → aperçu immédiat + retrait. Vide = pas de pièce.
export function ChampPieceJointe({ value, onChange, label = "📎 Pièce jointe (facultative)" }: { value: string; onChange: (url: string) => void; label?: string }) {
  const [casse, setCasse] = useState(false);
  const [zoom, setZoom] = useState(false);
  const t = (value || "").trim();
  const v = validerPieceJointe(t);
  const valide = v.ok && !!v.url;
  return (
    <label className="flex flex-col gap-1.5">
      <span className="text-[0.72rem] uppercase tracking-[0.05em] text-faint">{label}</span>
      <div className="flex items-center gap-2">
        <input
          className={inputCls}
          value={value}
          onChange={(e) => { setCasse(false); onChange(e.target.value); }}
          placeholder="https://… (image .png/.jpg/.webp/.gif ou lien Discord)"
          inputMode="url"
        />
        {t ? <button type="button" onClick={() => onChange("")} className="grid h-8 w-8 shrink-0 place-items-center rounded-lg border border-border text-faint hover:text-oxblood" aria-label="Retirer la pièce jointe" title="Retirer"><Trash2 className="h-3.5 w-3.5" /></button> : null}
      </div>

      {t && !v.ok ? (
        <span className="text-[0.72rem]" style={{ color: "var(--oxblood)" }}>{v.error}</span>
      ) : valide ? (
        casse ? (
          <span className="inline-flex items-center gap-1.5 text-[0.72rem] italic text-faint"><ImageOff className="h-3.5 w-3.5" /> L&apos;aperçu n&apos;a pas pu se charger — le lien sera tout de même conservé.</span>
        ) : (
          <button type="button" onClick={() => setZoom(true)} className="group relative mt-0.5 w-fit overflow-hidden rounded-[10px] border border-border" aria-label="Agrandir l'aperçu" title="Agrandir">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={v.url} alt="Aperçu de la pièce jointe" onError={() => setCasse(true)} className="max-h-32 object-contain" />
            <span className="absolute inset-0 grid place-items-center bg-black/0 text-white/0 transition group-hover:bg-black/35 group-hover:text-white/90"><Maximize2 className="h-4 w-4" /></span>
          </button>
        )
      ) : (
        <span className="inline-flex items-center gap-1.5 text-[0.68rem] text-faint"><Paperclip className="h-3 w-3" /> Colle le lien d&apos;une image (blessure, radio, document RP…). Aucune identité ni donnée RP n&apos;est stockée.</span>
      )}
      {zoom && valide ? <Lightbox url={v.url} onClose={() => setZoom(false)} /> : null}
    </label>
  );
}
