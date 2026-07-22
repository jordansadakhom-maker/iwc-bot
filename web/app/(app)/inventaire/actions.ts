"use server";

import { envoyerCommande, type CommandeResult } from "@/lib/commandes";
import { supprimerFiable } from "@/lib/suppression";

export async function creerArme(data: { serie: string; type?: string; categorie?: string; appartenance?: string; membreNom?: string; notes?: string }): Promise<CommandeResult> {
  if (!data.serie || data.serie.trim().length < 1) return { ok: false, error: "Indique un n° de série." };
  return envoyerCommande("arme.create", { ...data });
}
export async function majArme(id: string, patch: { serie?: string; type?: string; categorie?: string; appartenance?: string; membreNom?: string; notes?: string }): Promise<CommandeResult> {
  if (!id) return { ok: false, error: "Arme introuvable." };
  return envoyerCommande("arme.update", { id, ...patch });
}
export async function supprimerArme(id: string): Promise<CommandeResult> {
  return supprimerFiable({ type: "arme.delete", payload: { id }, table: "Arme", colonne: "id", valeur: id, okMsg: "Arme supprimée." });
}

// ── Stock du coffre commun (inventaire, séparé du registre d'armes) ──
const CATS = ["Armes", "Munitions", "Provisions", "Médecine", "Matériel", "Commun"];

export async function ajusterStock(categorie: string, nom: string, mode: string, quantite: number): Promise<CommandeResult> {
  const n = (nom || "").trim();
  if (!n) return { ok: false, error: "Nom d'objet manquant." };
  const cat = CATS.includes(categorie) ? categorie : "Commun";
  const m = ["add", "remove", "set"].includes(mode) ? mode : "add";
  const q = Math.abs(Math.round(Number(quantite) || 0));
  return envoyerCommande("inventaire.ajuster", { categorie: cat, nom: n.slice(0, 120), mode: m, quantite: q });
}

export async function lirePhotosInventaire(urls: string[]): Promise<CommandeResult> {
  const list = (Array.isArray(urls) ? urls : []).filter((u) => /^https?:\/\//.test(u)).slice(0, 3);
  if (!list.length) return { ok: false, error: "Aucune photo." };
  return envoyerCommande("inventaire.photo", { urls: list });
}
