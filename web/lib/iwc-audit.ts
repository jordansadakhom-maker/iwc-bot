import "server-only";

import { createAdminClient } from "@/lib/supabase/admin";
import { getAcces } from "@/lib/queries";
import { ROLES_LICENCE } from "@/lib/licences-const";
import { scorer, trierAnomalies, type Anomalie, type RapportAudit, type ChecklistItem } from "@/lib/audit-core";

export * from "@/lib/audit-core";

const CATEGORIES = ["Intégrité", "Cohérence", "Dates", "Unicité", "Permissions"];
const STATUTS_LICENCE = new Set(["active", "suspendue", "revoquee", "expiree"]);

const CHECKLIST: ChecklistItem[] = [
  { id: "i-emp-1", groupe: "Scénario · Nouvel employé", libelle: "Connexion Discord → compte créé, grade attribué." },
  { id: "i-emp-2", groupe: "Scénario · Nouvel employé", libelle: "Première vente à l'Armurerie → stock débité, recette enregistrée." },
  { id: "i-dir-1", groupe: "Scénario · Directeur", libelle: "Recrute, attribue un grade et des autorisations → l'employé voit les bons onglets." },
  { id: "i-dir-2", groupe: "Scénario · Directeur", libelle: "Consulte les statistiques → chiffres cohérents avec les ventes." },
  { id: "i-cli-1", groupe: "Scénario · Client", libelle: "Vérification rapide de la licence → 🟢/🔴 correct avec le motif." },
  { id: "i-cli-2", groupe: "Scénario · Client", libelle: "Vente + encaissement + reçu → stock à jour, historique créé." },
  { id: "i-lic-1", groupe: "Licences", libelle: "Délivrer une licence → numéro auto généré, journal alimenté." },
  { id: "i-lic-2", groupe: "Licences", libelle: "Suspendre puis réactiver → statut correct ; révoquer → rouge + motif." },
  { id: "i-lic-3", groupe: "Licences", libelle: "Renouveler → nouvelle date, historique conservé." },
  { id: "i-arm-1", groupe: "Intégration Armurerie", libelle: "Contrôle activé → vente refusée si licence invalide, avec message précis." },
];

const rapportVide = (opts: Partial<RapportAudit> = {}): RapportAudit => ({
  genereLe: new Date().toISOString(), pret: false, canVoir: false, scoreGlobal: 100,
  totalControles: 0, categories: [], anomalies: [], checklist: CHECKLIST, ...opts,
});

const norm = (v: unknown) => String(v ?? "").trim().toLowerCase();

// Audit du site principal (IWC / Armurerie / Licences) — 100 % lecture seule.
export async function getAuditIwc(): Promise<RapportAudit> {
  let voir = false;
  try { voir = !!(await getAcces()).direction; } catch { voir = false; }
  if (!voir) return rapportVide({ canVoir: false });

  const admin = createAdminClient();
  if (!admin) return rapportVide({ canVoir: true, pret: false });

  const q = async (t: string, cols: string): Promise<Record<string, unknown>[]> => {
    try { const { data, error } = await admin.from(t).select(cols).limit(5000); return error ? [] : ((data as unknown as Record<string, unknown>[]) || []); }
    catch { return []; }
  };

  const [licences, types, membresL, operations, contrats] = await Promise.all([
    q("Licence", "id,numero,typeCode,statut,dateDelivrance,dateExpiration,suspensionMotif,revocationMotif,suspensionDebut,suspensionFin,nom"),
    q("LicenceType", "code"),
    q("LicenceMembre", "id,identifiant,nom,role"),
    q("Operation", "id,contratId"),
    q("Contrat", "id"),
  ]);

  const A: Anomalie[] = [];
  let controles = 0;
  const ctrl = () => { controles++; };
  const now = Date.now();

  const typeCodes = new Set(types.map((t) => String(t.code)));
  const contratIds = new Set(contrats.map((c) => String(c.id)));
  const roleKeys = new Set(ROLES_LICENCE.map((r) => r.key));

  // ── Intégrité ───────────────────────────────────────────────────────────
  ctrl();
  for (const l of licences) if (typeCodes.size && !typeCodes.has(String(l.typeCode)))
    A.push({ categorie: "Intégrité", gravite: "majeur", titre: "Licence d'un type inconnu", detail: `${l.numero} → type « ${l.typeCode} » absent du référentiel`, suggestion: "Recréer le type ou corriger la licence.", ref: String(l.id) });
  ctrl();
  for (const m of membresL) if (!roleKeys.has(String(m.role)))
    A.push({ categorie: "Intégrité", gravite: "majeur", titre: "Rôle de licence inconnu", detail: `${m.nom} → rôle « ${m.role} »`, suggestion: "Réattribuer un rôle valide.", ref: String(m.id) });
  ctrl();
  for (const o of operations) if (o.contratId && contratIds.size && !contratIds.has(String(o.contratId)))
    A.push({ categorie: "Intégrité", gravite: "mineur", titre: "Opération liée à un contrat inexistant", detail: `opération ${String(o.id).slice(0, 12)}`, suggestion: "Rattacher à un contrat valide ou détacher.", ref: String(o.id) });

  // ── Cohérence ───────────────────────────────────────────────────────────
  ctrl();
  for (const l of licences) {
    const st = String(l.statut);
    if (!STATUTS_LICENCE.has(st)) A.push({ categorie: "Cohérence", gravite: "majeur", titre: "Statut de licence invalide", detail: `${l.numero} → « ${st} »`, suggestion: "Ramener à active/suspendue/revoquee/expiree.", ref: String(l.id) });
    const exp = l.dateExpiration ? Date.parse(String(l.dateExpiration)) : NaN;
    if (st === "active" && Number.isFinite(exp) && exp < now)
      A.push({ categorie: "Cohérence", gravite: "majeur", titre: "Licence active mais expirée", detail: `${l.numero} — expiration dépassée`, suggestion: "Passer en « expirée » ou renouveler.", ref: String(l.id) });
    if (st === "suspendue" && !String(l.suspensionMotif ?? "").trim())
      A.push({ categorie: "Cohérence", gravite: "mineur", titre: "Suspension sans motif", detail: `${l.numero}`, suggestion: "Renseigner le motif de suspension.", ref: String(l.id) });
    if (st === "revoquee" && !String(l.revocationMotif ?? "").trim())
      A.push({ categorie: "Cohérence", gravite: "mineur", titre: "Révocation sans motif", detail: `${l.numero}`, suggestion: "Renseigner le motif de révocation.", ref: String(l.id) });
  }

  // ── Dates ───────────────────────────────────────────────────────────────
  ctrl();
  for (const l of licences) {
    const del = l.dateDelivrance ? Date.parse(String(l.dateDelivrance)) : NaN;
    const exp = l.dateExpiration ? Date.parse(String(l.dateExpiration)) : NaN;
    const sd = l.suspensionDebut ? Date.parse(String(l.suspensionDebut)) : NaN;
    const sf = l.suspensionFin ? Date.parse(String(l.suspensionFin)) : NaN;
    if (Number.isFinite(del) && Number.isFinite(exp) && exp < del)
      A.push({ categorie: "Dates", gravite: "mineur", titre: "Expiration avant la délivrance", detail: `${l.numero}`, suggestion: "Corriger les dates.", ref: String(l.id) });
    if (Number.isFinite(sd) && Number.isFinite(sf) && sf < sd)
      A.push({ categorie: "Dates", gravite: "mineur", titre: "Fin de suspension avant son début", detail: `${l.numero}`, suggestion: "Corriger les dates de suspension.", ref: String(l.id) });
  }

  // ── Unicité ─────────────────────────────────────────────────────────────
  ctrl();
  const parNum = new Map<string, number>();
  for (const l of licences) { const k = norm(l.numero); if (!k) continue; parNum.set(k, (parNum.get(k) || 0) + 1); }
  for (const [k, n] of parNum) if (n > 1)
    A.push({ categorie: "Unicité", gravite: "majeur", titre: "Numéro de licence en double", detail: `${k.toUpperCase()} apparaît ${n} fois`, suggestion: "Renuméroter les doublons.", ref: k });
  ctrl();
  const parIdent = new Map<string, string[]>();
  for (const m of membresL) { const k = norm(m.identifiant); if (!k) continue; parIdent.set(k, [...(parIdent.get(k) || []), String(m.nom)]); }
  for (const [k, noms] of parIdent) if (noms.length > 1)
    A.push({ categorie: "Unicité", gravite: "majeur", titre: "Même ID Discord sur plusieurs rôles", detail: `${noms.join(", ")}`, suggestion: "Supprimer les fiches en double.", ref: k });

  const { categories, scoreGlobal } = scorer(CATEGORIES, A);
  return { genereLe: new Date().toISOString(), pret: true, canVoir: true, scoreGlobal, totalControles: controles, categories, anomalies: trierAnomalies(A), checklist: CHECKLIST };
}
