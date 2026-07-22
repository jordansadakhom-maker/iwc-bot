import { ImageResponse } from "next/og";

// Image d'aperçu (embed Discord / réseaux) pour la section Dispensaire — 1200×630.
// Remplace celle d'Iron Wolf sur toutes les routes /dispensaire.
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";
export const alt = "Dispensaire de Saint-Denis — Registre administratif · 1904";

export default function OpengraphImage() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          backgroundColor: "#0e1116",
          backgroundImage:
            "radial-gradient(900px 460px at 50% -6%, rgba(200,164,92,0.24), rgba(14,17,22,0)), radial-gradient(700px 500px at 108% 108%, rgba(120,150,110,0.16), rgba(14,17,22,0))",
          color: "#e9e3d4",
          fontFamily: "Georgia, serif",
          position: "relative",
        }}
      >
        <div
          style={{
            position: "absolute",
            top: 34,
            left: 34,
            right: 34,
            bottom: 34,
            border: "2px solid rgba(200,164,92,0.35)",
            borderRadius: 22,
            display: "flex",
          }}
        />
        {/* Croix médicale */}
        <svg viewBox="0 0 24 24" fill="none" stroke="#c8a45c" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" width="120" height="120">
          <path d="M11 2h2a1 1 0 0 1 1 1v6h6a1 1 0 0 1 1 1v2a1 1 0 0 1-1 1h-6v6a1 1 0 0 1-1 1h-2a1 1 0 0 1-1-1v-6H4a1 1 0 0 1-1-1v-2a1 1 0 0 1 1-1h6V3a1 1 0 0 1 1-1Z" />
        </svg>
        <div
          style={{
            marginTop: 16,
            fontSize: 28,
            letterSpacing: 10,
            color: "#95a1b1",
            textTransform: "uppercase",
          }}
        >
          Comté de Lemoyne · Saint-Denis
        </div>
        <div
          style={{
            marginTop: 10,
            fontSize: 78,
            fontWeight: 700,
            letterSpacing: 1,
            color: "#e2c483",
            display: "flex",
          }}
        >
          Dispensaire de Saint-Denis
        </div>
        <div style={{ marginTop: 18, width: 220, height: 3, backgroundColor: "#c8a45c", display: "flex" }} />
        <div style={{ marginTop: 26, fontSize: 38, color: "#e9e3d4", display: "flex" }}>
          Soins · Personnel · Stocks · Facturation
        </div>
        <div style={{ marginTop: 14, fontSize: 30, fontStyle: "italic", color: "#95a1b1", display: "flex" }}>
          Registre administratif · Année 1904
        </div>
      </div>
    ),
    { ...size },
  );
}
