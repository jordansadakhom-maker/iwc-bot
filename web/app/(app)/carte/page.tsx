import { getSessionDiscordId } from "@/lib/queries";
import { PageHeader } from "@/components/ui";

// Carte interactive : on intègre la vraie carte servie par le bot (points, planques,
// itinéraires). Le site demande au bot un jeton personnel (secret partagé), en
// respectant le niveau d'accès Discord de l'utilisateur, puis l'affiche en iframe.
export const dynamic = "force-dynamic";

export default async function CartePage() {
  const botUrl = (process.env.BOT_CARTE_URL || "https://iwc-bot.fly.dev").replace(/\/+$/, "");
  const secret = process.env.CARTE_SITE_SECRET || "";
  const uid = await getSessionDiscordId();

  let tok: string | null = null;
  let motif: "config" | "auth" | "bot" | null = null;
  if (!secret) motif = "config";
  else if (!uid) motif = "auth";
  else {
    try {
      const r = await fetch(`${botUrl}/carte/site-token?secret=${encodeURIComponent(secret)}&uid=${encodeURIComponent(uid)}`, { cache: "no-store" });
      if (r.ok) { const j = (await r.json().catch(() => ({}))) as { tok?: string }; tok = j?.tok || null; if (!tok) motif = "bot"; }
      else motif = "bot";
    } catch { motif = "bot"; }
  }

  return (
    <>
      <PageHeader titre="Carte interactive" sous="Points, planques, itinéraires — la carte de la Confrérie, en direct depuis le bot." actif={!!tok} />
      {tok ? (
        <div className="overflow-hidden rounded-[14px] border border-border bg-surface-2" style={{ height: "calc(100vh - 200px)", minHeight: 480 }}>
          <iframe src={`${botUrl}/carte?k=${encodeURIComponent(tok)}`} title="Carte interactive de la Confrérie" className="h-full w-full" style={{ border: 0 }} allow="fullscreen" />
        </div>
      ) : (
        <div className="rounded-[14px] border border-border bg-surface-2 p-6 text-[0.9rem] text-muted">
          {motif === "config" ? (
            <>La carte n&apos;est pas encore reliée. Il manque la variable <code className="rounded bg-surface px-1">CARTE_SITE_SECRET</code> (à définir côté site <b>et</b> côté bot, avec la même valeur).</>
          ) : motif === "auth" ? (
            <>Connecte-toi avec Discord pour accéder à la carte.</>
          ) : (
            <>La carte est momentanément injoignable (le serveur du bot ne répond pas, ou l&apos;adresse <code className="rounded bg-surface px-1">BOT_CARTE_URL</code> est incorrecte). Réessaie dans un instant.</>
          )}
        </div>
      )}
    </>
  );
}
