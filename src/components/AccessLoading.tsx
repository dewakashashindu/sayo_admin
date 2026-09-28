'use client';
// src/components/AccessLoading.tsx
// Neutral full-area placeholder rendered while the user's access profile is
// being resolved — prevents a flash of restricted content before the gate.
import { useEffect, useState } from "react";

export default function AccessLoading() {
  const [dot, setDot] = useState(0);
  useEffect(() => {
    const t = setInterval(() => setDot((d) => (d + 1) % 4), 320);
    return () => clearInterval(t);
  }, []);
  return (
    <div
      style={{
        flex: 1,
        minHeight: "60vh",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        gap: 14,
        background: "#edf1f0",
        borderRadius: 18,
      }}
    >
      <div
        style={{
          width: 34,
          height: 34,
          borderRadius: "50%",
          border: "3px solid rgba(28,86,98,.15)",
          borderTopColor: "#1c5662",
          animation: "al-spin .7s linear infinite",
        }}
      />
      <div style={{ fontFamily: "'Inter',sans-serif", fontSize: 13, color: "#5d6b69", fontWeight: 600, letterSpacing: ".04em" }}>
        CHECKING ACCESS{".".repeat(dot).padEnd(3, "\u00a0")}
      </div>
      <style>{`@keyframes al-spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  );
}
