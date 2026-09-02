"use client";

import React, {
  useState,
  useMemo,
  useRef,
  useEffect,
  useCallback,
} from "react";
import { useRouter } from "next/navigation";
import AdminSidebar, { SIDEBAR_CSS } from "@/components/AdminSidebar";

/* ═══════════════════════════════════════════════════════
   INTERFACES
═══════════════════════════════════════════════════════ */
interface LocationDetail {
  locCode: string;
  locName: string;
  enable: boolean;
  locStockBalance: number;
  salesMargin: number;
  retailPrice: number;
  wsPrice: number;
}

interface Item {
  id: number;
  locCode: string;
  itemCode: string;
  serviceItem: boolean;
  semiFinishedProd: boolean;
  itemDes: string;
  itemPrintDes: string;
  masterUnitID: string;
  category1: string;
  category2: string;
  category3: string;
  category4: string;
  supID: string;
  rol: number;
  roq: number;
  minQty: number;
  maxQty: number;
  rawCost: number;
  costMarkup: number;
  salesMargin: number;
  stockBalance: number;
  expiryItem: boolean;
  retailPrice: number;
  durationMin: number;
  wsApp: boolean;
  wsQty: number;
  wsPrice: number;
  packedItem: boolean;
  packSize: number;
  packPrice: number;
  itemPic: string | null;
  createDate: string;
  createBy: string;
  updDate: string;
  updBy: string;
  // Derived only for the browse list. Enable is controlled per location.
  enable: boolean;
  locationDetails: LocationDetail[];
}

interface MasterOpt {
  code: string;
  name?: string;
  des?: string;
  id?: string;
}

interface SubUnit {
  id: string;
  des: string;
}

interface RawItem {
  code: string;
  des: string;
  unit: string;
  cost: number;
  isSemiFinished: boolean;
}

interface RecipeRow {
  menuItmID: string;
  rowItemCode: string;
  rowItemDes: string;
  masterUnitID: string;
  subUnitID: string;
  qty: number;
  locCode: string;
  itemCost: number;
  isNew?: boolean;
}

/* ═══════════════════════════════════════════════════════
   HELPERS
═══════════════════════════════════════════════════════ */
function itemType(it: { serviceItem: boolean; semiFinishedProd: boolean }) {
  if (it.serviceItem) return "service" as const;
  if (it.semiFinishedProd) return "semi" as const;
  return "raw" as const;
}

function canHaveRecipe(it: {
  serviceItem: boolean;
  semiFinishedProd: boolean;
}) {
  return it.serviceItem || it.semiFinishedProd;
}

function allowedIngredients(
  menuType: "service" | "semi" | "raw",
  allRaw: RawItem[],
): RawItem[] {
  if (menuType === "service") return allRaw;
  if (menuType === "semi") {
    return allRaw.filter((row) => !row.isSemiFinished);
  }
  return [];
}

function emptyItem(): Item {
  const today = new Date().toISOString().slice(0, 10);

  return {
    id: 0,
    locCode: "",
    itemCode: "",
    serviceItem: false,
    semiFinishedProd: false,
    itemDes: "",
    itemPrintDes: "",
    masterUnitID: "UNT03",
    category1: "",
    category2: "",
    category3: "",
    category4: "",
    supID: "",
    rol: 0,
    roq: 0,
    minQty: 0,
    maxQty: 0,
    rawCost: 0,
    costMarkup: 0,
    salesMargin: 0,
    stockBalance: 0,
    expiryItem: false,
    retailPrice: 0,
    durationMin: 30,
    wsApp: false,
    wsQty: 0,
    wsPrice: 0,
    packedItem: false,
    packSize: 0,
    packPrice: 0,
    itemPic: null,
    createDate: today,
    createBy: "ADMIN",
    updDate: today,
    updBy: "ADMIN",
    enable: true,
    locationDetails: [],
  };
}

/* ═══════════════════════════════════════════════════════
   CSS
═══════════════════════════════════════════════════════ */
const PAGE_CSS = `
  @import url('https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700;800&display=swap');
  *, *::before, *::after { box-sizing:border-box; margin:0; padding:0; }
  html, body { height:100%; font-family:'Inter',sans-serif; overflow:hidden; }

  @keyframes fadeUp { from{opacity:0;transform:translateY(6px);}to{opacity:1;transform:none;} }
  .fade-up { animation:fadeUp 0.2s ease both; }

  @keyframes spin { to{transform:rotate(360deg);} }
  .spinner { display:inline-block; width:14px; height:14px; border:2px solid rgba(255,255,255,0.35); border-top-color:#fff; border-radius:50%; animation:spin 0.65s linear infinite; flex-shrink:0; }
  .spinner.dark { border-color:rgba(30,58,64,0.2); border-top-color:#1e3a40; }

  @keyframes toastIn { from{opacity:0;transform:translateX(-50%) translateY(16px);} to{opacity:1;transform:translateX(-50%) translateY(0);} }
  .toast { position:fixed; bottom:28px; left:50%; transform:translateX(-50%); background:#1e3a40; color:#fff; padding:11px 26px; border-radius:10px; font-family:'Inter',sans-serif; font-size:13px; font-weight:600; z-index:9999; box-shadow:0 4px 20px rgba(0,0,0,0.28); animation:toastIn 0.22s ease; white-space:nowrap; }
  .toast.err { background:#dc2626; }

  ::-webkit-scrollbar{width:5px;height:5px;}
  ::-webkit-scrollbar-track{background:transparent;}
  ::-webkit-scrollbar-thumb{background:rgba(30,58,64,0.18);border-radius:4px;}

  .frm-input { width:100%; border:1.5px solid #d1d9da; border-radius:8px; padding:0 11px; height:36px; font-family:'Inter',sans-serif; font-size:13px; color:#1f2937; background:#fff; outline:none; transition:border-color 0.15s,box-shadow 0.15s; }
  .frm-input:focus { border-color:#1e3a40; box-shadow:0 0 0 3px rgba(30,58,64,0.08); }
  .frm-input:read-only { background:#f3f6f6; color:#6b7280; cursor:default; }
  .frm-input:disabled { background:#f3f6f6; color:#9ca3af; cursor:not-allowed; }

  .frm-select { width:100%; border:1.5px solid #d1d9da; border-radius:8px; padding:0 28px 0 11px; height:36px; font-family:'Inter',sans-serif; font-size:13px; color:#1f2937; background:#fff url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='11' height='11' viewBox='0 0 24 24' fill='none' stroke='%23555' stroke-width='2.5'%3E%3Cpolyline points='6 9 12 15 18 9'/%3E%3C/svg%3E") no-repeat right 8px center; appearance:none; -webkit-appearance:none; outline:none; cursor:pointer; transition:border-color 0.15s,box-shadow 0.15s; }
  .frm-select:focus { border-color:#1e3a40; box-shadow:0 0 0 3px rgba(30,58,64,0.08); }

  .card { background:#fff; border:1.5px solid #d8e4e6; border-radius:14px; overflow:hidden; box-shadow:0 1px 4px rgba(30,58,64,0.06); }
  .card-hdr { background:linear-gradient(90deg,#1e3a40 0%,#2a5260 100%); padding:10px 16px; display:flex; align-items:center; gap:8px; }
  .card-hdr-title { color:#fff; font-size:11.5px; font-weight:700; letter-spacing:0.07em; text-transform:uppercase; flex:1; }
  .card-hdr-badge { background:rgba(255,255,255,0.15); color:rgba(255,255,255,0.9); font-size:10px; font-weight:700; padding:2px 9px; border-radius:99px; letter-spacing:0.04em; }
  .card-body { padding:16px; }

  .frm-label { font-size:10.5px; font-weight:700; color:#4b5563; text-transform:uppercase; letter-spacing:0.06em; margin-bottom:4px; display:block; }

  .flags-grid { display:grid; grid-template-columns:repeat(3,1fr); gap:10px; }
  .flag-card { position:relative; border-radius:12px; border:1.5px solid #e5eded; background:#fafbfc; overflow:hidden; transition:all 0.2s ease; }
  .flag-card.is-on { border-color:var(--fc,#1e3a40); background:#fff; box-shadow:0 2px 8px rgba(0,0,0,0.07); }
  .flag-card::before { content:''; position:absolute; left:0; top:0; bottom:0; width:3px; background:var(--fc,#d1d9da); transition:background 0.2s; }
  .flag-card.is-on::before { background:var(--fc,#1e3a40); }
  .flag-card-inner { padding:12px 14px 12px 17px; }
  .flag-toggle-row { display:flex; align-items:center; gap:10px; cursor:pointer; user-select:none; }
  .flag-switch { position:relative; width:36px; height:20px; flex-shrink:0; }
  .flag-switch-track { width:36px; height:20px; border-radius:10px; background:#d1d9da; transition:background 0.2s; }
  .flag-switch-track.on { background:var(--fc,#1e3a40); }
  .flag-switch-thumb { position:absolute; top:3px; left:3px; width:14px; height:14px; border-radius:50%; background:#fff; transition:transform 0.2s; box-shadow:0 1px 3px rgba(0,0,0,0.2); }
  .flag-switch-thumb.on { transform:translateX(16px); }
  .flag-info { flex:1; min-width:0; }
  .flag-title { font-size:12.5px; font-weight:700; color:#374151; line-height:1.2; transition:color 0.2s; }
  .flag-title.on { color:var(--fc,#1e3a40); }
  .flag-subtitle { font-size:10.5px; color:#9ca3af; margin-top:1px; font-weight:500; }
  .flag-status-dot { width:8px; height:8px; border-radius:50%; background:#d1d9da; flex-shrink:0; transition:background 0.2s; }
  .flag-status-dot.on { background:var(--fc,#16a34a); }
  .flag-sub-area { border-top:1px solid #f0f4f4; padding:10px 14px 12px 17px; background:#f8fafa; display:flex; flex-direction:column; gap:8px; }
  .flag-sub-label { font-size:9.5px; font-weight:700; color:#6b7280; text-transform:uppercase; letter-spacing:0.06em; display:block; margin-bottom:3px; }
  .flag-sub-input { width:100%; border:1.5px solid #d1d9da; border-radius:7px; padding:0 10px; height:32px; font-size:12.5px; font-family:'Inter',sans-serif; color:#1f2937; background:#fff; outline:none; transition:border-color 0.15s,box-shadow 0.15s; }
  .flag-sub-input:focus { border-color:var(--fc,#1e3a40); box-shadow:0 0 0 2px rgba(30,58,64,0.08); }
  .flag-sub-input:disabled { background:#f3f6f6; color:#9ca3af; cursor:not-allowed; }

  .btn-save { display:flex;align-items:center;justify-content:center;gap:7px;padding:0 24px;height:40px;border-radius:9px;background:#1e3a40;color:#fff;border:none;font-family:'Inter',sans-serif;font-size:13px;font-weight:700;cursor:pointer;transition:all 0.18s;box-shadow:0 2px 8px rgba(30,58,64,0.25); }
  .btn-save:hover:not(:disabled){background:#162e34;transform:translateY(-1px);}
  .btn-save:disabled{background:#9ca3af;cursor:not-allowed;}
  .btn-new{display:flex;align-items:center;justify-content:center;gap:7px;padding:0 16px;height:36px;border-radius:9px;background:linear-gradient(135deg,#1e3a40,#2a5260);color:#fff;border:none;font-family:'Inter',sans-serif;font-size:12px;font-weight:700;cursor:pointer;transition:all 0.18s;}
  .btn-new:hover:not(:disabled){background:linear-gradient(135deg,#162e34,#1e4050);transform:translateY(-1px);}
  .btn-new:disabled{opacity:0.5;cursor:not-allowed;}
  .btn-del{display:flex;align-items:center;justify-content:center;gap:7px;padding:0 18px;height:40px;border-radius:9px;background:#fff2f2;color:#dc2626;border:1.5px solid #fca5a5;font-family:'Inter',sans-serif;font-size:13px;font-weight:700;cursor:pointer;transition:all 0.18s;}
  .btn-del:hover:not(:disabled){background:#fee2e2;border-color:#f87171;transform:translateY(-1px);}
  .btn-del:disabled{opacity:0.5;cursor:not-allowed;}
  .btn-clear{display:flex;align-items:center;justify-content:center;gap:7px;padding:0 18px;height:40px;border-radius:9px;background:#f3f4f6;color:#374151;border:1.5px solid #d1d9da;font-family:'Inter',sans-serif;font-size:13px;font-weight:700;cursor:pointer;transition:all 0.18s;}
  .btn-clear:hover{background:#e5e7eb;transform:translateY(-1px);}
  .btn-print{display:flex;align-items:center;justify-content:center;gap:7px;padding:0 18px;height:40px;border-radius:9px;background:#f0f9ff;color:#0369a1;border:1.5px solid #bae6fd;font-family:'Inter',sans-serif;font-size:13px;font-weight:700;cursor:pointer;transition:all 0.18s;}
  .btn-print:hover{background:#e0f2fe;transform:translateY(-1px);}
  .btn-viewmore{display:flex;align-items:center;justify-content:center;gap:6px;padding:0 14px;height:36px;border-radius:9px;background:rgba(255,255,255,0.12);color:rgba(255,255,255,0.85);border:1.5px solid rgba(255,255,255,0.2);font-family:'Inter',sans-serif;font-size:12px;font-weight:700;cursor:pointer;transition:all 0.18s;white-space:nowrap;}
  .btn-viewmore:hover{background:rgba(255,255,255,0.22);color:#fff;}

  .badge-active{display:inline-flex;padding:2px 8px;border-radius:99px;font-size:10px;font-weight:700;background:#dcfce7;color:#15803d;}
  .badge-inactive{display:inline-flex;padding:2px 8px;border-radius:99px;font-size:10px;font-weight:700;background:#fee2e2;color:#dc2626;}
  .badge-cat{display:inline-flex;padding:2px 8px;border-radius:99px;font-size:10px;font-weight:600;background:rgba(30,58,64,0.08);color:#1e3a40;}
  .badge-service{display:inline-flex;padding:2px 8px;border-radius:99px;font-size:10px;font-weight:700;background:#ede9fe;color:#7c3aed;}
  .badge-semi{display:inline-flex;padding:2px 8px;border-radius:99px;font-size:10px;font-weight:700;background:#fce7f3;color:#be185d;}
  .badge-raw{display:inline-flex;padding:2px 8px;border-radius:99px;font-size:10px;font-weight:700;background:#f0fdf4;color:#16a34a;}

  .quick-nav{display:flex;gap:6px;flex-wrap:wrap;padding:10px 14px;background:#fff;border-bottom:1px solid #e5e7eb;flex-shrink:0;}
  .quick-nav-btn{padding:5px 12px;border-radius:7px;border:1.5px solid #d8e4e6;background:#f7fafa;color:#1e3a40;font-family:'Inter',sans-serif;font-size:11px;font-weight:700;cursor:pointer;transition:all 0.15s;white-space:nowrap;display:flex;align-items:center;gap:5px;}
  .quick-nav-btn:hover{background:#1e3a40;color:#fff;border-color:#1e3a40;}
  .panel-tabs{display:flex;gap:0;flex-shrink:0;background:#1e3a40;padding:0 16px;}
  .panel-tab{padding:10px 22px;font-family:'Inter',sans-serif;font-size:13px;font-weight:700;color:rgba(255,255,255,0.55);border:none;background:transparent;cursor:pointer;border-bottom:3px solid transparent;transition:all 0.15s;letter-spacing:0.02em;display:flex;align-items:center;gap:7px;}
  .panel-tab:hover{color:rgba(255,255,255,0.85);}
  .panel-tab.active{color:#fff;border-bottom-color:#7dd3c8;}

  .loc-grid-wrap{overflow-x:auto;border-radius:10px;border:1.5px solid #e5e7eb;}
  .loc-grid{width:100%;border-collapse:collapse;font-family:'Inter',sans-serif;font-size:13px;}
  .loc-grid thead tr{background:linear-gradient(90deg,#1e3a40,#2a5260);}
  .loc-grid thead th{padding:10px 12px;text-align:left;color:rgba(255,255,255,0.9);font-size:11px;font-weight:700;letter-spacing:0.06em;text-transform:uppercase;white-space:nowrap;}
  .loc-grid tbody tr{border-bottom:1px solid #f0f4f4;transition:background 0.1s;}
  .loc-grid tbody tr:last-child{border-bottom:none;}
  .loc-grid tbody tr:hover{background:#f7fafa;}
  .loc-grid tbody td{padding:8px 10px;vertical-align:middle;}
  .loc-grid-input{width:100%;min-width:80px;border:1.5px solid #d1d9da;border-radius:6px;padding:0 8px;height:31px;font-size:12px;font-family:'Inter',sans-serif;color:#1f2937;background:#fff;outline:none;transition:border-color 0.15s,box-shadow 0.15s;}
  .loc-grid-input:focus{border-color:#1e3a40;box-shadow:0 0 0 2px rgba(30,58,64,0.08);}
  .loc-grid-input:read-only{background:#f3f6f6;color:#6b7280;cursor:default;}

  .rcp-wrap{border-radius:12px;border:1.5px solid #e5e7eb;overflow:visible;}
  .rcp-table{width:100%;border-collapse:collapse;font-family:'Inter',sans-serif;font-size:13px;}
  .rcp-table thead tr{background:linear-gradient(90deg,#1e3a40,#2a5260);}
  .rcp-table thead th{padding:10px 12px;text-align:left;color:rgba(255,255,255,0.85);font-size:10.5px;font-weight:700;letter-spacing:0.07em;text-transform:uppercase;white-space:nowrap;}
  .rcp-table tbody tr{border-bottom:1px solid #f0f4f4;transition:background 0.1s;}
  .rcp-table tbody tr:last-child{border-bottom:none;}
  .rcp-table tbody tr:hover{background:#f7fafa;}
  .rcp-table tbody td{padding:6px 8px;vertical-align:middle;}
  .rcp-input{width:100%;border:1.5px solid #e2e8f0;border-radius:7px;padding:0 9px;height:32px;font-size:12.5px;font-family:'Inter',sans-serif;color:#1f2937;background:#fff;outline:none;transition:border-color 0.15s,box-shadow 0.15s;}
  .rcp-input:focus{border-color:#1e3a40;box-shadow:0 0 0 2px rgba(30,58,64,0.08);}
  .rcp-input:read-only{background:#f8fafa;color:#6b7280;cursor:default;}
  .rcp-input:disabled{background:#f3f6f6;color:#9ca3af;}
  .rcp-btn-add{display:inline-flex;align-items:center;gap:7px;padding:0 18px;height:36px;border-radius:8px;background:#1e3a40;color:#fff;border:none;font-family:'Inter',sans-serif;font-size:12.5px;font-weight:700;cursor:pointer;transition:background 0.15s;}
  .rcp-btn-add:hover{background:#162e34;}
  .rcp-btn-remove{display:inline-flex;align-items:center;justify-content:center;width:28px;height:28px;border-radius:7px;flex-shrink:0;background:#fee2e2;color:#dc2626;border:1.5px solid #fca5a5;cursor:pointer;transition:all 0.15s;}
  .rcp-btn-remove:hover{background:#fecaca;border-color:#f87171;}

  .ac-portal-dropdown{position:fixed;background:#fff;border:2px solid #1e3a40;border-radius:10px;box-shadow:0 12px 32px rgba(30,58,64,0.22),0 2px 8px rgba(0,0,0,0.12);z-index:99999;max-height:300px;overflow-y:auto;font-family:'Inter',sans-serif;min-width:340px;}
  .ac-item{display:flex;align-items:flex-start;gap:10px;padding:10px 13px;cursor:pointer;transition:background 0.1s;border-bottom:1px solid #f0f4f4;}
  .ac-item:last-child{border-bottom:none;}
  .ac-item:hover,.ac-item.highlighted{background:rgba(30,58,64,0.07);}
  .ac-code{font-size:11px;font-weight:800;color:#1e3a40;background:rgba(30,58,64,0.1);padding:2px 7px;border-radius:5px;white-space:nowrap;flex-shrink:0;margin-top:2px;}
  .ac-des{font-size:12px;color:#374151;font-weight:500;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;flex:1;}
  .ac-cost{font-size:11px;color:#6b7280;font-weight:600;white-space:nowrap;flex-shrink:0;margin-top:2px;}
  .ac-item mark{background:#fef08a;color:#1e3a40;border-radius:2px;padding:0 1px;font-weight:700;}
  .itm-ac-dropdown{position:fixed;background:#fff;border:2px solid #1e3a40;border-radius:10px;box-shadow:0 12px 32px rgba(30,58,64,0.22);z-index:99999;max-height:300px;overflow-y:auto;font-family:'Inter',sans-serif;}
  .itm-ac-item{display:flex;align-items:center;gap:10px;padding:10px 14px;cursor:pointer;transition:background 0.1s;border-bottom:1px solid #f0f4f4;}
  .itm-ac-item:last-child{border-bottom:none;}
  .itm-ac-item:hover,.itm-ac-item.hi{background:rgba(30,58,64,0.07);}
  .itm-ac-thumb{width:32px;height:32px;border-radius:7px;flex-shrink:0;background:linear-gradient(135deg,#1e3a40,#2a5260);display:flex;align-items:center;justify-content:center;color:#fff;overflow:hidden;}
  .itm-ac-main{flex:1;min-width:0;}
  .itm-ac-code{font-size:11px;font-weight:800;color:#1e3a40;}
  .itm-ac-des{font-size:12.5px;font-weight:600;color:#1f2937;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;}
  .itm-ac-sub{font-size:10.5px;color:#9ca3af;margin-top:1px;}
  .itm-ac-price{font-size:12px;font-weight:700;color:#1e3a40;white-space:nowrap;flex-shrink:0;}

  @keyframes modalIn{from{opacity:0;transform:scale(0.96);}to{opacity:1;transform:scale(1);}}
  .items-modal-overlay{position:fixed;inset:0;background:rgba(0,0,0,0.55);z-index:10000;display:flex;align-items:center;justify-content:center;padding:24px;backdrop-filter:blur(3px);}
  .items-modal{background:#fff;border-radius:18px;width:100%;max-width:940px;max-height:90vh;display:flex;flex-direction:column;box-shadow:0 24px 80px rgba(0,0,0,0.35);animation:modalIn 0.22s ease;overflow:hidden;}
  .items-modal-hdr{background:linear-gradient(135deg,#1e3a40,#2a5260);padding:18px 22px;display:flex;align-items:center;gap:12px;flex-shrink:0;}
  .items-modal-filters{padding:14px 18px;border-bottom:1px solid #e5e7eb;background:#f8fafa;display:flex;gap:10px;flex-wrap:wrap;align-items:center;flex-shrink:0;}
  .items-modal-list{flex:1;overflow-y:auto;padding:10px 14px;display:flex;flex-direction:column;gap:6px;}
  .popup-item-row{display:flex;align-items:center;gap:12px;padding:11px 14px;border-radius:10px;border:1.5px solid #e5e7eb;background:#fff;cursor:pointer;transition:all 0.14s;width:100%;text-align:left;font-family:'Inter',sans-serif;}
  .popup-item-row:hover{border-color:#1e3a40;background:#f0f6f7;box-shadow:0 2px 10px rgba(30,58,64,0.1);transform:translateY(-1px);}
  .popup-filter-input{border:1.5px solid #d1d9da;border-radius:8px;padding:0 11px;height:36px;font-family:'Inter',sans-serif;font-size:13px;color:#1f2937;background:#fff;outline:none;}
  .popup-filter-input:focus{border-color:#1e3a40;box-shadow:0 0 0 3px rgba(30,58,64,0.08);}
  .popup-filter-select{border:1.5px solid #d1d9da;border-radius:8px;padding:0 28px 0 11px;height:36px;font-family:'Inter',sans-serif;font-size:13px;color:#1f2937;background:#fff url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='11' height='11' viewBox='0 0 24 24' fill='none' stroke='%23555' stroke-width='2.5'%3E%3Cpolyline points='6 9 12 15 18 9'/%3E%3C/svg%3E") no-repeat right 8px center;appearance:none;-webkit-appearance:none;outline:none;cursor:pointer;}
  .popup-filter-select:focus{border-color:#1e3a40;box-shadow:0 0 0 3px rgba(30,58,64,0.08);}
  .recent-strip{display:flex;gap:10px;flex-wrap:nowrap;overflow-x:auto;padding-bottom:2px;}
  .recent-card{flex-shrink:0;width:210px;border-radius:12px;border:1.5px solid #d8e4e6;background:#fff;padding:12px 14px;cursor:pointer;transition:all 0.15s;display:flex;flex-direction:column;gap:6px;box-shadow:0 1px 4px rgba(30,58,64,0.07);text-align:left;font-family:'Inter',sans-serif;}
  .recent-card:hover{border-color:#1e3a40;box-shadow:0 3px 12px rgba(30,58,64,0.14);transform:translateY(-2px);}
  .recipe-blocked{border-radius:12px;border:2px dashed #d1d9da;padding:40px 24px;text-align:center;color:#9ca3af;background:#fafafa;}
  @media(max-width:767px){.flags-grid{grid-template-columns:1fr 1fr !important;}}
`;

/* ═══════════════════════════════════════════════════════
   ICONS
═══════════════════════════════════════════════════════ */
const IBell = ({ s = 21 }: { s?: number }) => (
  <svg
    width={s}
    height={s}
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="1.8"
    strokeLinecap="round"
    strokeLinejoin="round"
  >
    <path d="M18 8a6 6 0 0 0-12 0c0 7-3 9-3 9h18s-3-2-3-9" />
    <path d="M13.73 21a2 2 0 0 1-3.46 0" />
  </svg>
);
const ISearch = ({ s = 15 }: { s?: number }) => (
  <svg
    width={s}
    height={s}
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
  >
    <circle cx="11" cy="11" r="8" />
    <line x1="21" y1="21" x2="16.65" y2="16.65" />
  </svg>
);
const IChevD = ({ s = 13 }: { s?: number }) => (
  <svg
    width={s}
    height={s}
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2.5"
    strokeLinecap="round"
    strokeLinejoin="round"
  >
    <polyline points="6 9 12 15 18 9" />
  </svg>
);
const IPlus = ({ s = 16 }: { s?: number }) => (
  <svg
    width={s}
    height={s}
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2.5"
    strokeLinecap="round"
    strokeLinejoin="round"
  >
    <line x1="12" y1="5" x2="12" y2="19" />
    <line x1="5" y1="12" x2="19" y2="12" />
  </svg>
);
const ITrash = ({ s = 15 }: { s?: number }) => (
  <svg
    width={s}
    height={s}
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
  >
    <polyline points="3 6 5 6 21 6" />
    <path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6" />
    <path d="M10 11v6" />
    <path d="M14 11v6" />
    <path d="M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2" />
  </svg>
);
const IPrint = ({ s = 15 }: { s?: number }) => (
  <svg
    width={s}
    height={s}
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
  >
    <polyline points="6 9 6 2 18 2 18 9" />
    <path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2" />
    <rect x="6" y="14" width="12" height="8" />
  </svg>
);
const ISave = ({ s = 15 }: { s?: number }) => (
  <svg
    width={s}
    height={s}
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
  >
    <path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z" />
    <polyline points="17 21 17 13 7 13 7 21" />
    <polyline points="7 3 7 8 15 8" />
  </svg>
);
const IRefresh = ({ s = 15 }: { s?: number }) => (
  <svg
    width={s}
    height={s}
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
  >
    <polyline points="1 4 1 10 7 10" />
    <path d="M3.51 15a9 9 0 1 0 .49-3.5" />
  </svg>
);
const ITag = ({ s = 13 }: { s?: number }) => (
  <svg
    width={s}
    height={s}
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
  >
    <path d="M20.59 13.41l-7.17 7.17a2 2 0 0 1-2.83 0L2 12V2h10l8.59 8.59a2 2 0 0 1 0 2.82z" />
    <line x1="7" y1="7" x2="7.01" y2="7" />
  </svg>
);
const IArchive = ({ s = 13 }: { s?: number }) => (
  <svg
    width={s}
    height={s}
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
  >
    <polyline points="21 8 21 21 3 21 3 8" />
    <rect x="1" y="3" width="22" height="5" />
    <line x1="10" y1="12" x2="14" y2="12" />
  </svg>
);
const ILayers = ({ s = 13 }: { s?: number }) => (
  <svg
    width={s}
    height={s}
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
  >
    <polygon points="12 2 2 7 12 12 22 7 12 2" />
    <polyline points="2 17 12 22 22 17" />
    <polyline points="2 12 12 17 22 12" />
  </svg>
);
const IDollar = ({ s = 14 }: { s?: number }) => (
  <svg
    width={s}
    height={s}
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
  >
    <line x1="12" y1="1" x2="12" y2="23" />
    <path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6" />
  </svg>
);
const IBox = ({ s = 20 }: { s?: number }) => (
  <svg
    width={s}
    height={s}
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
  >
    <path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z" />
    <polyline points="3.27 6.96 12 12.01 20.73 6.96" />
    <line x1="12" y1="22.08" x2="12" y2="12" />
  </svg>
);
const IMapPin = ({ s = 13 }: { s?: number }) => (
  <svg
    width={s}
    height={s}
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
  >
    <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z" />
    <circle cx="12" cy="10" r="3" />
  </svg>
);
const IFlag = ({ s = 13 }: { s?: number }) => (
  <svg
    width={s}
    height={s}
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
  >
    <path d="M4 15s1-1 4-1 5 2 8 2 4-1 4-1V3s-1 1-4 1-5-2-8-2-4 1-4 1z" />
    <line x1="4" y1="22" x2="4" y2="15" />
  </svg>
);
const IFlask = ({ s = 14 }: { s?: number }) => (
  <svg
    width={s}
    height={s}
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
  >
    <path d="M9 3h6" />
    <path d="M10 3v6l-4 9a1 1 0 0 0 .9 1.45h10.2A1 1 0 0 0 18 18l-4-9V3" />
  </svg>
);
const IImage = ({ s = 13 }: { s?: number }) => (
  <svg
    width={s}
    height={s}
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
  >
    <rect x="3" y="3" width="18" height="18" rx="2" />
    <circle cx="8.5" cy="8.5" r="1.5" />
    <polyline points="21 15 16 10 5 21" />
  </svg>
);
const IGrid = ({ s = 14 }: { s?: number }) => (
  <svg
    width={s}
    height={s}
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
  >
    <rect x="3" y="3" width="7" height="7" />
    <rect x="14" y="3" width="7" height="7" />
    <rect x="14" y="14" width="7" height="7" />
    <rect x="3" y="14" width="7" height="7" />
  </svg>
);
const IClose = ({ s = 18 }: { s?: number }) => (
  <svg
    width={s}
    height={s}
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2.5"
    strokeLinecap="round"
    strokeLinejoin="round"
  >
    <line x1="18" y1="6" x2="6" y2="18" />
    <line x1="6" y1="6" x2="18" y2="18" />
  </svg>
);
const IZap = ({ s = 14 }: { s?: number }) => (
  <svg
    width={s}
    height={s}
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
  >
    <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2" />
  </svg>
);

/* ═══════════════════════════════════════════════════════
   SMALL HELPERS
═══════════════════════════════════════════════════════ */
function FieldRow({
  label,
  htmlFor,
  children,
}: {
  label: string;
  htmlFor?: string;
  children: React.ReactNode;
}) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
      <label className="frm-label" htmlFor={htmlFor}>
        {label}
      </label>
      {children}
    </div>
  );
}

function Card({
  id,
  title,
  icon,
  badge,
  children,
}: {
  id?: string;
  title: string;
  icon?: React.ReactNode;
  badge?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="card" id={id}>
      <div className="card-hdr">
        {icon && (
          <span style={{ color: "rgba(255,255,255,0.7)", display: "flex" }}>
            {icon}
          </span>
        )}
        <span className="card-hdr-title">{title}</span>
        {badge && <span className="card-hdr-badge">{badge}</span>}
      </div>
      <div className="card-body">{children}</div>
    </div>
  );
}

function useToast() {
  const [toast, setToast] = useState<{ msg: string; err: boolean } | null>(
    null,
  );
  const ref = useRef<ReturnType<typeof setTimeout> | null>(null);

  const show = useCallback((msg: string, err = false) => {
    if (ref.current) clearTimeout(ref.current);
    setToast({ msg, err });
    ref.current = setTimeout(() => setToast(null), 2800);
  }, []);

  return { toast, show };
}

function TypeBadge({
  it,
}: {
  it: { serviceItem: boolean; semiFinishedProd: boolean };
}) {
  const type = itemType(it);
  if (type === "service") return <span className="badge-service">Service</span>;
  if (type === "semi") return <span className="badge-semi">Semi-Finished</span>;
  return <span className="badge-raw">Raw Item</span>;
}

function Hl({ text, q }: { text: string; q: string }): React.ReactElement {
  if (!q.trim()) return <>{text}</>;
  const index = text.toUpperCase().indexOf(q.toUpperCase());
  if (index === -1) return <>{text}</>;

  return (
    <>
      {text.slice(0, index)}
      <mark
        style={{
          background: "#fef08a",
          color: "#1e3a40",
          borderRadius: 2,
          padding: "0 1px",
          fontWeight: 700,
        }}
      >
        {text.slice(index, index + q.length)}
      </mark>
      {text.slice(index + q.length)}
    </>
  );
}

/* ═══════════════════════════════════════════════════════
   FLAGS
   Enable is intentionally not included here. Enable belongs
   to each Location Details row.
═══════════════════════════════════════════════════════ */
interface FlagDef {
  key: keyof Item;
  label: string;
  subtitle: string;
  color: string;
  subInputs?: { label: string; field: keyof Item }[];
}

const FLAG_DEFS: FlagDef[] = [
  {
    key: "serviceItem",
    label: "Service Item",
    subtitle: "Non-physical / service-based",
    color: "#7c3aed",
  },
  {
    key: "semiFinishedProd",
    label: "Semi-Finished Prod",
    subtitle: "Intermediate production item",
    color: "#be185d",
  },
  {
    key: "wsApp",
    label: "Wholesale Pricing",
    subtitle: "Wholesale rate applicable",
    color: "#0369a1",
    subInputs: [
      { label: "WS Qty", field: "wsQty" },
      { label: "WS Price", field: "wsPrice" },
    ],
  },
  {
    key: "expiryItem",
    label: "Expiry Tracking",
    subtitle: "Track expiration dates",
    color: "#b45309",
  },
  {
    key: "packedItem",
    label: "Packing Details",
    subtitle: "Has pack size & price",
    color: "#0f766e",
    subInputs: [
      { label: "Pack Size", field: "packSize" },
      { label: "Pack Price", field: "packPrice" },
    ],
  },
];

function FlagsCard({
  item,
  onChange,
}: {
  item: Item;
  onChange: <K extends keyof Item>(key: K, value: Item[K]) => void;
}) {
  const activeCount = FLAG_DEFS.filter((definition) =>
    Boolean(item[definition.key]),
  ).length;

  function toggle(definition: FlagDef) {
    const newValue = !Boolean(item[definition.key]);

    if (definition.key === "serviceItem" && newValue) {
      onChange("semiFinishedProd", false as Item["semiFinishedProd"]);
    }

    if (definition.key === "semiFinishedProd" && newValue) {
      onChange("serviceItem", false as Item["serviceItem"]);
    }

    onChange(definition.key, newValue as Item[typeof definition.key]);
  }

  return (
    <Card
      id="sec-flags"
      title="Flags"
      icon={<IFlag s={13} />}
      badge={`${activeCount} / ${FLAG_DEFS.length} active`}
    >
      <div className="flags-grid">
        {FLAG_DEFS.map((definition) => {
          const isOn = Boolean(item[definition.key]);

          return (
            <div
              key={String(definition.key)}
              className={`flag-card ${isOn ? "is-on" : ""}`}
              style={{ "--fc": definition.color } as React.CSSProperties}
            >
              <div className="flag-card-inner">
                <div
                  className="flag-toggle-row"
                  role="checkbox"
                  aria-checked={isOn}
                  tabIndex={0}
                  onClick={() => toggle(definition)}
                  onKeyDown={(event) => {
                    if (event.key === "Enter" || event.key === " ") {
                      event.preventDefault();
                      toggle(definition);
                    }
                  }}
                >
                  <div className="flag-switch">
                    <div className={`flag-switch-track ${isOn ? "on" : ""}`} />
                    <div className={`flag-switch-thumb ${isOn ? "on" : ""}`} />
                  </div>
                  <div className="flag-info">
                    <div className={`flag-title ${isOn ? "on" : ""}`}>
                      {definition.label}
                    </div>
                    <div className="flag-subtitle">{definition.subtitle}</div>
                  </div>
                  <div className={`flag-status-dot ${isOn ? "on" : ""}`} />
                </div>
              </div>

              {definition.subInputs && (
                <div className="flag-sub-area">
                  {definition.subInputs.map((input) => (
                    <div key={String(input.field)}>
                      <label className="flag-sub-label">{input.label}</label>
                      <input
                        className="flag-sub-input"
                        type="number"
                        min={0}
                        value={item[input.field] as number}
                        disabled={!isOn}
                        style={
                          { "--fc": definition.color } as React.CSSProperties
                        }
                        onChange={(event) =>
                          onChange(
                            input.field,
                            Number(
                              event.target.value,
                            ) as Item[typeof input.field],
                          )
                        }
                        onClick={(event) => event.stopPropagation()}
                      />
                    </div>
                  ))}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </Card>
  );
}

/* ═══════════════════════════════════════════════════════
   ITEM CODE INPUT
═══════════════════════════════════════════════════════ */
function ItemCodeInput({
  value,
  allItems,
  isNew,
  onSelect,
  onChange,
}: {
  value: string;
  allItems: Item[];
  isNew: boolean;
  onSelect: (item: Item) => void;
  onChange: (value: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [highlightIndex, setHighlightIndex] = useState(0);
  const [dropdownStyle, setDropdownStyle] = useState<React.CSSProperties>({});
  const inputRef = useRef<HTMLInputElement>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);

  const suggestions = useMemo(() => {
    if (!isNew) return [];
    const query = value.trim().toUpperCase();
    if (!query) return [];

    return allItems
      .filter(
        (item) =>
          item.itemCode.toUpperCase().includes(query) ||
          item.itemDes.toUpperCase().includes(query),
      )
      .slice(0, 10);
  }, [value, allItems, isNew]);

  const updatePosition = useCallback(() => {
    if (!inputRef.current) return;
    const rect = inputRef.current.getBoundingClientRect();
    setDropdownStyle({
      top: rect.bottom + 4,
      left: rect.left,
      width: Math.max(rect.width, 360),
      maxHeight: 300,
    });
  }, []);

  useEffect(() => {
    if (open) updatePosition();
  }, [open, updatePosition, suggestions.length]);

  useEffect(() => {
    if (!open) return;

    function handleOutside(event: MouseEvent) {
      if (inputRef.current?.contains(event.target as Node)) return;
      if (dropdownRef.current?.contains(event.target as Node)) return;
      setOpen(false);
    }

    document.addEventListener("mousedown", handleOutside);
    return () => document.removeEventListener("mousedown", handleOutside);
  }, [open]);

  if (!isNew) {
    return <input className="frm-input" value={value} readOnly />;
  }

  return (
    <>
      <input
        ref={inputRef}
        className="frm-input"
        style={{ textTransform: "uppercase" }}
        value={value}
        placeholder="Enter new or existing code…"
        autoComplete="off"
        maxLength={15}
        onChange={(event) => {
          onChange(event.target.value.toUpperCase());
          setOpen(true);
          setHighlightIndex(0);
        }}
        onFocus={() => {
          if (value.trim()) {
            setOpen(true);
            updatePosition();
          }
        }}
        onKeyDown={(event) => {
          if (event.key === "ArrowDown") {
            event.preventDefault();
            setOpen(true);
            setHighlightIndex((currentIndex) =>
              Math.min(currentIndex + 1, Math.max(suggestions.length - 1, 0)),
            );
          } else if (event.key === "ArrowUp") {
            event.preventDefault();
            setHighlightIndex((currentIndex) => Math.max(currentIndex - 1, 0));
          } else if (event.key === "Enter") {
            if (open && suggestions[highlightIndex]) {
              event.preventDefault();
              onSelect(suggestions[highlightIndex]);
              setOpen(false);
            }
          } else if (event.key === "Escape" || event.key === "Tab") {
            setOpen(false);
          }
        }}
      />

      {open &&
        suggestions.length > 0 &&
        typeof document !== "undefined" &&
        (() => {
          const { createPortal } = require("react-dom");

          return createPortal(
            <div
              ref={dropdownRef}
              className="itm-ac-dropdown"
              style={{ position: "fixed", ...dropdownStyle }}
              onMouseDown={(event) => event.preventDefault()}
            >
              {suggestions.map((item, index) => (
                <div
                  key={`${item.locCode}|${item.itemCode}`}
                  className={`itm-ac-item ${index === highlightIndex ? "hi" : ""}`}
                  onMouseDown={() => {
                    onSelect(item);
                    setOpen(false);
                  }}
                  onMouseEnter={() => setHighlightIndex(index)}
                >
                  <div className="itm-ac-thumb">
                    {item.itemPic ? (
                      <img
                        src={item.itemPic}
                        alt=""
                        style={{
                          width: "100%",
                          height: "100%",
                          objectFit: "cover",
                        }}
                      />
                    ) : (
                      <IBox s={15} />
                    )}
                  </div>
                  <div className="itm-ac-main">
                    <div
                      style={{ display: "flex", alignItems: "center", gap: 6 }}
                    >
                      <span className="itm-ac-code">
                        <Hl text={item.itemCode} q={value} />
                      </span>
                      <TypeBadge it={item} />
                    </div>
                    <div className="itm-ac-des">
                      <Hl text={item.itemDes} q={value} />
                    </div>
                    <div className="itm-ac-sub">Loc: {item.locCode}</div>
                  </div>
                  <span style={{ textAlign: "right", flexShrink: 0 }}>
                    <span className="itm-ac-price">
                      LKR {item.retailPrice.toFixed(0)}
                    </span>
                    {item.serviceItem && (
                      <span
                        style={{
                          display: "block",
                          fontSize: 10,
                          color: "#6b7280",
                          marginTop: 2,
                          textAlign: "right",
                        }}
                      >
                        ⏱ {item.durationMin} min
                      </span>
                    )}
                  </span>
                </div>
              ))}
            </div>,
            document.body,
          );
        })()}
    </>
  );
}

/* ═══════════════════════════════════════════════════════
   INGREDIENT AUTOCOMPLETE
═══════════════════════════════════════════════════════ */
function IngredientAC({
  value,
  items,
  placeholder,
  onSelect,
  onChange,
}: {
  value: string;
  items: RawItem[];
  placeholder?: string;
  onSelect: (item: RawItem) => void;
  onChange: (value: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [highlightIndex, setHighlightIndex] = useState(0);
  const [dropdownStyle, setDropdownStyle] = useState<React.CSSProperties>({});
  const inputRef = useRef<HTMLInputElement>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);

  const suggestions = useMemo(() => {
    const query = value.trim().toUpperCase();
    if (!query) return [];

    return items
      .filter(
        (item) =>
          item.code.toUpperCase().includes(query) ||
          item.des.toUpperCase().includes(query),
      )
      .slice(0, 14);
  }, [value, items]);

  const updatePosition = useCallback(() => {
    if (!inputRef.current) return;
    const rect = inputRef.current.getBoundingClientRect();
    const spaceBelow = window.innerHeight - rect.bottom;
    const spaceAbove = rect.top;
    const dropdownHeight = Math.min(320, suggestions.length * 56 + 8);

    if (spaceBelow >= dropdownHeight || spaceBelow >= spaceAbove) {
      setDropdownStyle({
        top: rect.bottom + window.scrollY + 4,
        left: rect.left + window.scrollX,
        width: Math.max(rect.width, 360),
        maxHeight: Math.min(320, spaceBelow - 8),
      });
    } else {
      setDropdownStyle({
        top: rect.top + window.scrollY - dropdownHeight - 4,
        left: rect.left + window.scrollX,
        width: Math.max(rect.width, 360),
        maxHeight: Math.min(320, spaceAbove - 8),
      });
    }
  }, [suggestions.length]);

  useEffect(() => {
    if (open) updatePosition();
  }, [open, updatePosition, suggestions.length]);

  useEffect(() => {
    if (!open) return;

    function handleOutside(event: MouseEvent) {
      if (inputRef.current?.contains(event.target as Node)) return;
      if (dropdownRef.current?.contains(event.target as Node)) return;
      setOpen(false);
    }

    function handleScroll() {
      updatePosition();
    }

    document.addEventListener("mousedown", handleOutside);
    window.addEventListener("scroll", handleScroll, true);

    return () => {
      document.removeEventListener("mousedown", handleOutside);
      window.removeEventListener("scroll", handleScroll, true);
    };
  }, [open, updatePosition]);

  const showDropdown = open && suggestions.length > 0;

  return (
    <>
      <input
        ref={inputRef}
        className="rcp-input"
        value={value}
        placeholder={placeholder ?? "Code / Name…"}
        autoComplete="off"
        onChange={(event) => {
          onChange(event.target.value);
          setOpen(true);
          setHighlightIndex(0);
        }}
        onFocus={() => {
          if (value.trim()) {
            setOpen(true);
            updatePosition();
          }
        }}
        onKeyDown={(event) => {
          if (event.key === "ArrowDown") {
            event.preventDefault();
            setOpen(true);
            setHighlightIndex((currentIndex) =>
              Math.min(currentIndex + 1, Math.max(suggestions.length - 1, 0)),
            );
          } else if (event.key === "ArrowUp") {
            event.preventDefault();
            setHighlightIndex((currentIndex) => Math.max(currentIndex - 1, 0));
          } else if (event.key === "Enter") {
            if (open && suggestions[highlightIndex]) {
              event.preventDefault();
              event.stopPropagation();
              onSelect(suggestions[highlightIndex]);
              setOpen(false);
            }
          } else if (event.key === "Escape" || event.key === "Tab") {
            setOpen(false);
          }
        }}
      />

      {showDropdown &&
        typeof document !== "undefined" &&
        (() => {
          const { createPortal } = require("react-dom");

          return createPortal(
            <div
              ref={dropdownRef}
              className="ac-portal-dropdown"
              style={dropdownStyle}
              onMouseDown={(event) => event.preventDefault()}
            >
              {suggestions.map((item, index) => (
                <div
                  key={item.code}
                  className={`ac-item ${index === highlightIndex ? "highlighted" : ""}`}
                  style={{ padding: "10px 13px" }}
                  onMouseDown={() => {
                    onSelect(item);
                    setOpen(false);
                  }}
                  onMouseEnter={() => setHighlightIndex(index)}
                >
                  <span className="ac-code">
                    <Hl text={item.code} q={value} />
                  </span>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div
                      style={{
                        fontSize: 12.5,
                        fontWeight: 600,
                        color: "#1f2937",
                        lineHeight: 1.35,
                      }}
                    >
                      <Hl text={item.des} q={value} />
                    </div>
                    <div
                      style={{
                        display: "flex",
                        alignItems: "center",
                        gap: 6,
                        marginTop: 3,
                      }}
                    >
                      {item.isSemiFinished ? (
                        <span className="badge-semi" style={{ fontSize: 9 }}>
                          Semi-Finished
                        </span>
                      ) : (
                        <span className="badge-raw" style={{ fontSize: 9 }}>
                          Raw Item
                        </span>
                      )}
                      <span style={{ fontSize: 10.5, color: "#6b7280" }}>
                        Unit:{" "}
                        <strong style={{ color: "#1e3a40" }}>
                          {item.unit}
                        </strong>
                      </span>
                    </div>
                  </div>
                  <span className="ac-cost">LKR {item.cost.toFixed(2)}</span>
                </div>
              ))}
            </div>,
            document.body,
          );
        })()}
    </>
  );
}

/* ═══════════════════════════════════════════════════════
   LOCATION GRID
   Enable is location-level. Disabling an enabled location
   is allowed only when its stock is exactly zero.
═══════════════════════════════════════════════════════ */
function LocationGrid({
  rows,
  onChange,
  onError,
}: {
  rows: LocationDetail[];
  onChange: (rows: LocationDetail[]) => void;
  onError?: (message: string) => void;
}) {
  function updateRow(
    index: number,
    key: keyof LocationDetail,
    value: LocationDetail[keyof LocationDetail],
  ) {
    onChange(
      rows.map((row, rowIndex) =>
        rowIndex === index ? { ...row, [key]: value } : row,
      ),
    );
  }

  function toggleEnable(index: number) {
    const row = rows[index];
    if (!row) return;

    const stock = Number(row.locStockBalance) || 0;

    if (row.enable && stock !== 0) {
      onError?.(
        `Cannot disable ${row.locCode}. Stock balance must be 0 (current: ${stock}).`,
      );
      return;
    }

    updateRow(index, "enable", !row.enable);
  }

  if (rows.length === 0) {
    return (
      <p
        style={{
          color: "#9ca3af",
          fontSize: 13,
          padding: "16px 0",
          textAlign: "center",
        }}
      >
        Loading locations…
      </p>
    );
  }

  return (
    <div className="loc-grid-wrap">
      <table className="loc-grid">
        <thead>
          <tr>
            <th>Loc Code</th>
            <th>Location Name</th>
            <th style={{ textAlign: "center" }}>Enable</th>
            <th>Stock (read-only)</th>
            <th>Sales Margin %</th>
            <th>Retail Price</th>
            <th>WS Price</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row, index) => {
            const stock = Number(row.locStockBalance) || 0;
            const cannotDisable = row.enable && stock !== 0;

            return (
              <tr key={row.locCode}>
                <td>
                  <input
                    className="loc-grid-input"
                    value={row.locCode}
                    readOnly
                    style={{ minWidth: 70, fontWeight: 700 }}
                  />
                </td>
                <td>
                  <input
                    className="loc-grid-input"
                    value={row.locName}
                    readOnly
                    style={{ minWidth: 130 }}
                  />
                </td>
                <td style={{ textAlign: "center" }}>
                  <div
                    role="checkbox"
                    aria-checked={row.enable}
                    tabIndex={0}
                    title={
                      cannotDisable
                        ? "Stock must be 0 before disabling"
                        : "Toggle location status"
                    }
                    style={{
                      display: "flex",
                      justifyContent: "center",
                      cursor: cannotDisable ? "not-allowed" : "pointer",
                      opacity: cannotDisable ? 0.65 : 1,
                    }}
                    onClick={() => toggleEnable(index)}
                    onKeyDown={(event) => {
                      if (event.key === "Enter" || event.key === " ") {
                        event.preventDefault();
                        toggleEnable(index);
                      }
                    }}
                  >
                    <div
                      style={{
                        width: 20,
                        height: 20,
                        borderRadius: 5,
                        border: `2px solid ${row.enable ? "#1e3a40" : "#9ca3af"}`,
                        background: row.enable ? "#1e3a40" : "#fff",
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        transition: "all 0.15s",
                      }}
                    >
                      {row.enable && (
                        <svg
                          width="11"
                          height="11"
                          viewBox="0 0 24 24"
                          fill="none"
                          stroke="#fff"
                          strokeWidth="3.5"
                          strokeLinecap="round"
                          strokeLinejoin="round"
                        >
                          <polyline points="20 6 9 17 4 12" />
                        </svg>
                      )}
                    </div>
                  </div>
                </td>
                <td>
                  <input
                    className="loc-grid-input"
                    value={stock.toFixed(2)}
                    readOnly
                    style={{
                      background: "#f0f9ff",
                      color: "#0369a1",
                      fontWeight: 700,
                    }}
                    title="Sourced from tbl_itemdetail — read only"
                  />
                </td>
                <td>
                  <input
                    className="loc-grid-input"
                    type="number"
                    value={row.salesMargin}
                    onChange={(event) =>
                      updateRow(
                        index,
                        "salesMargin",
                        Number(event.target.value),
                      )
                    }
                    min={0}
                  />
                </td>
                <td>
                  <input
                    className="loc-grid-input"
                    type="number"
                    value={row.retailPrice}
                    onChange={(event) =>
                      updateRow(
                        index,
                        "retailPrice",
                        Number(event.target.value),
                      )
                    }
                    min={0}
                  />
                </td>
                <td>
                  <input
                    className="loc-grid-input"
                    type="number"
                    value={row.wsPrice}
                    onChange={(event) =>
                      updateRow(index, "wsPrice", Number(event.target.value))
                    }
                    min={0}
                  />
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

/* ═══════════════════════════════════════════════════════
   RECIPE GRID
═══════════════════════════════════════════════════════ */
function RecipeGrid({
  rows,
  allowedItems,
  subUnits,
  onChange,
  menuItmID,
  defaultLocCode,
}: {
  rows: RecipeRow[];
  allowedItems: RawItem[];
  subUnits: SubUnit[];
  onChange: (rows: RecipeRow[]) => void;
  menuItmID: string;
  defaultLocCode: string;
}) {
  function selectByCode(index: number, item: RawItem) {
    onChange(
      rows.map((row, rowIndex) =>
        rowIndex !== index
          ? row
          : {
              ...row,
              rowItemCode: item.code,
              rowItemDes: item.des,
              masterUnitID: item.unit,
              itemCost: item.cost,
            },
      ),
    );
  }

  function selectByDescription(index: number, item: RawItem) {
    selectByCode(index, item);
  }

  function updateRow(
    index: number,
    key: keyof RecipeRow,
    value: RecipeRow[keyof RecipeRow],
  ) {
    onChange(
      rows.map((row, rowIndex) => {
        if (rowIndex !== index) return row;

        const updated: RecipeRow = { ...row, [key]: value };

        if (key === "rowItemCode") {
          const query = String(value).trim().toUpperCase();
          const found = allowedItems.find(
            (item) => item.code.trim().toUpperCase() === query,
          );
          if (found) {
            updated.rowItemDes = found.des;
            updated.masterUnitID = found.unit;
            updated.itemCost = found.cost;
          }
        }

        return updated;
      }),
    );
  }

  function updateDescription(index: number, value: string) {
    onChange(
      rows.map((row, rowIndex) =>
        rowIndex === index ? { ...row, rowItemDes: value } : row,
      ),
    );
  }

  function addRow() {
    onChange([
      ...rows,
      {
        menuItmID,
        rowItemCode: "",
        rowItemDes: "",
        masterUnitID: "",
        subUnitID: "",
        qty: 1,
        locCode: defaultLocCode,
        itemCost: 0,
        isNew: true,
      },
    ]);
  }

  const totalCost = rows.reduce(
    (sum, row) => sum + Number(row.qty) * Number(row.itemCost),
    0,
  );

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
      <div
        className="rcp-wrap"
        style={{ overflowX: "auto", overflowY: "visible" }}
      >
        <table
          className="rcp-table"
          style={{ tableLayout: "fixed", minWidth: 840 }}
        >
          <colgroup>
            <col style={{ width: 36 }} />
            <col style={{ width: 160 }} />
            <col style={{ width: "auto" }} />
            <col style={{ width: 120 }} />
            <col style={{ width: 72 }} />
            <col style={{ width: 98 }} />
            <col style={{ width: 98 }} />
            <col style={{ width: 40 }} />
          </colgroup>
          <thead>
            <tr>
              <th>#</th>
              <th>Item Code</th>
              <th>Description</th>
              <th>Sub Unit</th>
              <th>Qty</th>
              <th>Unit Cost</th>
              <th>Line Total</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 && (
              <tr>
                <td
                  colSpan={8}
                  style={{
                    textAlign: "center",
                    color: "#9ca3af",
                    padding: "28px 0",
                    fontSize: 13,
                  }}
                >
                  No ingredients yet — click <strong>+ Add Ingredient</strong>.
                </td>
              </tr>
            )}

            {rows.map((row, index) => (
              <tr key={index}>
                <td
                  style={{
                    color: "#9ca3af",
                    fontSize: 11,
                    textAlign: "center",
                    fontWeight: 700,
                  }}
                >
                  {index + 1}
                </td>
                <td>
                  <IngredientAC
                    value={row.rowItemCode}
                    items={allowedItems}
                    placeholder="Code…"
                    onChange={(value) =>
                      updateRow(index, "rowItemCode", value.toUpperCase())
                    }
                    onSelect={(item) => selectByCode(index, item)}
                  />
                </td>
                <td>
                  <IngredientAC
                    value={row.rowItemDes}
                    items={allowedItems}
                    placeholder="Type description to search…"
                    onChange={(value) => updateDescription(index, value)}
                    onSelect={(item) => selectByDescription(index, item)}
                  />
                </td>
                <td>
                  <select
                    className="rcp-input frm-select"
                    style={{ paddingRight: 28 }}
                    value={row.subUnitID}
                    onChange={(event) =>
                      updateRow(index, "subUnitID", event.target.value)
                    }
                  >
                    <option value="">-- Unit --</option>
                    {subUnits.map((unit) => (
                      <option key={unit.id} value={unit.id}>
                        {unit.des}
                      </option>
                    ))}
                  </select>
                </td>
                <td>
                  <input
                    className="rcp-input"
                    type="number"
                    min={0}
                    value={row.qty}
                    onChange={(event) =>
                      updateRow(index, "qty", Number(event.target.value))
                    }
                  />
                </td>
                <td>
                  <input
                    className="rcp-input"
                    type="number"
                    min={0}
                    value={row.itemCost}
                    onChange={(event) =>
                      updateRow(index, "itemCost", Number(event.target.value))
                    }
                  />
                </td>
                <td>
                  <input
                    className="rcp-input"
                    readOnly
                    style={{
                      background: "#f0f9ff",
                      color: "#0369a1",
                      fontWeight: 700,
                    }}
                    value={(Number(row.qty) * Number(row.itemCost)).toFixed(2)}
                  />
                </td>
                <td>
                  <button
                    type="button"
                    className="rcp-btn-remove"
                    onClick={() =>
                      onChange(rows.filter((_, rowIndex) => rowIndex !== index))
                    }
                    title="Remove"
                  >
                    <IClose s={12} />
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: 10,
          flexWrap: "wrap",
        }}
      >
        <button type="button" className="rcp-btn-add" onClick={addRow}>
          <IPlus s={13} /> Add Ingredient
        </button>

        {rows.length > 0 && (
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 16,
              background: "linear-gradient(135deg,#f0fdf4,#dcfce7)",
              border: "1.5px solid #bbf7d0",
              borderRadius: 10,
              padding: "10px 18px",
            }}
          >
            <div>
              <p
                style={{
                  fontSize: 10,
                  fontWeight: 700,
                  color: "#6b7280",
                  textTransform: "uppercase",
                  letterSpacing: "0.06em",
                }}
              >
                Ingredients
              </p>
              <p style={{ fontSize: 15, fontWeight: 800, color: "#15803d" }}>
                {rows.length}
              </p>
            </div>
            <div style={{ width: 1, height: 32, background: "#bbf7d0" }} />
            <div>
              <p
                style={{
                  fontSize: 10,
                  fontWeight: 700,
                  color: "#6b7280",
                  textTransform: "uppercase",
                  letterSpacing: "0.06em",
                }}
              >
                Total Recipe Cost
              </p>
              <p style={{ fontSize: 15, fontWeight: 800, color: "#15803d" }}>
                LKR {totalCost.toFixed(2)}
              </p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

/* ═══════════════════════════════════════════════════════
   ITEMS POPUP
═══════════════════════════════════════════════════════ */
function ItemsPopup({
  items,
  locations,
  category1,
  onSelect,
  onClose,
}: {
  items: Item[];
  locations: MasterOpt[];
  category1: MasterOpt[];
  onSelect: (item: Item) => void;
  onClose: () => void;
}) {
  const [search, setSearch] = useState("");
  const [filterLocation, setFilterLocation] = useState("");
  const [filterCategory, setFilterCategory] = useState("");
  const [filterEnabled, setFilterEnabled] = useState("");
  const [filterType, setFilterType] = useState("");

  const filtered = useMemo(
    () =>
      items.filter((item) => {
        const query = search.toLowerCase();
        const matchesQuery =
          !query ||
          item.itemDes.toLowerCase().includes(query) ||
          item.itemCode.toLowerCase().includes(query);
        const matchesLocation =
          !filterLocation || item.locCode === filterLocation;
        const matchesCategory =
          !filterCategory || item.category1 === filterCategory;
        const itemIsEnabled = item.locationDetails.some(
          (location) => location.enable,
        );
        const matchesEnabled =
          filterEnabled === "" ||
          (filterEnabled === "1" ? itemIsEnabled : !itemIsEnabled);
        const matchesType = !filterType || itemType(item) === filterType;

        return (
          matchesQuery &&
          matchesLocation &&
          matchesCategory &&
          matchesEnabled &&
          matchesType
        );
      }),
    [items, search, filterLocation, filterCategory, filterEnabled, filterType],
  );

  useEffect(() => {
    function handleKey(event: KeyboardEvent) {
      if (event.key === "Escape") onClose();
    }

    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, [onClose]);

  return (
    <div
      className="items-modal-overlay"
      onClick={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <div className="items-modal">
        <div className="items-modal-hdr">
          <div
            style={{
              width: 38,
              height: 38,
              borderRadius: 10,
              background: "rgba(255,255,255,0.15)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              color: "#fff",
              flexShrink: 0,
            }}
          >
            <IGrid s={18} />
          </div>
          <div style={{ flex: 1 }}>
            <p
              style={{
                color: "rgba(255,255,255,0.5)",
                fontSize: 10,
                fontWeight: 700,
                letterSpacing: "0.1em",
                textTransform: "uppercase",
              }}
            >
              Item Master
            </p>
            <p style={{ color: "#fff", fontSize: 16, fontWeight: 800 }}>
              All Items{" "}
              <span
                style={{
                  color: "rgba(255,255,255,0.4)",
                  fontSize: 13,
                  fontWeight: 500,
                }}
              >
                ({filtered.length} / {items.length})
              </span>
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            style={{
              background: "rgba(255,255,255,0.1)",
              border: "none",
              borderRadius: 8,
              width: 34,
              height: 34,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              color: "#fff",
              cursor: "pointer",
            }}
          >
            <IClose s={16} />
          </button>
        </div>

        <div className="items-modal-filters">
          <div style={{ position: "relative", flex: 1, minWidth: 180 }}>
            <span
              style={{
                position: "absolute",
                left: 10,
                top: "50%",
                transform: "translateY(-50%)",
                opacity: 0.4,
                display: "flex",
                alignItems: "center",
                pointerEvents: "none",
              }}
            >
              <ISearch s={14} />
            </span>
            <input
              className="popup-filter-input"
              style={{ width: "100%", paddingLeft: 32 }}
              placeholder="Search code or name…"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              autoFocus
            />
          </div>
          <select
            className="popup-filter-select"
            style={{ minWidth: 150 }}
            value={filterLocation}
            onChange={(event) => setFilterLocation(event.target.value)}
          >
            <option value="">All Locations</option>
            {locations.map((location) => (
              <option key={location.code} value={location.code}>
                {location.code} – {location.name}
              </option>
            ))}
          </select>
          <select
            className="popup-filter-select"
            style={{ minWidth: 140 }}
            value={filterCategory}
            onChange={(event) => setFilterCategory(event.target.value)}
          >
            <option value="">All Categories</option>
            {category1.map((category) => (
              <option key={category.code} value={category.code}>
                {category.des}
              </option>
            ))}
          </select>
          <select
            className="popup-filter-select"
            style={{ minWidth: 145 }}
            value={filterType}
            onChange={(event) => setFilterType(event.target.value)}
          >
            <option value="">All Types</option>
            <option value="service">Service Items</option>
            <option value="semi">Semi-Finished</option>
            <option value="raw">Raw Items</option>
          </select>
          <select
            className="popup-filter-select"
            style={{ minWidth: 110 }}
            value={filterEnabled}
            onChange={(event) => setFilterEnabled(event.target.value)}
          >
            <option value="">All Status</option>
            <option value="1">Active</option>
            <option value="0">Inactive</option>
          </select>
          {(search ||
            filterLocation ||
            filterCategory ||
            filterEnabled ||
            filterType) && (
            <button
              type="button"
              onClick={() => {
                setSearch("");
                setFilterLocation("");
                setFilterCategory("");
                setFilterEnabled("");
                setFilterType("");
              }}
              style={{
                padding: "0 12px",
                height: 36,
                borderRadius: 8,
                border: "1.5px solid #d1d9da",
                background: "#f3f4f6",
                color: "#374151",
                fontFamily: "'Inter',sans-serif",
                fontSize: 12,
                fontWeight: 700,
                cursor: "pointer",
              }}
            >
              Clear
            </button>
          )}
        </div>

        <div className="items-modal-list">
          {filtered.length === 0 && (
            <div
              style={{
                textAlign: "center",
                padding: "48px 0",
                color: "#9ca3af",
              }}
            >
              <IBox s={40} />
              <p style={{ marginTop: 12, fontSize: 14, fontWeight: 600 }}>
                No items match
              </p>
            </div>
          )}

          {filtered.map((item) => {
            const itemIsEnabled = item.locationDetails.some(
              (location) => location.enable,
            );

            return (
              <button
                type="button"
                key={`${item.locCode}|${item.itemCode}`}
                className="popup-item-row"
                onClick={() => {
                  onSelect(item);
                  onClose();
                }}
              >
                <div
                  style={{
                    width: 42,
                    height: 42,
                    borderRadius: 9,
                    background: itemIsEnabled
                      ? "linear-gradient(135deg,#1e3a40,#2a5260)"
                      : "#d1d5db",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    color: "#fff",
                    flexShrink: 0,
                    overflow: "hidden",
                  }}
                >
                  {item.itemPic ? (
                    <img
                      src={item.itemPic}
                      alt=""
                      style={{
                        width: "100%",
                        height: "100%",
                        objectFit: "cover",
                      }}
                    />
                  ) : (
                    <IBox s={18} />
                  )}
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: 8,
                      flexWrap: "wrap",
                    }}
                  >
                    <span
                      style={{
                        fontSize: 13,
                        fontWeight: 800,
                        color: "#1e3a40",
                      }}
                    >
                      {item.itemDes}
                    </span>
                    <span
                      style={{
                        fontSize: 11,
                        fontWeight: 600,
                        color: "#6b7280",
                        background: "rgba(30,58,64,0.07)",
                        padding: "1px 7px",
                        borderRadius: 5,
                      }}
                    >
                      {item.itemCode}
                    </span>
                  </div>
                  <div
                    style={{
                      display: "flex",
                      gap: 6,
                      marginTop: 5,
                      flexWrap: "wrap",
                      alignItems: "center",
                    }}
                  >
                    <span
                      className={
                        itemIsEnabled ? "badge-active" : "badge-inactive"
                      }
                    >
                      {itemIsEnabled ? "Active" : "Inactive"}
                    </span>
                    <TypeBadge it={item} />
                    {item.category1 && (
                      <span className="badge-cat">
                        {category1.find(
                          (category) => category.code === item.category1,
                        )?.des ?? item.category1}
                      </span>
                    )}
                    <span style={{ fontSize: 11, color: "#9ca3af" }}>
                      Loc:{" "}
                      <strong style={{ color: "#1e3a40" }}>
                        {item.locCode}
                      </strong>
                    </span>
                  </div>
                </div>
                <div style={{ textAlign: "right", flexShrink: 0 }}>
                  <p
                    style={{ fontSize: 13, fontWeight: 800, color: "#1e3a40" }}
                  >
                    LKR {item.retailPrice.toLocaleString()}
                  </p>
                  <p style={{ fontSize: 11, color: "#9ca3af", marginTop: 2 }}>
                    Cost: {item.rawCost.toFixed(2)}
                    {item.serviceItem && ` · ⏱ ${item.durationMin} min`}
                  </p>
                  {canHaveRecipe(item) && (
                    <p
                      style={{
                        fontSize: 10,
                        color: "#7c3aed",
                        fontWeight: 700,
                        marginTop: 2,
                      }}
                    >
                      ⚗ Recipe
                    </p>
                  )}
                </div>
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}

const SECTIONS = [
  { id: "sec-ident", label: "Identification", icon: <ITag s={11} /> },
  { id: "sec-categories", label: "Categories", icon: <IArchive s={11} /> },
  { id: "sec-flags", label: "Flags", icon: <IFlag s={11} /> },
  { id: "sec-cost", label: "Cost & Margin", icon: <IDollar s={11} /> },
  { id: "sec-reorder", label: "Reorder & Stock", icon: <ILayers s={11} /> },
  { id: "sec-locations", label: "Locations", icon: <IMapPin s={11} /> },
  { id: "sec-image", label: "Image", icon: <IImage s={11} /> },
];

/* ═══════════════════════════════════════════════════════
   MAIN PAGE
═══════════════════════════════════════════════════════ */
export default function ItemMasterPage() {
  const router = useRouter();
  const [navKey, setNavKey] = useState("services");

  const [items, setItems] = useState<Item[]>([]);
  const [locations, setLocations] = useState<MasterOpt[]>([]);
  const [units, setUnits] = useState<MasterOpt[]>([]);
  const [suppliers, setSuppliers] = useState<MasterOpt[]>([]);
  const [category1, setCategory1] = useState<MasterOpt[]>([]);
  const [category2, setCategory2] = useState<MasterOpt[]>([]);
  const [category3, setCategory3] = useState<MasterOpt[]>([]);
  const [category4, setCategory4] = useState<MasterOpt[]>([]);

  const [current, setCurrent] = useState<Item>(emptyItem());
  const [isNew, setIsNew] = useState(true);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [showPopup, setShowPopup] = useState(false);
  const [recentItems, setRecentItems] = useState<Item[]>([]);

  const [activeTab, setActiveTab] = useState<"details" | "recipe">("details");
  const [allRecipes, setAllRecipes] = useState<RecipeRow[]>([]);
  const [allRawItems, setAllRawItems] = useState<RawItem[]>([]);
  const [recipeRows, setRecipeRows] = useState<RecipeRow[]>([]);
  const [subUnits, setSubUnits] = useState<SubUnit[]>([]);
  const [recipeSaving, setRecipeSaving] = useState(false);
  const [recipeLocCodes, setRecipeLocCodes] = useState<string[]>([]);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const formRef = useRef<HTMLDivElement>(null);
  const { toast, show: showToast } = useToast();

  const overallCost = useMemo(
    () => current.rawCost * (1 + current.costMarkup / 100),
    [current.rawCost, current.costMarkup],
  );
  const currentType = itemType(current);
  const hasRecipeRights = canHaveRecipe(current);
  const primaryLocCode = recipeLocCodes[0] ?? current.locCode;

  const ingredientItems = useMemo(
    () => allowedIngredients(currentType, allRawItems),
    [currentType, allRawItems],
  );

  const loadItems = useCallback(async () => {
    setLoading(true);

    try {
      const response = await fetch("/api/services");
      const json = (await response.json()) as {
        success: boolean;
        items: Item[];
        locations: MasterOpt[];
        units: MasterOpt[];
        suppliers: MasterOpt[];
        category1: MasterOpt[];
        category2: MasterOpt[];
        category3: MasterOpt[];
        category4: MasterOpt[];
      };

      if (!json.success) throw new Error("Failed");

      setItems(json.items);
      setLocations(json.locations);
      setUnits(json.units);
      setSuppliers(json.suppliers);
      setCategory1(json.category1);
      setCategory2(json.category2);
      setCategory3(json.category3);
      setCategory4(json.category4);
    } catch {
      showToast("Failed to load items", true);
    } finally {
      setLoading(false);
    }
  }, [showToast]);

  useEffect(() => {
    loadItems();
  }, [loadItems]);

  const loadRecipeMaster = useCallback(async () => {
    try {
      const response = await fetch("/api/recipes");
      const json = (await response.json()) as {
        success: boolean;
        recipes: Array<{
          menuItmID: string;
          rowItemCode: string;
          masterUnitID: string;
          subUnitID: string;
          qty: number;
          locCode: string;
          itemCost: number;
        }>;
        rawItems: RawItem[];
        subUnits: SubUnit[];
      };

      if (!json.success) return;

      const rawItems = json.rawItems ?? [];
      setAllRawItems(rawItems);
      setSubUnits(json.subUnits ?? []);
      setAllRecipes(
        (json.recipes ?? []).map((recipe) => {
          const code = recipe.rowItemCode.trim().toUpperCase();
          const found = rawItems.find(
            (item) => item.code.trim().toUpperCase() === code,
          );

          return {
            ...recipe,
            rowItemDes: found?.des ?? "",
            masterUnitID: found?.unit ?? recipe.masterUnitID,
            itemCost:
              recipe.itemCost !== 0 ? recipe.itemCost : (found?.cost ?? 0),
          };
        }),
      );
    } catch {
      // Recipe master is optional; keep the screen usable.
    }
  }, []);

  useEffect(() => {
    loadRecipeMaster();
  }, [loadRecipeMaster]);

  const loadRecipes = useCallback(
    (menuItemID: string, locCode: string) => {
      if (!menuItemID) {
        setRecipeRows([]);
        return;
      }

      setRecipeRows(
        allRecipes
          .filter(
            (recipe) =>
              recipe.menuItmID.trim().toUpperCase() ===
                menuItemID.trim().toUpperCase() &&
              recipe.locCode.trim().toUpperCase() ===
                locCode.trim().toUpperCase(),
          )
          .map((recipe) => ({ ...recipe })),
      );
    },
    [allRecipes],
  );

  useEffect(() => {
    if (!isNew && current.itemCode && hasRecipeRights) {
      loadRecipes(current.itemCode, primaryLocCode);
    } else {
      setRecipeRows([]);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [current.itemCode, isNew, primaryLocCode, loadRecipes, hasRecipeRights]);

  useEffect(() => {
    if (current.locCode) setRecipeLocCodes([current.locCode]);
  }, [current.locCode]);

  useEffect(() => {
    if (!isNew || locations.length === 0 || current.locationDetails.length > 0)
      return;

    setCurrent((previous) => ({
      ...previous,
      locationDetails: locations.map((location) => ({
        locCode: location.code,
        locName: location.name ?? location.code,
        enable: true,
        locStockBalance: 0,
        salesMargin: 0,
        retailPrice: 0,
        wsPrice: 0,
      })),
    }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isNew, locations]);

  function updateItem<K extends keyof Item>(key: K, value: Item[K]) {
    setCurrent((previous) => ({ ...previous, [key]: value }));
  }

  function updateLocationDetails(rows: LocationDetail[]) {
    setCurrent((previous) => ({ ...previous, locationDetails: rows }));
  }

  function handleNew() {
    const fresh = emptyItem();
    fresh.locationDetails = locations.map((location) => ({
      locCode: location.code,
      locName: location.name ?? location.code,
      enable: true,
      locStockBalance: 0,
      salesMargin: 0,
      retailPrice: 0,
      wsPrice: 0,
    }));

    setCurrent(fresh);
    setIsNew(true);
    setActiveTab("details");
    document
      .getElementById("sec-ident")
      ?.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  function handleSelect(item: Item) {
    setCurrent({ ...item });
    setIsNew(false);
    setActiveTab("details");
  }

  function handleItemCodeSelect(item: Item) {
    setCurrent({ ...item });
    setIsNew(false);
  }

  const handleSave = useCallback(async () => {
    if (!current.itemDes.trim()) {
      showToast("Item Description is required", true);
      return;
    }

    if (!current.itemCode.trim()) {
      showToast("Item Code is required", true);
      return;
    }

    setSaving(true);
    const savedLocCode = current.locCode.trim() || locations[0]?.code || "01";
    const savedItemCode = current.itemCode.trim().toUpperCase();

    try {
      const payload = {
        ...current,
        locCode: savedLocCode,
        itemCode: savedItemCode,
      };

      const response = isNew
        ? await fetch("/api/services", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(payload),
          })
        : await fetch(
            `/api/services/${encodeURIComponent(savedLocCode)}/${encodeURIComponent(savedItemCode)}`,
            {
              method: "PUT",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify(payload),
            },
          );

      const json = (await response.json()) as {
        success: boolean;
        message?: string;
      };

      if (!json.success) throw new Error(json.message ?? "Save failed");

      showToast(isNew ? "Item created for all locations ✓" : "Saved ✓");

      if (isNew) {
        setRecentItems((previous) => {
          const next = {
            ...current,
            itemCode: savedItemCode,
            locCode: savedLocCode,
          };
          return [
            next,
            ...previous.filter((item) => item.itemCode !== savedItemCode),
          ].slice(0, 3);
        });
      }

      await loadItems();
      await loadRecipeMaster();
      handleNew();
    } catch (error) {
      showToast(error instanceof Error ? error.message : "Save failed", true);
    } finally {
      setSaving(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [current, isNew, locations, loadItems, loadRecipeMaster, showToast]);

  async function handleDelete() {
    if (!current.itemCode || isNew) return;
    if (
      !confirm(
        `Delete "${current.itemDes}" (${current.itemCode})?\nCannot be undone.`,
      )
    )
      return;

    setDeleting(true);

    try {
      const response = await fetch(
        `/api/services/${encodeURIComponent(current.locCode)}/${encodeURIComponent(current.itemCode)}`,
        { method: "DELETE" },
      );
      const json = (await response.json()) as {
        success: boolean;
        message?: string;
      };
      if (!json.success) throw new Error(json.message ?? "Delete failed");

      showToast("Deleted");
      await loadItems();
      handleNew();
    } catch (error) {
      showToast(error instanceof Error ? error.message : "Delete failed", true);
    } finally {
      setDeleting(false);
    }
  }

  function handleClear() {
    if (isNew) {
      handleNew();
      return;
    }

    const original = items.find((item) => item.id === current.id);
    if (original) setCurrent({ ...original });
  }

  const handleSaveRecipes = useCallback(async () => {
    if (!current.itemCode || isNew) {
      showToast("Save item first", true);
      return;
    }

    if (recipeRows.length === 0) {
      showToast("Add at least one ingredient", true);
      return;
    }

    if (recipeLocCodes.length === 0) {
      showToast("Select at least one location", true);
      return;
    }

    setRecipeSaving(true);

    try {
      const lines = recipeRows.map((row) => ({
        rowItemCode: row.rowItemCode,
        masterUnitID: row.masterUnitID,
        subUnitID: row.subUnitID,
        qty: row.qty,
        itemCost: row.itemCost,
      }));

      await Promise.all(
        recipeLocCodes.map((locationCode) =>
          fetch("/api/recipes", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              menuItmID: current.itemCode,
              lines: lines.map((line) => ({ ...line, locCode: locationCode })),
            }),
          }).then((response) => response.json()),
        ),
      );

      showToast(`Recipe saved for ${recipeLocCodes.length} location(s) ✓`);
      await loadRecipeMaster();
    } catch (error) {
      showToast(
        error instanceof Error ? error.message : "Recipe save failed",
        true,
      );
    } finally {
      setRecipeSaving(false);
    }
  }, [
    current.itemCode,
    isNew,
    recipeLocCodes,
    recipeRows,
    loadRecipeMaster,
    showToast,
  ]);

  function handlePictureChange(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = () => updateItem("itemPic", reader.result as string);
    reader.readAsDataURL(file);
  }

  function handleNavigate(key: string, path: string) {
    setNavKey(key);
    router.push(path);
  }

  function handleLogout() {
    router.push("/admin/login");
  }

  function handleFormKeyDown(event: React.KeyboardEvent<HTMLDivElement>) {
    if (event.key !== "Enter") return;

    const target = event.target as HTMLElement;
    if (target.tagName !== "INPUT" && target.tagName !== "SELECT") return;

    event.preventDefault();
    if (!formRef.current) return;

    const focusable = Array.from(
      formRef.current.querySelectorAll<HTMLElement>(
        'input:not([type="hidden"]):not([readonly]):not([disabled]), select:not([disabled])',
      ),
    ).filter((element) => element.offsetParent !== null);

    const index = focusable.indexOf(target);
    if (index === -1 || index >= focusable.length - 1) {
      target.blur();
      return;
    }

    const next = focusable[index + 1];
    next.focus();
    if (next instanceof HTMLInputElement) next.select();
  }

  const saveRef = useRef(handleSave);
  const busyRef = useRef(false);
  saveRef.current = handleSave;
  busyRef.current = saving || deleting;

  useEffect(() => {
    function handleKeyboard(event: KeyboardEvent) {
      if (!(
        (event.ctrlKey || event.metaKey) &&
        event.key.toLowerCase() === "s"
      ))
        return;
      event.preventDefault();
      if (!busyRef.current) saveRef.current();
    }

    window.addEventListener("keydown", handleKeyboard);
    return () => window.removeEventListener("keydown", handleKeyboard);
  }, []);

  function scrollTo(id: string) {
    document
      .getElementById(id)
      ?.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  const busy = saving || deleting;

  return (
    <>
      <style>{SIDEBAR_CSS}</style>
      <style>{PAGE_CSS}</style>

      {toast && (
        <div className={`toast ${toast.err ? "err" : ""}`}>{toast.msg}</div>
      )}

      {showPopup && (
        <ItemsPopup
          items={items}
          locations={locations}
          category1={category1}
          onSelect={handleSelect}
          onClose={() => setShowPopup(false)}
        />
      )}

      <div
        style={{
          display: "flex",
          height: "100vh",
          overflow: "hidden",
          background: "#c2d4d4",
        }}
      >
        <AdminSidebar
          active={navKey}
          onNav={handleNavigate}
          onLogout={handleLogout}
        />

        <div
          style={{
            flex: 1,
            display: "flex",
            flexDirection: "column",
            minWidth: 0,
            overflow: "hidden",
          }}
        >
          <header
            style={{
              background: "#dae6e6",
              height: 56,
              flexShrink: 0,
              display: "flex",
              alignItems: "center",
              padding: "0 18px",
              gap: 12,
              borderBottom: "1px solid rgba(0,0,0,0.06)",
              zIndex: 10,
            }}
          >
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <span style={{ fontSize: 15, fontWeight: 800, color: "#1e3a40" }}>
                Item Master
              </span>
              <span style={{ fontSize: 12, color: "#6b7280", fontWeight: 500 }}>
                {loading ? "…" : `${items.length} items`}
              </span>
            </div>
            <div style={{ flex: 1 }} />
            <button
              type="button"
              style={{
                background: "none",
                border: "none",
                cursor: "pointer",
                color: "#374151",
                display: "flex",
                alignItems: "center",
                padding: 4,
                borderRadius: 8,
              }}
            >
              <IBell />
            </button>
            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: 4,
                cursor: "pointer",
              }}
            >
              <span style={{ fontSize: 14, fontWeight: 500, color: "#1f2937" }}>
                MR. SAYO
              </span>
              <IChevD />
            </div>
            <div
              style={{
                width: 34,
                height: 34,
                borderRadius: "50%",
                background: "linear-gradient(135deg,#5a8a92,#3a6a72)",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                color: "#fff",
                fontWeight: 700,
                fontSize: 14,
                cursor: "pointer",
                flexShrink: 0,
              }}
            >
              S
            </div>
          </header>

          <div
            style={{
              flex: 1,
              overflow: "hidden",
              padding: "12px 14px",
              display: "flex",
              gap: 12,
              flexDirection: "column",
            }}
          >
            {recentItems.length > 0 && (
              <div style={{ flexShrink: 0 }}>
                <p
                  style={{
                    fontSize: 11,
                    fontWeight: 700,
                    color: "#6b7280",
                    textTransform: "uppercase",
                    letterSpacing: "0.07em",
                    marginBottom: 6,
                  }}
                >
                  Recently Added
                </p>
                <div className="recent-strip">
                  {recentItems.map((item) => (
                    <button
                      type="button"
                      key={`${item.locCode}|${item.itemCode}`}
                      className="recent-card"
                      onClick={() => handleSelect(item)}
                    >
                      <div
                        style={{
                          display: "flex",
                          alignItems: "center",
                          gap: 10,
                        }}
                      >
                        <div
                          style={{
                            width: 32,
                            height: 32,
                            borderRadius: 8,
                            background:
                              "linear-gradient(135deg,#1e3a40,#2a5260)",
                            display: "flex",
                            alignItems: "center",
                            justifyContent: "center",
                            color: "#fff",
                            flexShrink: 0,
                            overflow: "hidden",
                          }}
                        >
                          {item.itemPic ? (
                            <img
                              src={item.itemPic}
                              alt=""
                              style={{
                                width: "100%",
                                height: "100%",
                                objectFit: "cover",
                              }}
                            />
                          ) : (
                            <IBox s={15} />
                          )}
                        </div>
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <p
                            style={{
                              fontSize: 12,
                              fontWeight: 700,
                              color: "#1e3a40",
                              overflow: "hidden",
                              textOverflow: "ellipsis",
                              whiteSpace: "nowrap",
                            }}
                          >
                            {item.itemDes}
                          </p>
                          <p style={{ fontSize: 10, color: "#6b7280" }}>
                            {item.itemCode}
                          </p>
                        </div>
                      </div>
                      <div
                        style={{
                          display: "flex",
                          justifyContent: "space-between",
                          alignItems: "center",
                        }}
                      >
                        <TypeBadge it={item} />
                        <span
                          style={{
                            fontSize: 11,
                            fontWeight: 700,
                            color: "#1e3a40",
                          }}
                        >
                          LKR {item.retailPrice.toFixed(0)}
                        </span>
                      </div>
                    </button>
                  ))}
                </div>
              </div>
            )}

            <div
              style={{
                flex: 1,
                overflow: "hidden",
                display: "flex",
                flexDirection: "column",
                borderRadius: 14,
                boxShadow: "0 2px 12px rgba(30,58,64,0.1)",
              }}
            >
              <div
                style={{
                  background: "#1e3a40",
                  borderRadius: "14px 14px 0 0",
                  padding: "12px 18px 0",
                  flexShrink: 0,
                }}
              >
                <div
                  style={{
                    display: "flex",
                    alignItems: "flex-start",
                    justifyContent: "space-between",
                    gap: 12,
                    marginBottom: 4,
                  }}
                >
                  <div>
                    <p
                      style={{
                        color: "rgba(255,255,255,0.4)",
                        fontSize: 10,
                        fontWeight: 700,
                        letterSpacing: "0.1em",
                        textTransform: "uppercase",
                      }}
                    >
                      {isNew ? "New Item" : "Edit Item"} · Ctrl+S to save
                    </p>
                    <div
                      style={{
                        display: "flex",
                        alignItems: "center",
                        gap: 10,
                        marginTop: 2,
                      }}
                    >
                      <p
                        style={{ color: "#fff", fontSize: 17, fontWeight: 800 }}
                      >
                        ITEM MASTER DETAIL
                      </p>
                      {!isNew && <TypeBadge it={current} />}
                    </div>
                  </div>
                  <div style={{ display: "flex", gap: 8, paddingTop: 2 }}>
                    <button
                      type="button"
                      className="btn-new"
                      onClick={handleNew}
                      disabled={busy}
                    >
                      <IPlus s={13} /> New Item
                    </button>
                    <button
                      type="button"
                      className="btn-viewmore"
                      onClick={() => setShowPopup(true)}
                    >
                      <IGrid s={13} /> Browse
                    </button>
                  </div>
                </div>
                <div className="panel-tabs">
                  <button
                    type="button"
                    className={`panel-tab ${activeTab === "details" ? "active" : ""}`}
                    onClick={() => setActiveTab("details")}
                  >
                    <ITag s={13} /> Item Details
                  </button>
                  {hasRecipeRights && (
                    <button
                      type="button"
                      className={`panel-tab ${activeTab === "recipe" ? "active" : ""}`}
                      onClick={() => {
                        if (isNew) {
                          showToast("Save item first to manage recipe", true);
                          return;
                        }
                        setActiveTab("recipe");
                        loadRecipes(current.itemCode, primaryLocCode);
                      }}
                    >
                      <IFlask s={13} /> Recipe Management
                      {isNew && (
                        <span
                          style={{ fontSize: 9, opacity: 0.6, marginLeft: 2 }}
                        >
                          (save first)
                        </span>
                      )}
                    </button>
                  )}
                </div>
              </div>

              {activeTab === "details" && (
                <div className="quick-nav">
                  {SECTIONS.map((section) => (
                    <button
                      type="button"
                      key={section.id}
                      className="quick-nav-btn"
                      onClick={() => scrollTo(section.id)}
                    >
                      {section.icon}
                      {section.label}
                    </button>
                  ))}
                </div>
              )}

              <div
                ref={formRef}
                onKeyDown={handleFormKeyDown}
                style={{
                  flex: 1,
                  overflowY: "auto",
                  padding: "14px",
                  display: "flex",
                  flexDirection: "column",
                  gap: 14,
                  background: "#e8f0f1",
                }}
              >
                {loading && (
                  <div
                    style={{
                      display: "flex",
                      justifyContent: "center",
                      alignItems: "center",
                      flex: 1,
                    }}
                  >
                    <span
                      className="spinner dark"
                      style={{ width: 28, height: 28 }}
                    />
                  </div>
                )}

                {!loading && activeTab === "recipe" && !isNew && (
                  <div
                    className="fade-up"
                    style={{
                      display: "flex",
                      flexDirection: "column",
                      gap: 14,
                    }}
                  >
                    {!hasRecipeRights ? (
                      <div className="recipe-blocked">
                        <IBox s={36} />
                        <p
                          style={{
                            fontSize: 14,
                            fontWeight: 700,
                            color: "#6b7280",
                            marginTop: 12,
                          }}
                        >
                          Raw items do not have a recipe.
                        </p>
                        <p
                          style={{
                            fontSize: 12,
                            color: "#9ca3af",
                            marginTop: 4,
                          }}
                        >
                          Only <strong>Service Items</strong> and{" "}
                          <strong>Semi-Finished Products</strong> can have
                          recipes.
                        </p>
                      </div>
                    ) : (
                      <>
                        <div
                          style={{
                            background:
                              "linear-gradient(135deg,#1e3a40,#2a5260)",
                            borderRadius: 12,
                            padding: "16px 20px",
                            display: "flex",
                            alignItems: "flex-start",
                            gap: 16,
                            flexWrap: "wrap",
                          }}
                        >
                          <div style={{ flex: 1, minWidth: 200 }}>
                            <p
                              style={{
                                color: "rgba(255,255,255,0.5)",
                                fontSize: 10,
                                fontWeight: 700,
                                textTransform: "uppercase",
                                letterSpacing: "0.08em",
                              }}
                            >
                              Recipe For
                            </p>
                            <p
                              style={{
                                color: "#fff",
                                fontSize: 17,
                                fontWeight: 800,
                                marginTop: 3,
                              }}
                            >
                              {current.itemDes}
                            </p>
                            <div
                              style={{
                                display: "flex",
                                alignItems: "center",
                                gap: 8,
                                marginTop: 4,
                              }}
                            >
                              <TypeBadge it={current} />
                              <span
                                style={{
                                  color: "rgba(255,255,255,0.45)",
                                  fontSize: 11,
                                }}
                              >
                                {current.itemCode} · {recipeRows.length}{" "}
                                ingredient{recipeRows.length !== 1 ? "s" : ""}
                              </span>
                            </div>
                            <p
                              style={{
                                color: "rgba(255,211,100,0.8)",
                                fontSize: 10,
                                fontWeight: 600,
                                marginTop: 6,
                              }}
                            >
                              {currentType === "service"
                                ? "✦ Can use Semi-Finished + Raw items as ingredients"
                                : "✦ Can use Raw items only as ingredients"}
                            </p>
                          </div>
                          <div
                            style={{
                              display: "flex",
                              flexDirection: "column",
                              gap: 8,
                              alignItems: "flex-end",
                            }}
                          >
                            <p
                              style={{
                                color: "rgba(255,255,255,0.5)",
                                fontSize: 10,
                                fontWeight: 700,
                                textTransform: "uppercase",
                                letterSpacing: "0.06em",
                              }}
                            >
                              Apply to Locations
                            </p>
                            <div
                              style={{
                                display: "flex",
                                flexWrap: "wrap",
                                gap: 7,
                                justifyContent: "flex-end",
                              }}
                            >
                              {locations.map((location) => {
                                const checked = recipeLocCodes.includes(
                                  location.code,
                                );
                                return (
                                  <button
                                    type="button"
                                    key={location.code}
                                    onClick={() =>
                                      setRecipeLocCodes((previous) =>
                                        checked
                                          ? previous.filter(
                                              (code) => code !== location.code,
                                            )
                                          : [...previous, location.code],
                                      )
                                    }
                                    style={{
                                      display: "inline-flex",
                                      alignItems: "center",
                                      gap: 6,
                                      padding: "5px 13px",
                                      borderRadius: 20,
                                      cursor: "pointer",
                                      fontFamily: "'Inter',sans-serif",
                                      border: `1.5px solid ${checked ? "#7dd3c8" : "rgba(255,255,255,0.2)"}`,
                                      background: checked
                                        ? "rgba(125,211,200,0.2)"
                                        : "rgba(255,255,255,0.07)",
                                      color: checked
                                        ? "#7dd3c8"
                                        : "rgba(255,255,255,0.55)",
                                      fontSize: 12,
                                      fontWeight: 700,
                                      transition: "all 0.15s",
                                    }}
                                  >
                                    <div
                                      style={{
                                        width: 14,
                                        height: 14,
                                        borderRadius: 3,
                                        flexShrink: 0,
                                        border: `2px solid ${checked ? "#7dd3c8" : "rgba(255,255,255,0.3)"}`,
                                        background: checked
                                          ? "#7dd3c8"
                                          : "transparent",
                                        display: "flex",
                                        alignItems: "center",
                                        justifyContent: "center",
                                      }}
                                    >
                                      {checked && (
                                        <span
                                          style={{
                                            color: "#1e3a40",
                                            fontSize: 11,
                                          }}
                                        >
                                          ✓
                                        </span>
                                      )}
                                    </div>
                                    {location.code} – {location.name}
                                  </button>
                                );
                              })}
                            </div>
                            {recipeLocCodes.length > 1 && (
                              <p
                                style={{
                                  color: "rgba(255,211,100,0.85)",
                                  fontSize: 10,
                                  fontWeight: 600,
                                }}
                              >
                                ⚠ Recipe will be saved to{" "}
                                {recipeLocCodes.length} locations
                              </p>
                            )}
                          </div>
                        </div>
                        <Card
                          title="Recipe Ingredients"
                          icon={<IFlask s={14} />}
                        >
                          <RecipeGrid
                            rows={recipeRows}
                            allowedItems={ingredientItems}
                            subUnits={subUnits}
                            onChange={setRecipeRows}
                            menuItmID={current.itemCode}
                            defaultLocCode={primaryLocCode}
                          />
                        </Card>
                      </>
                    )}
                  </div>
                )}

                {!loading && activeTab === "details" && (
                  <div
                    className="fade-up"
                    style={{
                      display: "flex",
                      flexDirection: "column",
                      gap: 14,
                    }}
                  >
                    <Card
                      id="sec-ident"
                      title="Item Identification"
                      icon={<ITag s={13} />}
                    >
                      <div
                        style={{
                          display: "grid",
                          gridTemplateColumns: "1fr 2fr",
                          gap: 12,
                          marginBottom: 12,
                        }}
                      >
                        <FieldRow label="Item Code *">
                          <ItemCodeInput
                            value={current.itemCode}
                            allItems={items}
                            isNew={isNew}
                            onSelect={handleItemCodeSelect}
                            onChange={(value) => updateItem("itemCode", value)}
                          />
                        </FieldRow>
                        <FieldRow label="Item Description *" htmlFor="itm-des">
                          <input
                            id="itm-des"
                            className="frm-input"
                            value={current.itemDes}
                            onChange={(event) =>
                              updateItem("itemDes", event.target.value)
                            }
                            placeholder="e.g. Shampoo & Conditioner"
                            maxLength={50}
                          />
                        </FieldRow>
                      </div>
                      <div
                        style={{
                          display: "grid",
                          gridTemplateColumns: "2fr 1fr 1fr",
                          gap: 12,
                        }}
                      >
                        <FieldRow
                          label="Print Description"
                          htmlFor="itm-printdes"
                        >
                          <input
                            id="itm-printdes"
                            className="frm-input"
                            value={current.itemPrintDes}
                            onChange={(event) =>
                              updateItem("itemPrintDes", event.target.value)
                            }
                            maxLength={50}
                          />
                        </FieldRow>
                        <FieldRow label="Master Unit" htmlFor="itm-unit">
                          <select
                            id="itm-unit"
                            className="frm-select"
                            value={current.masterUnitID}
                            onChange={(event) =>
                              updateItem("masterUnitID", event.target.value)
                            }
                          >
                            {units.map((unit) => (
                              <option key={unit.id} value={unit.id}>
                                {unit.des}
                              </option>
                            ))}
                          </select>
                        </FieldRow>
                        <FieldRow label="Supplier" htmlFor="itm-sup">
                          <select
                            id="itm-sup"
                            className="frm-select"
                            value={current.supID}
                            onChange={(event) =>
                              updateItem("supID", event.target.value)
                            }
                          >
                            <option value="">-- Select --</option>
                            {suppliers.map((supplier) => (
                              <option key={supplier.id} value={supplier.id}>
                                {supplier.name}
                              </option>
                            ))}
                          </select>
                        </FieldRow>
                      </div>
                    </Card>

                    <Card
                      id="sec-categories"
                      title="Item Categories"
                      icon={<IArchive s={13} />}
                    >
                      <div
                        style={{
                          display: "grid",
                          gridTemplateColumns: "1fr 1fr 1fr 1fr",
                          gap: 12,
                        }}
                      >
                        {(
                          [
                            {
                              label: "Main Category",
                              id: "itm-cat1",
                              val: current.category1,
                              list: category1,
                              key: "category1" as const,
                            },
                            {
                              label: "Sub Category 1",
                              id: "itm-cat2",
                              val: current.category2,
                              list: category2,
                              key: "category2" as const,
                            },
                            {
                              label: "Sub Category 2",
                              id: "itm-cat3",
                              val: current.category3,
                              list: category3,
                              key: "category3" as const,
                            },
                            {
                              label: "Sub Category 3",
                              id: "itm-cat4",
                              val: current.category4,
                              list: category4,
                              key: "category4" as const,
                            },
                          ] as const
                        ).map((category) => (
                          <FieldRow
                            key={category.key}
                            label={category.label}
                            htmlFor={category.id}
                          >
                            <select
                              id={category.id}
                              className="frm-select"
                              value={category.val}
                              onChange={(event) =>
                                updateItem(category.key, event.target.value)
                              }
                            >
                              <option value="">-- Select --</option>
                              {category.list.map((option) => (
                                <option key={option.code} value={option.code}>
                                  {option.des}
                                </option>
                              ))}
                            </select>
                          </FieldRow>
                        ))}
                      </div>
                    </Card>

                    <FlagsCard item={current} onChange={updateItem} />

                    {isNew && hasRecipeRights && (
                      <div
                        style={{
                          background: "linear-gradient(135deg,#ede9fe,#f5f3ff)",
                          border: "1.5px solid #c4b5fd",
                          borderRadius: 10,
                          padding: "12px 16px",
                          display: "flex",
                          alignItems: "center",
                          gap: 10,
                        }}
                      >
                        <IZap s={16} />
                        <div>
                          <p
                            style={{
                              fontSize: 12,
                              fontWeight: 700,
                              color: "#7c3aed",
                            }}
                          >
                            {currentType === "service"
                              ? "Service Item"
                              : "Semi-Finished Product"}{" "}
                            — Recipe Available
                          </p>
                          <p
                            style={{
                              fontSize: 11,
                              color: "#6b7280",
                              marginTop: 2,
                            }}
                          >
                            Save this item first, then use the{" "}
                            <strong>Recipe Management</strong> tab to add
                            ingredients.
                          </p>
                        </div>
                      </div>
                    )}

                    <Card
                      id="sec-cost"
                      title="Cost & Margin"
                      icon={<IDollar s={13} />}
                    >
                      <div
                        style={{
                          display: "grid",
                          gridTemplateColumns: "1fr 1fr 1fr 1fr 1fr",
                          gap: 12,
                        }}
                      >
                        <FieldRow label="Raw Cost" htmlFor="itm-rawcost">
                          <input
                            id="itm-rawcost"
                            className="frm-input"
                            type="number"
                            value={current.rawCost}
                            onChange={(event) =>
                              updateItem("rawCost", Number(event.target.value))
                            }
                            min={0}
                          />
                        </FieldRow>
                        <FieldRow label="Cost Markup %">
                          <input
                            className="frm-input"
                            type="number"
                            value={current.costMarkup}
                            onChange={(event) =>
                              updateItem(
                                "costMarkup",
                                Number(event.target.value),
                              )
                            }
                            min={0}
                          />
                        </FieldRow>
                        <FieldRow label="Overall Cost (Auto)">
                          <input
                            className="frm-input"
                            value={overallCost.toFixed(2)}
                            readOnly
                            style={{
                              background: "#f0fdf4",
                              color: "#15803d",
                              fontWeight: 700,
                            }}
                          />
                        </FieldRow>
                        <FieldRow label="Sales Margin %">
                          <input
                            className="frm-input"
                            type="number"
                            value={current.salesMargin}
                            onChange={(event) =>
                              updateItem(
                                "salesMargin",
                                Number(event.target.value),
                              )
                            }
                            min={0}
                          />
                        </FieldRow>
                        <FieldRow label="Retail Price">
                          <input
                            className="frm-input"
                            type="number"
                            value={current.retailPrice}
                            onChange={(event) =>
                              updateItem(
                                "retailPrice",
                                Number(event.target.value),
                              )
                            }
                            min={0}
                          />
                        </FieldRow>
                        <FieldRow label="Duration (Minutes)">
                          <input
                            className="frm-input"
                            type="number"
                            value={current.durationMin}
                            onChange={(event) =>
                              updateItem(
                                "durationMin",
                                Number(event.target.value),
                              )
                            }
                            min={5}
                            step={5}
                          />
                        </FieldRow>
                      </div>
                      <div
                        style={{
                          marginTop: 12,
                          background: "linear-gradient(135deg,#1e3a40,#2a5260)",
                          borderRadius: 10,
                          padding: "10px 16px",
                          display: "grid",
                          gridTemplateColumns: "1fr 1fr 1fr",
                          gap: 12,
                        }}
                      >
                        {[
                          {
                            label: "Raw Cost",
                            value: `LKR ${current.rawCost.toLocaleString()}`,
                          },
                          {
                            label: "Overall Cost",
                            value: `LKR ${overallCost.toFixed(2)}`,
                          },
                          {
                            label: "Retail Price",
                            value: `LKR ${current.retailPrice.toLocaleString()}`,
                          },
                        ].map((summary) => (
                          <div key={summary.label}>
                            <p
                              style={{
                                color: "rgba(255,255,255,0.45)",
                                fontSize: 9.5,
                                fontWeight: 700,
                                textTransform: "uppercase",
                                letterSpacing: "0.06em",
                              }}
                            >
                              {summary.label}
                            </p>
                            <p
                              style={{
                                color: "#fff",
                                fontSize: 15,
                                fontWeight: 800,
                                marginTop: 3,
                              }}
                            >
                              {summary.value}
                            </p>
                          </div>
                        ))}
                      </div>
                    </Card>

                    <Card
                      id="sec-reorder"
                      title="Reorder Levels & Stock Limits"
                      icon={<ILayers s={13} />}
                    >
                      <div
                        style={{
                          display: "grid",
                          gridTemplateColumns: "1fr 1fr 1fr 1fr",
                          gap: 12,
                        }}
                      >
                        {(
                          [
                            {
                              label: "Reorder Level (ROL)",
                              id: "itm-rol",
                              key: "rol",
                            },
                            {
                              label: "Reorder Qty (ROQ)",
                              id: "itm-roq",
                              key: "roq",
                            },
                            {
                              label: "Min Qty",
                              id: "itm-minqty",
                              key: "minQty",
                            },
                            {
                              label: "Max Qty",
                              id: "itm-maxqty",
                              key: "maxQty",
                            },
                          ] as { label: string; id: string; key: keyof Item }[]
                        ).map((field) => (
                          <FieldRow
                            key={field.key as string}
                            label={field.label}
                            htmlFor={field.id}
                          >
                            <input
                              id={field.id}
                              className="frm-input"
                              type="number"
                              min={0}
                              value={current[field.key] as number}
                              onChange={(event) =>
                                updateItem(
                                  field.key,
                                  Number(
                                    event.target.value,
                                  ) as Item[typeof field.key],
                                )
                              }
                            />
                          </FieldRow>
                        ))}
                      </div>
                      <div
                        style={{
                          marginTop: 10,
                          background: "#fffbeb",
                          border: "1.5px solid #fde68a",
                          borderRadius: 8,
                          padding: "8px 12px",
                          display: "flex",
                          alignItems: "center",
                          gap: 8,
                        }}
                      >
                        <span style={{ fontSize: 15 }}>💡</span>
                        <span
                          style={{
                            fontSize: 12,
                            color: "#92400e",
                            fontWeight: 500,
                          }}
                        >
                          Stock is sourced from <strong>tbl_itemdetail</strong>{" "}
                          per location — shown read-only in Location Details.
                        </span>
                      </div>
                    </Card>

                    <Card
                      id="sec-locations"
                      title="Location Details"
                      icon={<IMapPin s={13} />}
                      badge={`${current.locationDetails.length} locations`}
                    >
                      <p
                        style={{
                          fontSize: 12,
                          color: "#6b7280",
                          marginBottom: 10,
                        }}
                      >
                        All active locations. Enable/disable per location, set
                        pricing & margins. Stock is read-only.
                      </p>
                      <LocationGrid
                        rows={current.locationDetails}
                        onChange={updateLocationDetails}
                        onError={(message) => showToast(message, true)}
                      />
                      {current.locationDetails.length > 0 && (
                        <div
                          style={{
                            display: "grid",
                            gridTemplateColumns:
                              "repeat(auto-fill,minmax(180px,1fr))",
                            gap: 10,
                            marginTop: 12,
                          }}
                        >
                          {current.locationDetails.map((location) => (
                            <div
                              key={location.locCode}
                              style={{
                                background: "#fff",
                                borderRadius: 10,
                                border: `1.5px solid ${location.enable ? "#bbf7d0" : "#fecaca"}`,
                                padding: "10px 12px",
                              }}
                            >
                              <div
                                style={{
                                  display: "flex",
                                  alignItems: "center",
                                  justifyContent: "space-between",
                                  marginBottom: 6,
                                }}
                              >
                                <span
                                  style={{
                                    fontSize: 13,
                                    fontWeight: 700,
                                    color: "#1e3a40",
                                  }}
                                >
                                  {location.locCode}
                                </span>
                                <span
                                  className={
                                    location.enable
                                      ? "badge-active"
                                      : "badge-inactive"
                                  }
                                >
                                  {location.enable ? "Active" : "Inactive"}
                                </span>
                              </div>
                              <p
                                style={{
                                  fontSize: 11,
                                  color: "#6b7280",
                                  marginBottom: 6,
                                }}
                              >
                                {location.locName}
                              </p>
                              {[
                                {
                                  label: "Stock",
                                  value: location.locStockBalance.toFixed(2),
                                },
                                {
                                  label: "Margin",
                                  value: `${location.salesMargin}%`,
                                },
                                {
                                  label: "Retail",
                                  value: `LKR ${location.retailPrice.toFixed(2)}`,
                                },
                                {
                                  label: "WS Price",
                                  value: `LKR ${location.wsPrice.toFixed(2)}`,
                                },
                              ].map((summary) => (
                                <div
                                  key={summary.label}
                                  style={{
                                    display: "flex",
                                    justifyContent: "space-between",
                                    marginBottom: 2,
                                  }}
                                >
                                  <span
                                    style={{ fontSize: 11, color: "#9ca3af" }}
                                  >
                                    {summary.label}
                                  </span>
                                  <span
                                    style={{
                                      fontSize: 11,
                                      fontWeight: 600,
                                      color: "#1f2937",
                                    }}
                                  >
                                    {summary.value}
                                  </span>
                                </div>
                              ))}
                            </div>
                          ))}
                        </div>
                      )}
                    </Card>

                    <Card
                      id="sec-image"
                      title="Item Image"
                      icon={<IImage s={13} />}
                    >
                      <div
                        style={{
                          display: "flex",
                          alignItems: "center",
                          gap: 18,
                        }}
                      >
                        <div
                          style={{
                            width: 96,
                            height: 96,
                            borderRadius: 12,
                            background: current.itemPic
                              ? "transparent"
                              : "#f3f6f6",
                            border: "2px dashed #d1d9da",
                            display: "flex",
                            alignItems: "center",
                            justifyContent: "center",
                            overflow: "hidden",
                            flexShrink: 0,
                          }}
                        >
                          {current.itemPic ? (
                            <img
                              src={current.itemPic}
                              alt="item"
                              style={{
                                width: "100%",
                                height: "100%",
                                objectFit: "cover",
                              }}
                            />
                          ) : (
                            <div
                              style={{ textAlign: "center", color: "#9ca3af" }}
                            >
                              <IBox s={26} />
                              <p
                                style={{
                                  fontSize: 10,
                                  marginTop: 4,
                                  fontWeight: 600,
                                }}
                              >
                                No Image
                              </p>
                            </div>
                          )}
                        </div>
                        <div
                          style={{
                            display: "flex",
                            flexDirection: "column",
                            gap: 10,
                          }}
                        >
                          <input
                            ref={fileInputRef}
                            type="file"
                            accept="image/*"
                            style={{ display: "none" }}
                            onChange={handlePictureChange}
                          />
                          <button
                            type="button"
                            className="btn-clear"
                            onClick={() => fileInputRef.current?.click()}
                          >
                            <IImage s={14} /> Upload
                          </button>
                          {current.itemPic && (
                            <button
                              type="button"
                              className="btn-del"
                              onClick={() => updateItem("itemPic", null)}
                            >
                              <ITrash s={13} /> Remove
                            </button>
                          )}
                          <p
                            style={{
                              fontSize: 11,
                              color: "#9ca3af",
                              maxWidth: 200,
                            }}
                          >
                            JPG, PNG, GIF, WebP. 400×400px recommended.
                          </p>
                        </div>
                      </div>
                    </Card>
                  </div>
                )}
              </div>

              <div
                style={{
                  background: "#dce8e8",
                  borderTop: "1.5px solid rgba(30,58,64,0.12)",
                  padding: "12px 16px",
                  display: "flex",
                  gap: 10,
                  flexShrink: 0,
                  flexWrap: "wrap",
                  alignItems: "center",
                  borderRadius: "0 0 14px 14px",
                }}
              >
                <button
                  type="button"
                  className="btn-clear"
                  onClick={handleClear}
                  disabled={busy}
                >
                  <IRefresh s={14} /> Reset
                </button>
                <button
                  type="button"
                  className="btn-print"
                  onClick={() => window.print()}
                  disabled={busy}
                >
                  <IPrint s={14} /> Print
                </button>
                <div style={{ flex: 1 }} />
                {!isNew && (
                  <button
                    type="button"
                    className="btn-del"
                    onClick={handleDelete}
                    disabled={busy}
                  >
                    {deleting ? (
                      <>
                        <span
                          className="spinner"
                          style={{
                            borderTopColor: "#dc2626",
                            borderColor: "rgba(220,38,38,0.2)",
                          }}
                        />{" "}
                        Deleting…
                      </>
                    ) : (
                      <>
                        <ITrash s={14} /> Delete
                      </>
                    )}
                  </button>
                )}
                {activeTab === "details" && (
                  <button
                    type="button"
                    className="btn-save"
                    onClick={handleSave}
                    disabled={busy}
                  >
                    {saving ? (
                      <>
                        <span className="spinner" /> Saving…
                      </>
                    ) : (
                      <>
                        <ISave s={14} /> {isNew ? "Create Item" : "Save Item"}
                      </>
                    )}
                  </button>
                )}
                {activeTab === "recipe" && !isNew && hasRecipeRights && (
                  <button
                    type="button"
                    className="btn-save"
                    onClick={handleSaveRecipes}
                    disabled={recipeSaving}
                  >
                    {recipeSaving ? (
                      <>
                        <span className="spinner" /> Saving…
                      </>
                    ) : (
                      <>
                        <ISave s={14} /> Save Recipe
                      </>
                    )}
                  </button>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
