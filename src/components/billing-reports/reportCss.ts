export const REPORT_CSS = `
  @import url('https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700;800&display=swap');
  .br-root, .br-root * { box-sizing: border-box; }
  .br-root { font-family: Inter, sans-serif; color: #1f2937; }

  .br-toolbar {
    background: #fff;
    border-bottom: 1px solid #e2e8f0;
    padding: 14px 22px 12px;
    display: flex;
    flex-direction: column;
    gap: 11px;
    flex-shrink: 0;
  }
  .br-t-row { display: flex; align-items: center; gap: 10px; flex-wrap: wrap; }
  .br-ico-sq {
    width: 38px; height: 38px; border-radius: 10px; flex-shrink: 0;
    background: linear-gradient(135deg, #1e3a40, #2a5260);
    display: flex; align-items: center; justify-content: center; color: #fff;
  }
  .br-title { font-size: 15.5px; font-weight: 800; color: #1e3a40; line-height: 1.2; }
  .br-sub { font-size: 11.5px; color: #64748b; margin-top: 2px; font-weight: 500; }
  .br-pdf {
    height: 36px; padding: 0 14px; border: none; border-radius: 9px; cursor: pointer;
    background: linear-gradient(135deg, #166534, #15803d); color: #fff;
    font-family: Inter, sans-serif; font-size: 12.5px; font-weight: 700;
  }
  .br-pdf:disabled { opacity: .65; cursor: wait; }
  @media (max-width: 767px) {
    .br-table { display: block; overflow-x: auto; -webkit-overflow-scrolling: touch; max-width: 100%; }
    .br-t-row { gap: 8px; }
    .br-search { min-width: 140px; flex: 1 1 140px; }
    .br-filter { max-width: 160px; }
  }
  .br-search {
    height: 36px; max-width: 300px; min-width: 180px; flex: 1 1 210px;
    padding: 0 12px 0 34px; border: 1.5px solid #c8d6d8; border-radius: 9px;
    font-family: Inter, sans-serif; font-size: 13px; outline: none; background: #fff;
  }
  .br-search:focus { border-color: #1e3a40; box-shadow: 0 0 0 3px rgba(30,58,64,.08); }
  .br-dates {
    display: flex; align-items: center; gap: 8px; height: 36px;
    padding: 0 10px; border: 1.5px solid #c8d6d8; border-radius: 9px; background: #fff;
  }
  .br-dates input[type=date] {
    border: none; outline: none; font-family: Inter, sans-serif; font-size: 12.5px; color: #1e3a40; background: transparent;
  }
  .br-filter {
    height: 36px; max-width: 220px; min-width: 140px;
    padding: 0 8px; border: 1.5px solid #c8d6d8; border-radius: 9px;
    font-family: Inter, sans-serif; font-size: 12.5px; color: #1e3a40; background: #fff; outline: none;
  }
  .br-filter:focus { border-color: #1e3a40; box-shadow: 0 0 0 3px rgba(30,58,64,.08); }
  .br-zoom {
    display: flex; align-items: center; height: 36px; border: 1.5px solid #c8d6d8; border-radius: 9px; overflow: hidden; background: #fff;
  }
  .br-zoom button {
    width: 32px; height: 36px; border: none; background: #f8fafc; cursor: pointer; color: #1e3a40; font-size: 16px; font-weight: 700;
  }
  .br-zoom span { min-width: 48px; text-align: center; font-size: 12px; font-weight: 700; color: #374151; }
  .br-iconbtn {
    width: 36px; height: 36px; border: 1.5px solid #c8d6d8; border-radius: 9px; background: #fff;
    cursor: pointer; display: flex; align-items: center; justify-content: center; color: #1e3a40;
  }
  .br-iconbtn.active { background: #1e3a40; color: #fff; border-color: #1e3a40; }
  .br-chip {
    height: 28px; padding: 0 10px; border-radius: 99px; border: 1.5px solid #c8d6d8;
    background: #fff; color: #475569; font-family: Inter, sans-serif; font-size: 11.5px; font-weight: 600; cursor: pointer;
  }
  .br-chip.active {
    background: linear-gradient(135deg, #166534, #15803d); color: #fff; border-color: transparent;
  }

  .br-share {
    position: absolute; right: 0; top: 42px; min-width: 224px; background: #fff; border-radius: 12px;
    box-shadow: 0 12px 40px rgba(15,23,42,.18); border: 1px solid #e2e8f0; padding: 6px; z-index: 40;
  }
  .br-share button {
    width: 100%; display: flex; align-items: center; gap: 10px; padding: 9px 10px; border: none; background: transparent;
    cursor: pointer; border-radius: 8px; font-family: Inter, sans-serif; font-size: 12.5px; font-weight: 600; color: #1e3a40; text-align: left;
  }
  .br-share button:hover { background: #f1f5f9; }
  .br-share .tile {
    width: 26px; height: 26px; border-radius: 7px; display: flex; align-items: center; justify-content: center; flex-shrink: 0;
  }

  .br-modal-bg {
    position: fixed; inset: 0; background: rgba(15,23,42,.55); z-index: 80;
    display: flex; align-items: center; justify-content: center; padding: 16px;
  }
  .br-modal {
    width: 100%; max-width: 400px; background: #fff; border-radius: 14px;
    box-shadow: 0 24px 60px rgba(0,0,0,.25); padding: 18px 18px 16px;
    animation: brPop .18s cubic-bezier(.34,1.56,.64,1);
  }
  @keyframes brPop { from { opacity: 0; transform: scale(.96); } to { opacity: 1; transform: none; } }
  .br-modal h2 { font-size: 11px; font-weight: 800; letter-spacing: .08em; text-transform: uppercase; color: #64748b; }
  .br-modal .rep { font-size: 16px; font-weight: 800; color: #1e3a40; margin: 4px 0 14px; }
  .br-x {
    width: 30px; height: 30px; border-radius: 50%; border: 1px solid #e2e8f0; background: #fff;
    cursor: pointer; font-size: 16px; color: #64748b;
  }
  .br-field { display: flex; flex-direction: column; gap: 5px; font-size: 12px; font-weight: 600; color: #475569; }
  .br-field input, .br-field select {
    height: 38px; border: 1.5px solid #c8d6d8; border-radius: 9px; padding: 0 10px;
    font-family: Inter, sans-serif; font-size: 13px; color: #1e3a40; background: #fff;
  }
  .br-view {
    height: 38px; padding: 0 16px; border: none; border-radius: 9px; cursor: pointer;
    background: linear-gradient(135deg, #166534, #15803d); color: #fff;
    font-family: Inter, sans-serif; font-size: 13px; font-weight: 700;
  }
  .br-cancel {
    height: 38px; padding: 0 14px; border: 1.5px solid #c8d6d8; border-radius: 9px; background: #fff;
    cursor: pointer; font-family: Inter, sans-serif; font-size: 13px; font-weight: 600; color: #374151;
  }

  .br-load { display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 12px; padding: 60px 20px; color: #64748b; }
  .br-spin { width: 28px; height: 28px; border: 3px solid #d1d5db; border-top-color: #1e3a40; border-radius: 50%; animation: brSpin .8s linear infinite; }
  @keyframes brSpin { to { transform: rotate(360deg); } }
  .br-err { background: #fef2f2; border: 1px solid #fecaca; color: #b91c1c; font-size: 13px; border-radius: 10px; padding: 12px 14px; }
  .br-empty { padding: 30px; text-align: center; color: #64748b; font-size: 13px; }

  .br-loc {
    display: flex; align-items: center; justify-content: space-between; gap: 10px;
    background: #1e3a40; color: #fff; padding: 8px 12px; border-radius: 8px; font-size: 12px; font-weight: 700;
  }
  .br-loc.purple { background: linear-gradient(135deg, #1e3a40, #3d5c63); }
  .br-dateband {
    display: flex; align-items: center; justify-content: space-between;
    background: #e8f0f1; color: #1e3a40; padding: 7px 12px; border-radius: 8px; font-size: 12px; font-weight: 700;
  }
  .br-catband {
    display: flex; align-items: center; justify-content: space-between;
    background: #dcfce7; color: #14532d; padding: 7px 12px; border-radius: 6px; font-size: 11.5px; font-weight: 800; text-transform: uppercase;
  }
  .br-grand {
    display: flex; align-items: center; justify-content: space-between; gap: 10px;
    background: #15803d; color: #fff; padding: 10px 14px; border-radius: 10px; font-size: 13px; font-weight: 800; margin-top: 8px;
  }
  .br-grand.navy { background: linear-gradient(135deg, #1e3a40, #0f172a); }
  .br-table { width: 100%; border-collapse: collapse; font-size: 11.5px; }
  .br-table th {
    background: #dcfce7; color: #14532d; font-size: 10px; font-weight: 800; letter-spacing: .04em;
    text-transform: uppercase; text-align: left; padding: 5px 10px;
  }
  .br-table td { padding: 5px 10px; border-bottom: 1px solid #eef2f6; }
  .br-table tr:nth-child(even) td { background: #f8fafc; }
  .br-table .num { text-align: right; font-variant-numeric: tabular-nums; }
  .br-table .tot td { background: #f0fdf4 !important; font-weight: 800; color: #14532d; }
  .br-pill {
    display: inline-flex; align-items: center; padding: 2px 8px; border-radius: 99px;
    background: rgba(30,58,64,.08); color: #1e3a40; font-size: 10px; font-weight: 700; text-transform: uppercase; letter-spacing: .04em;
  }
  .br-card { background: #fff; border: 1px solid #e2e8f0; border-radius: 12px; padding: 12px; }
  .br-live { display: inline-flex; align-items: center; gap: 5px; color: #15803d; font-size: 11px; font-weight: 700; }
  .br-live i { width: 6px; height: 6px; border-radius: 50%; background: #22c55e; display: inline-block; }

  .br-acc {
    background: #fff; border: 1px solid #c8d6d8; border-radius: 12px; overflow: hidden;
  }
  .br-acc + .br-acc { margin-top: 8px; }
  .br-acc-h {
    width: 100%; display: flex; align-items: center; justify-content: space-between; gap: 10px;
    padding: 12px 14px; border: none; background: #f0fdf4; cursor: pointer; text-align: left;
    font-family: Inter, sans-serif;
  }
  .br-acc-h:hover { background: #dcfce7; }
  .br-acc-h strong { font-size: 13.5px; font-weight: 800; color: #14532d; }
  .br-acc-h span.hint { font-size: 12px; color: #6b7280; font-weight: 500; }
  .br-acc-leaf {
    width: 100%; display: flex; flex-direction: column; gap: 2px; padding: 10px 14px 10px 18px;
    border: none; border-top: 1px solid #e8f0e8; background: #fff; cursor: pointer; text-align: left;
    font-family: Inter, sans-serif;
  }
  .br-acc-leaf:hover { background: #f0fdf4; }
  .br-acc-leaf h3 { font-size: 13.5px; font-weight: 800; color: #1e3a40; }
  .br-acc-leaf p { font-size: 12px; color: #6b7280; line-height: 1.4; }
  .br-hub-card {
    display: flex; flex-direction: column; gap: 6px; padding: 14px 15px; border: 1px solid #c8d6d8;
    border-radius: 12px; background: #fff; cursor: pointer; text-align: left; font-family: Inter, sans-serif;
    transition: box-shadow .18s, transform .15s;
  }
  .br-hub-card:hover { box-shadow: 0 4px 16px rgba(30,58,64,.16); transform: translateY(-1px); }
  .br-hub-card h3 { font-size: 14px; font-weight: 800; color: #1e3a40; }
  .br-hub-card p { font-size: 12px; color: #6b7280; line-height: 1.4; }

  .br-charts { display: flex; flex-wrap: wrap; gap: 12px; }
  .br-chart {
    background: #fff; border: 1px solid #e2e8f0; border-radius: 10px; padding: 12px 14px;
  }
  .br-chart.bars { flex: 2 1 420px; }
  .br-chart.pie, .br-chart.hbars { flex: 1 1 320px; }
  .br-chart h4 { font-size: 12.5px; font-weight: 800; color: #1e3a40; margin-bottom: 8px; }

  .br-toast {
    position: fixed; top: 18px; left: 50%; transform: translateX(-50%); z-index: 120;
    padding: 12px 22px; border-radius: 12px; background: #1e3a40; color: #fff;
    font-size: 13px; font-weight: 600; box-shadow: 0 4px 20px rgba(0,0,0,.25);
  }

  #report-zoom-area { transform-origin: top left; }

  @media (max-width: 767px) {
    .br-toolbar { padding: 12px 12px 10px; }
    .main-body { padding-bottom: 72px !important; }
  }
`;
