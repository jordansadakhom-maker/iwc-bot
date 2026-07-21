import { ImageResponse } from "next/og";

// Image d'aperçu (embed Discord / réseaux) générée à la volée. 1200×630.
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";
export const alt = "Iron Wolf Company — Rejoignez la meute";

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
            "radial-gradient(900px 460px at 50% -6%, rgba(200,164,92,0.26), rgba(14,17,22,0)), radial-gradient(700px 500px at 108% 108%, rgba(176,65,58,0.18), rgba(14,17,22,0))",
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
        <svg viewBox="0 0 24 24" fill="#c8a45c" width="128" height="128">
          <path d="M12 2 8.5 5H5l-.7 3.4L2 10l1.6 2.2L3 15l2.7 1 .8 3 3-1.2L12 21l1.5-3.2 3 1.2.8-3 2.7-1-.6-2.8L22 10l-2.3-1.6L19 5h-3.5L12 2Zm0 5.5 1.8 1.6L12 11l-1.8-1.9L12 7.5Z" />
        </svg>
        <div
          style={{
            marginTop: 12,
            fontSize: 30,
            letterSpacing: 10,
            color: "#95a1b1",
            textTransform: "uppercase",
          }}
        >
          Compagnie de sécurité · Louisiane
        </div>
        <div
          style={{
            marginTop: 8,
            fontSize: 92,
            fontWeight: 700,
            letterSpacing: 2,
            color: "#e2c483",
            display: "flex",
          }}
        >
          IRON WOLF COMPANY
        </div>
        <div style={{ marginTop: 18, width: 220, height: 3, backgroundColor: "#c8a45c", display: "flex" }} />
        <div style={{ marginTop: 26, fontSize: 40, color: "#e9e3d4", display: "flex" }}>
          Sécurité · Escorte · Chasse de prime
        </div>
        <div style={{ marginTop: 14, fontSize: 32, color: "#c8a45c", display: "flex" }}>
          — Rejoignez la meute —
        </div>
      </div>
    ),
    { ...size },
  );
}
