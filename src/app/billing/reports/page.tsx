"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import AdminSidebar, { SIDEBAR_CSS } from "@/components/AdminSidebar";
import UserName from "@/components/UserName";
import { useMyAccess } from "@/lib/useMyAccess";
import { logoutAdmin } from "@/lib/logout";
import NoAccess from "@/components/NoAccess";
import AccessLoading from "@/components/AccessLoading";
import { REPORT_CSS } from "@/components/billing-reports/reportCss";

export default function BillingReportsHubPage() {
  const router = useRouter();
  const { loaded, enforce, has } = useMyAccess();
  const [navKey, setNavKey] = useState("billing-reports");

  if (!loaded) {
    return (
      <div style={{ display: "flex", alignItems: "center", justifyContent: "center", height: "100vh", background: "#c2d4d4" }}>
        <AccessLoading />
      </div>
    );
  }
  if (enforce && !(has("BILLGRP", "ACCESS") && has("BILLREP", "ACCESS"))) {
    return <NoAccess screen="Billing Reports" />;
  }

  return (
    <>
      <style>{SIDEBAR_CSS}</style>
      <style>{REPORT_CSS}</style>
      <div className="br-root" style={{ display: "flex", height: "100vh", overflow: "hidden", background: "#c2d4d4" }}>
        <AdminSidebar
          active={navKey}
          onNav={(key, path) => { setNavKey(key); router.push(path); }}
          onLogout={() => { void logoutAdmin().finally(() => router.push("/admin-login")); }}
        />
        <div style={{ display: "flex", flex: 1, flexDirection: "column", minWidth: 0, overflow: "hidden" }}>
          <header
            style={{
              display: "flex", alignItems: "center", height: 56, flexShrink: 0, gap: 12,
              padding: "0 18px", borderBottom: "1px solid rgba(0,0,0,.06)", background: "#dae6e6",
            }}
          >
            <div style={{ flex: 1 }} />
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <div style={{ width: 34, height: 34, borderRadius: "50%", background: "linear-gradient(135deg,#5a8a92,#3a6a72)", color: "#fff", display: "flex", alignItems: "center", justifyContent: "center", fontWeight: 700 }}>S</div>
              <div className="hdr-name" style={{ display: "flex", flexDirection: "column", lineHeight: 1.25 }}>
                <span style={{ color: "#1f2937", fontSize: 14, fontWeight: 700 }}><UserName /></span>
                <span style={{ color: "#6b7280", fontSize: 11 }}>Billing reports</span>
              </div>
            </div>
          </header>
          <div className="main-body" style={{ flex: 1, overflow: "auto", padding: "40px 18px", display: "flex", alignItems: "center", justifyContent: "center" }}>
            <p style={{ color: "#5b7377", fontSize: 14, fontWeight: 600, textAlign: "center", maxWidth: 360 }}>
              Open a report from <b>Billing → Reports</b> in the sidebar.
            </p>
          </div>
        </div>
      </div>
    </>
  );
}
