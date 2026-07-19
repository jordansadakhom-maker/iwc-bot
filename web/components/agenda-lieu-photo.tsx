"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { ImagePlus, MapPin } from "lucide-react";
import { Modal, Flash } from "@/components/edit-ui";
import { PhotoDrop } from "@/components/photo-drop";
import { definirLieuPhotoRdv } from "@/app/(app)/communication/actions";

// Photo du lieu d'un RDV, gérée depuis l'agenda : glisser une photo → l'endroit
// du rendez-vous s'affiche. Écrit dans le RDV (Supabase, champ paiement.lieuPhoto).
export function AgendaLieuPhoto({ id, lieuPhoto, lieu }: { id: string; lieuPhoto: string | null; lieu: string | null }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [url, setUrl] = useState<string | null>(lieuPhoto);
  const [flash, setFlash] = useState<string | null>(null);

  async function maj(u: string) {
    setUrl(u);
    const r = await definirLieuPhotoRdv(id, u);
    setFlash(r.ok ? "Photo du lieu enregistrée." : (r.error || "Échec."));
    if (r.ok) router.refresh();
  }

  return (
    <>
      <button onClick={() => setOpen(true)} className="inline-flex items-center gap-1.5" title={url ? "Voir le lieu" : "Ajouter une photo du lieu"}>
        {url ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={url} alt="Lieu" className="h-8 w-8 rounded-[6px] border border-border object-cover transition hover:brightness-110" />
        ) : (
          <span className="inline-flex h-8 w-8 items-center justify-center rounded-[6px] border border-dashed border-border text-faint hover:text-ink"><ImagePlus className="h-4 w-4" /></span>
        )}
      </button>
      {open ? (
        <Modal titre={`Lieu du rendez-vous${lieu ? ` — ${lieu}` : ""}`} onClose={() => setOpen(false)} max={480}>
          {flash ? <div className="mb-3"><Flash>{flash}</Flash></div> : null}
          {url ? (
            <div className="flex flex-col gap-2">
              <a href={url} target="_blank" rel="noreferrer">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={url} alt="Lieu du rendez-vous" className="max-h-72 w-full rounded-[10px] border border-border object-cover" />
              </a>
              {lieu ? <p className="flex items-center gap-1.5 text-[0.82rem] text-muted"><MapPin className="h-3.5 w-3.5 text-faint" /> {lieu}</p> : null}
              <PhotoDrop dossier="rdv-lieux" onUploaded={maj} compact label="Remplacer la photo du lieu" />
            </div>
          ) : (
            <PhotoDrop dossier="rdv-lieux" onUploaded={maj} label="Glisse la photo du lieu — elle montrera l'endroit du RDV" />
          )}
          <div className="mt-4 flex justify-end border-t border-border pt-3">
            <button onClick={() => setOpen(false)} className="rounded-lg px-3 py-1.5 text-[0.8rem] font-semibold text-black/85" style={{ background: "var(--accent)" }}>Fermer</button>
          </div>
        </Modal>
      ) : null}
    </>
  );
}
