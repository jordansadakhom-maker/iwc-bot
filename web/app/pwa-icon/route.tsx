import { ImageResponse } from "next/og";

// Icône PWA 512×512 (installation « appli » sur téléphone/bureau). Servie à /pwa-icon.
export function GET() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          backgroundColor: "#0e1116",
          backgroundImage: "radial-gradient(circle at 50% 38%, rgba(200,164,92,0.28), rgba(14,17,22,0) 62%)",
        }}
      >
        <svg width="320" height="320" viewBox="0 0 24 24" fill="#c8a45c">
          <path d="M12 2 8.5 5H5l-.7 3.4L2 10l1.6 2.2L3 15l2.7 1 .8 3 3-1.2L12 21l1.5-3.2 3 1.2.8-3 2.7-1-.6-2.8L22 10l-2.3-1.6L19 5h-3.5L12 2Zm0 5.5 1.8 1.6L12 11l-1.8-1.9L12 7.5Z" />
        </svg>
      </div>
    ),
    { width: 512, height: 512 },
  );
}
