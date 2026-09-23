'use client';
import React, { useEffect, useRef, useState } from 'react';
import FloatingPanel from './FloatingPanel';

export interface SuggestedItem {
  code: string;
  locCode: string;
  des: string;
  masterUnitID: string;
  retailPrice: number;
  costPrice: number;
  serviceItem: boolean;
}

interface Props {
  locCode: string;
  value: string;
  disabled?: boolean;
  placeholder?: string;
  onText: (text: string) => void;
  onPick: (item: SuggestedItem) => void;
}

const SUGGEST_CSS = `
  .si-wrap { position:relative; }
  .si-input {
    width:100%; height:30px; padding:0 8px; font-size:12px; font-family:inherit;
    border:1px solid rgba(30,58,64,0.18); border-radius:6px; background:#fff; color:#1f2937;
  }
  .si-input:focus { outline:none; border-color:#1e3a40; box-shadow:0 0 0 2px rgba(30,58,64,0.10); }
  .si-input:disabled { background:#eef2f2; color:#9ca3af; }
  .si-pop {
    background:#fff; border:1px solid rgba(30,58,64,0.16); border-radius:9px;
    box-shadow:0 12px 34px rgba(15,40,45,0.20); overflow:auto; padding:3px;
  }
  .si-item { display:flex; align-items:center; gap:7px; padding:6px 7px; border-radius:6px; cursor:pointer; }
  .si-item:hover, .si-item.active { background:rgba(30,58,64,0.08); }
  .si-code { font-size:10px; font-weight:700; color:#1e3a40; background:rgba(30,58,64,0.08); border-radius:5px; padding:2px 5px; flex-shrink:0; }
  .si-des { flex:1; min-width:0; font-size:12px; color:#1f2937; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
  .si-price { font-size:11px; font-weight:700; color:#1e3a40; flex-shrink:0; }
  .si-empty { padding:8px 10px; font-size:11.5px; color:#9ca3af; }
`;

export default function ItemSuggestInput({
  locCode,
  value,
  disabled,
  placeholder,
  onText,
  onPick,
}: Props) {
  const anchorRef = useRef<HTMLDivElement | null>(null);
  const [options, setOptions] = useState<SuggestedItem[]>([]);
  const [searching, setSearching] = useState(false);
  const [open, setOpen] = useState(false);
  const [index, setIndex] = useState(-1);

  const query = (value || '').trim();

  useEffect(() => {
    // Two characters minimum — one letter would return half the item master.
    if (query.length < 2 || disabled) {
      setOptions([]);
      setSearching(false);
      return;
    }
    let active = true;
    setSearching(true);
    const timer = setTimeout(() => {
      const params = new URLSearchParams({ q: query, limit: '15' });
      if (locCode) params.set('locCode', locCode);
      fetch(`/api/items/search?${params.toString()}`, { cache: 'no-store' })
        .then((r) => r.json())
        .then((json) => {
          if (!active) return;
          setOptions(Array.isArray(json?.items) ? (json.items as SuggestedItem[]) : []);
        })
        .catch(() => { if (active) setOptions([]); })
        .finally(() => { if (active) setSearching(false); });
    }, 250);
    return () => { active = false; clearTimeout(timer); };
  }, [query, locCode, disabled]);

  function pick(item: SuggestedItem) {
    onPick(item);
    setOptions([]);
    setOpen(false);
    setIndex(-1);
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (!open || options.length === 0) {
      if (e.key === 'ArrowDown' && options.length > 0) { setOpen(true); setIndex(0); }
      return;
    }
    if (e.key === 'ArrowDown') { e.preventDefault(); setIndex((i) => Math.min(i + 1, options.length - 1)); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setIndex((i) => Math.max(i - 1, 0)); }
    else if (e.key === 'Enter' && index >= 0) { e.preventDefault(); pick(options[index]); }
    else if (e.key === 'Escape') { setOpen(false); setIndex(-1); }
  }

  const show = open && !disabled && query.length >= 2;

  return (
    <>
      <style>{SUGGEST_CSS}</style>
      <div className="si-wrap" ref={anchorRef}>
        <input
          className="si-input"
          value={value}
          disabled={disabled}
          placeholder={placeholder ?? 'Item name…'}
          onChange={(e) => { onText(e.target.value); setOpen(true); setIndex(-1); }}
          onFocus={() => { if (options.length) setOpen(true); }}
          onBlur={() => setTimeout(() => setOpen(false), 140)}
          onKeyDown={handleKeyDown}
          autoComplete="off"
        />
      </div>

      <FloatingPanel anchorRef={anchorRef} open={show} className="si-pop" preferredHeight={260}>
        {searching && options.length === 0 ? (
          <div className="si-empty">Searching the item master…</div>
        ) : options.length === 0 ? (
          <div className="si-empty">No item matched “{query}” at this location</div>
        ) : (
          options.map((option, i) => (
            <div
              key={`${option.code}-${i}`}
              className={`si-item${i === index ? ' active' : ''}`}
              onMouseDown={(e) => { e.preventDefault(); pick(option); }}
              onMouseEnter={() => setIndex(i)}
            >
              <span className="si-code">{option.code}</span>
              <span className="si-des">{option.des}</span>
              <span className="si-price">
                {Number(option.costPrice || 0).toLocaleString('en-LK', { minimumFractionDigits: 2 })}
              </span>
            </div>
          ))
        )}
      </FloatingPanel>
    </>
  );
}
