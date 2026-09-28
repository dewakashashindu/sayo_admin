'use client';
// Full-page lock shown when the role/profile says the user has no access.
import React from "react";

export default function NoAccess({ screen }: { screen: string }) {
  return (
    <div
      style={{
        minHeight: "100vh",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        background: "#c2d4d4",
        fontFamily: "inherit",
      }}
    >
      <div
        style={{
          background: "#eef4f4",
          borderRadius: 14,
          padding: "26px 34px",
          textAlign: "center",
          boxShadow: "0 8px 24px rgba(0,0,0,.12)",
          maxWidth: 420,
        }}
      >
        <div style={{ fontSize: 22, fontWeight: 800, color: "#1e3a40", marginBottom: 8 }}>No Access</div>
        <div style={{ fontSize: 13, color: "#3c5a60" }}>
          You do not have access to {screen}.<br />
          Ask your administrator to grant it in Access Profiles.
        </div>
      </div>
    </div>
  );
}
