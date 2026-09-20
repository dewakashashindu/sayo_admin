# DB Audit — SRN / Damage / Recon vs `phpMyAdmin SQL Dump.txt` (db_acd689_sayo 2026-09-19)

**Dump host:** `MYSQL8001.site4now.net` MySQL 8.0.39 · **Branch:** 5 locations, ~1.4k tbl_itemmaster rows, 6 GRNs (3 confirmed), 0 SRN/Damage/Recon rows.

---

## 0) What the dump DOES contain (the source of truth)

| Table | Rows in dump | Key columns used by inventory |
|-------|--------------|--------------------------------|
| `tbl_locationmaster` | 5 | `LocCode` (CHAR10), `LocDes`, `Enable` → `LOC0000001` COLOMBO MAIN … `LOC0000005` JAFFNA |
| `tbl_suppliermaster` | 12 | `SupID`, `SupName`, `ContactNO`, `Emails`, `Enable` → ex: `SUP0000004` Dreamron |
| `tbl_unitmaster` | 10 | `MasterUnitID`, `UnitDes` → PIECE/PCS/KG/BOTTLE… |
| `tbl_itemmaster` | ~1,420 (LOC0000001 + LOC0000002) | `LocCode`,`ItemCode`, `ItemDes`, `MasterUnitID`, `Category1-4`, `SupID`, `RawCost`, `CostMarkup`, `OverallCost`, `Retailprice`, `SalesMargin`, `StockBalance`, `Enable`, `ServiceItem`, `SemiFinishedProd` |
| `tbl_itemdetail` | **1** | `LocCode`,`ItemCode`,`ExpiryDate`,`ItemQty` → only `LOC0000001|ITM000000001278|50` — not the stock source |
| `tbl_grnheader` | 6 | `LocCode`,`GRNNO` (VARCHAR15, padded), `GRNDate`, `SupID`, `SupInvNo`, `GrossTotal`/`NetTotal`, `Confirmed` (`Y`/`N`), `PONO`, `GRNTYPE='GR'` |
| `tbl_grndetails` | 14 | `LocCode`,`GRNNo`,`ItemCode`,`UnitID`,`CostPrice`,`RetailPrice`,`GRNQty`,`FreeQty`,`ItemValue`,`RETYN` BIT, `RETQTY`,`RETVAL`,`PONO`,`LineNo` |
| `tbl_poheader` | 6 | `LocCode`,`PONO`,`PODate`,`DueDate`,`SupID`,`NetTotal`,`Confirmed` |
| `tbl_podetails` | 12 | `LocCode`,`PONo`,`ItemCode`,`UnitID`,`CostPrice`,`POQty`,`GRNQTY`,`GRNNOs` |
| `tbl_stocktxn` | 6 | `TxnNo`,`LocCode`,`ItemCode`,`TxnType='GR'`, `RefNo`=GRNNO, `QtyIn`/`QtyOut`/`Balance`,`CostPrice` |
| `tbl_taxes`, `tbl_paymentgroup` (3), `tbl_paymentmodes` (4), `vw_paymentmodes`, `vw_itemdetail`/`vw_itemmaster`, `vw_recipes` | — | already wired correctly |
| `tbl_serials` | 5 | `SeriCode='GRN','PO','BK','CUS','I'` — **no `SRN`/`DMG`/`REC` codes** |
| **`tbl_srn*`, `tbl_damage*`, `tbl_recon*`** | **0 — tables do not exist** | confirmed: `grep CREATE TABLE` lists 30 tables, none match `srn|damage|recon` |

**Indexes / Views confirming the same:**

- `vw_itemdetail` = `tbl_itemmaster` JOIN `tbl_suppliermaster` LEFT `tbl_itemdetail` + `tbl_itemcategory1-4` + `tbl_unitmaster` — already gives `ItemDes`, `UnitDes`, `CatDes`, `SupName`, `StockBalance`, `ItemQty`.
- `vw_paymentmodes` = `tbl_paymentmodes LEFT JOIN tbl_paymentgroup` — billing already uses it.
- `tbl_grndetails.RETYN/RETQTY/RETVAL` — the *only* return fields in the dump, all `0` (`b'0',0,0`).

**Conclusion:** the 3 note types have **no dedicated header/details tables** in your dump. The 3 screens we shipped (`src/app/inventory/srn|damage|recon/page.tsx`) therefore **cannot load real rows** — they correctly fall back to demo data (the PDF screenshots) and to the lookups that DO exist. See per-note fix below.

---

## 1) SUPPLIER RETURN NOTE (SRN) — `src/app/inventory/srn/page.tsx`

### What the screen currently loads
- **Lookups** `GET /api/inventory/lookups` → `tbl_locationmaster` (5), `tbl_suppliermaster` (12), `tbl_unitmaster` (10) — ✅ **correct**, uses `RTRIM` + `Enable` flag exactly as dump.
- **Open GRNs** `GET /api/inventory/grn?status=confirmed&q=locCode` → `tbl_grnheader` `Confirmed='Y'` slice. Dump has 3 confirmed: `GRN0000002`/`GRN0000005`/`GRN0000006` at `LOC0000001`. — ✅ **correct**
  ```sql
  SELECT RTRIM(GRNNO) AS grnNo, RTRIM(SupID) AS supID, GRNDate, NetTotal
  FROM tbl_grnheader
  WHERE LocCode=:loc AND Confirmed='Y'
  ORDER BY GRNDate DESC;
  ```
- **GRN lines** `GET /api/inventory/grn/:grnNo?locCode=` → `tbl_grndetails` for that `GRNNo` + `LocCode`. Demo fallback shows WHITE CABBAGE etc when API misses. — ✅ **correct** for the drill-down, but filtered Quantity must respect `GRNQty - RETQTY`.
- **SRN list** `GET /api/inventory/supplier-return` → **does not exist** in repo. Screen shows 4 demo rows (`SR000000`/`SR000002` 2026-07…09). — ❌ **no table to load** — every Find → demo.

### What the DB actually holds for returns
- `tbl_grndetails.RETYN BIT, RETQTY DOUBLE, RETVAL DOUBLE` per line. In dump **all 0**, so no historic return to show.
- `tbl_stocktxn` has only `TxnType='GR'` (goods receipt). No `SR`/`RT` type.
- `tbl_serials` has no `SRN` counter.
- No `tbl_srnheader` / `tbl_srndetails` / `vw_srn`.

### What should load (hariyatama)

1. **Header dropdowns** — already correct. Keep.
2. **GRN dropdown** — must filter to **confirmed GRNs that still have returnable qty**:
   ```sql
   SELECT h.GRNNO, h.SupID, s.SupName, h.GRNDate, h.NetTotal
   FROM tbl_grnheader h
   JOIN tbl_suppliermaster s ON s.SupID = h.SupID
   WHERE h.LocCode = :loc AND h.Confirmed='Y'
     AND EXISTS (
       SELECT 1 FROM tbl_grndetails d
       WHERE d.LocCode=h.LocCode AND RTRIM(d.GRNNo)=RTRIM(h.GRNNO)
         AND (d.GRNQty - COALESCE(d.RETQTY,0)) > 0
     );
   ```
   Current screen does `Confirmed='Y'` but not `RETQTY` check — **add the NOT-fully-returned filter** (yellow in screenshot: you cannot return more than GRN qty).

3. **Line grid after GRN pick** — join `tbl_grndetails` → `tbl_itemmaster`/`tbl_unitmaster` so `Cost Price`/`Item Name`/`Unit` are exactly what was received:
   ```sql
   SELECT d.ItemCode, m.ItemDes, d.UnitID, um.UnitDes, d.CostPrice,
          d.GRNQty, (d.GRNQty - COALESCE(d.RETQTY,0)) AS returnableQty,
          d.FreeQty, d.RETQTY, d.RETYN
   FROM tbl_grndetails d
   LEFT JOIN tbl_itemmaster m ON m.LocCode=d.LocCode AND m.ItemCode=d.ItemCode
   LEFT JOIN tbl_unitmaster um ON um.MasterUnitID=d.UnitID
   WHERE RTRIM(d.GRNNo)=:grn AND d.LocCode=:loc
   ORDER BY d.LineNo;
   ```
   `Return Qty` (pink) must be capped at `returnableQty`; `Item Value = CostPrice * ReturnQty`.

4. **Find tab / Print** — needs a new table. Two options, pick one and we will ship it:
   - **A) Minimal (reuse existing field)** — SRN is not a separate document; the return IS the `RETQTY` update on `tbl_grndetails` + a `tbl_stocktxn` `QtyOut` row (`TxnType='SR'`). Find would then be a view:
     ```sql
     CREATE VIEW vw_supplier_returns AS
     SELECT d.LocCode, RTRIM(d.GRNNo) AS GrnNo, d.ItemCode, m.ItemDes,
            d.RETQTY AS ReturnQty, d.RETVAL AS ReturnValue, d.CostPrice
     FROM tbl_grndetails d JOIN tbl_itemmaster m ON m.ItemCode=d.ItemCode AND m.LocCode=d.LocCode
     WHERE d.RETYN=1 AND d.RETQTY>0;
     ```
     This matches dump's BIT flag but **dump has no SRN number/date/user** — you would lose `SR000002`-style numbering.
   - **B) Proper (recommended — matches PO/GRN)** — create `tbl_srnheader` + `tbl_srndetails` + `tbl_serials('SRN')` mirror of `tbl_grnheader/details`. Then Find loads:
     ```sql
     SELECT RTRIM(h.SRNNo) AS srnNo, h.LocCode, h.SRNDate, h.SupID, s.SupName,
            h.GRNNo, h.TxnDate, h.NetTotal, h.Confirmed
     FROM tbl_srnheader h JOIN tbl_suppliermaster s ON s.SupID=h.SupID
     WHERE (:status='all' OR ( :status='confirmed' AND h.Confirmed='Y') OR …)
       AND (RTRIM(h.SRNNo) LIKE :q OR s.SupName LIKE :q);
     ```
     Confirmation would: insert `tbl_stocktxn` `QtyOut`, decrement `tbl_itemmaster.StockBalance` and `tbl_itemdetail` if used, and update `tbl_grndetails.RETQTY/RETVAL/RETYN`.

**Current page is correct for everything that exists;** the only gap is the missing SRN стола — decide A vs B and we wire the two `/api/inventory/supplier-return*` routes.

---

## 2) DAMAGE NOTE — `src/app/inventory/damage/page.tsx`

### What the screen currently loads
- **Lookups** `tbl_locationmaster` + `tbl_unitmaster` via `lookups` — ✅
- **Item picker** `ItemSuggestInput` → `GET /api/items/search?q=&locCode=` → `tbl_itemmaster` + `vw_itemdetail` — ✅ (shows `ItemCode`, `ItemDes`, `MasterUnitID`, `RawCost`/`OverallCost`)
- **Find** `GET /api/inventory/damage` → **no table** → demo `D000000` (SPINACH 0.5kg 510→255) + `D000002` — ❌

### What the DB holds
- **No `tbl_damage*` table.** `tbl_stocktxn` only has `GR`; `tbl_itemmaster.StockBalance` is the system balance (e.g., `ITM000000001001` → 4 PCS, `ITM000000000002` → 50).
- Cost that should be used for damage = `tbl_itemmaster.RawCost` (or `OverallCost` if you price at retail) — dump's `RawCost` for 001001 = 2450.

### What should load (hariyatama)

1. **Details header** — `Location` (from `tbl_locationmaster`, same as now), `Date`, `Damage No` (`D000000` auto). No supplier.
2. **Line grid** — each row is an **item that exists in that location** with current stock, so the cashier cannot damage more than on hand:
   ```sql
   -- picker source + cost + stock for the pink Damage Qty check
   SELECT m.ItemCode, m.ItemDes, m.MasterUnitID, um.UnitDes,
          COALESCE(m.RawCost,0) AS CostPrice,   -- or OverallCost per your costing rule
          COALESCE(m.StockBalance,0) AS SystemQty,
          COALESCE(idet.ItemQty, m.StockBalance) AS lotQty -- tbl_itemdetail only 1 row, fallback to master
   FROM tbl_itemmaster m
   LEFT JOIN tbl_unitmaster um ON um.MasterUnitID=m.MasterUnitID
   LEFT JOIN tbl_itemdetail idet ON idet.LocCode=m.LocCode AND idet.ItemCode=m.ItemCode
   WHERE m.LocCode=:loc AND m.Enable=1
     AND (m.ItemDes LIKE :q OR m.ItemCode LIKE :q)
   ORDER BY m.ItemDes;
   ```
   Current `ItemSuggestInput` already does this — **keep**, just pass `locCode`.

3. **Validation** — `DamageQty > 0` and `DamageQty <= SystemQty` (screen already caps GRN qty for SRN; add same for damage). `Item Value = CostPrice * DamageQty`, `Net Value = SUM(ItemValue)`.

4. **Find / Print** — needs `tbl_damageheader`/`tbl_damagedetails` (mirror `tbl_grn*`):
   ```sql
   CREATE TABLE tbl_damageheader (
     LocCode CHAR(10), DamNo VARCHAR(15), DamDate DATETIME,
     NetTotal DOUBLE, UserID CHAR(10), Remarks VARCHAR(400),
     TxnDate DATETIME, Confirmed CHAR(1), ConUserID CHAR(10), ConDatetime DATETIME,
     PRIMARY KEY(LocCode,DamNo)
   );
   CREATE TABLE tbl_damagedetails (
     LocCode CHAR(10), DamNo VARCHAR(15), ItemCode CHAR(15), UnitID CHAR(10),
     CostPrice DOUBLE, DamQty DOUBLE, ItemValue DOUBLE, LineNo INT,
     PRIMARY KEY(LocCode,DamNo,LineNo)
   );
   ```
   Add `tbl_serials('DMG')`. Confirmation: `tbl_stocktxn TxnType='DM'` `QtyOut=DamQty`, `Balance = StockBalance - DamQty`; `UPDATE tbl_itemmaster SET StockBalance = StockBalance - :qty`; if `tbl_itemdetail` is the stock source, also decrement `ItemQty`.

**Current page is correct for lookups & cost math;** real data will appear once the `tbl_damage*` pair (or the single-`tbl_stocktxn DM` approach) is created. The 2 demo rows (`D000000` SPINACH, `D000002` 9,999,999) are placeholders.

---

## 3) STOCK RECONCILIATION NOTE — `src/app/inventory/recon/page.tsx`

### What the screen currently loads
- **Lookups** `tbl_locationmaster` + `tbl_unitmaster` via `lookups` — ✅
- **Categories** `GET /api/categories` (falls back to `FRUITS/VEGE/DAIRY` demo) — dump has `tbl_itemcategory1` (18 `CatDes` like Hair Care…, SALON CONSUMABLES), `tbl_itemcategory2` (25 brands), `tbl_itemcategory3` (10 areas), `tbl_itemcategory4` (5 segments). Screen's `Main Cat / Sub cat1-4` map to `Category1-4` correctly, but **category API is missing** — it shows FRUITS placeholder. — ⚠️ wiring needed.
- **Load** `GET /api/inventory/recon/load?locCode=&mainCat=&sub1..4` → **no table** → demo 12 FRUITS rows (LEMON…GUAVA, sys 0) — ❌
- **Find** `GET /api/inventory/recon` → demo `R000000` / `R000003` 36,666,699 — ❌

### What the DB holds
- No `tbl_recon*` table. System quantity is **only** `tbl_itemmaster.StockBalance` (+ the single `tbl_itemdetail.ItemQty`). Example stock you can verify: `LOC0000001` `ITM000000001001` StockBalance=4, `ITM000000001002` StockBalance=4, `ITM000000000002` StockBalance=50.
- Categories for filtering are exactly `Category1-4` on `tbl_itemmaster` (the 18 + 25 + 10 + 5 codes above).
- Cost for the difference = `RawCost` (or `OverallCost`) from same row.

### What should load (hariyatama)

1. **Filters** — `Location` (5), `Main Cat` (`tbl_itemcategory1` 18), `Sub cat1` (`tbl_itemcategory2` 25), `Sub cat2` (`tbl_itemcategory3` 10), `Sub cat3` (`tbl_itemcategory4` 5) — wire `GET /api/inventory/lookups` to also return these (or `GET /api/categories` → `tbl_itemcategory* WHERE Enable=1`).

2. **Load button** — the PDF page 14 behaviour: “bring every item that matches the location + the four categories, even if system qty is 0”. The correct SQL against your dump is:
   ```sql
   -- used by /api/inventory/recon/load
   SELECT m.ItemCode, m.ItemDes, m.MasterUnitID, um.UnitDes,
          COALESCE(m.StockBalance,0) AS SystemQty,
          COALESCE(m.RawCost,0)      AS CostPrice   -- or OverallCost per costing rule
   FROM tbl_itemmaster m
   LEFT JOIN tbl_unitmaster um ON um.MasterUnitID=m.MasterUnitID
   WHERE m.LocCode = :loc
     AND m.Enable = 1
     AND (:mainCat = '' OR m.Category1 = :mainCat)
     AND (:sub1    = '' OR m.Category2 = :sub1)
     AND (:sub2    = '' OR m.Category3 = :sub2)
     AND (:sub3    = '' OR m.Category4 = :sub3)
   ORDER BY m.ItemDes;
   ```
   `vw_itemdetail` does the same JOINs (adds `SupName`, `CatDes`) — either table or view works.

3. **Grid columns** — **System Qty (blue readonly)** ← `SystemQty` from above; **Phy Qty (blue editable)** ← user count; **Applica [x] (green)** ← whether this line participates; **Cost Price** ← `CostPrice`; **Item Value = (Phy − System) * CostPrice** only when `Applica=1` (already `recalc()` in page). Demo LEMON rows with `sys 0` would become e.g., `LOC0000001` `ITM000000001001` sys 4, cost 2450.
4. **Net Value** = `SUM(ItemValue WHERE Applica)`. Confirmation preview already shows this.

5. **Find / Print / Confirm** — needs `tbl_reconheader`/`tbl_recondetails` + `tbl_serials('REC')`:
   ```sql
   CREATE TABLE tbl_reconheader (
     LocCode CHAR(10), RecNo VARCHAR(15), RecDate DATETIME,
     NetValue DOUBLE, UserID CHAR(10), Remarks VARCHAR(400),
     TxnDate DATETIME, Confirmed CHAR(1), ConUserID CHAR(10), ConDatetime DATETIME,
     PRIMARY KEY(LocCode,RecNo)
   );
   CREATE TABLE tbl_recondetails (
     LocCode CHAR(10), RecNo VARCHAR(15), ItemCode CHAR(15),
     SystemQty DOUBLE, PhyQty DOUBLE, Applica TINYINT,
     CostPrice DOUBLE, ItemValue DOUBLE, LineNo INT,
     PRIMARY KEY(LocCode,RecNo,LineNo)
   );
   ```
   Find:
   ```sql
   SELECT RTRIM(h.RecNo) AS recNo, h.LocCode, h.RecDate, h.TxnDate, u.UserName, h.NetValue, h.Confirmed
   FROM tbl_reconheader h LEFT JOIN tbl_userdetails u ON u.UserId=h.UserID
   WHERE (:status='all' OR h.Confirmed=:flag)
     AND (h.RecNo LIKE :q OR h.LocCode LIKE :q);
   ```
   Confirm (when `Applica` ticked): for each line `Diff = Phy − System`; `IF Diff<>0 INSERT tbl_stocktxn (TxnType='RC',QtyIn=GREATEST(Diff,0),QtyOut=GREATEST(-Diff,0),Balance=System+Diff)`; `UPDATE tbl_itemmaster SET StockBalance = StockBalance + Diff`; `UPDATE tbl_itemdetail.ItemQty` if that becomes the stock source.

**Current page already computes `Item Value = (Phy-System)*Cost` and `Net Value` correctly;** the only missing wire is the Load SQL above + the two recon tables. The FRUITS demo 040-051 and `R000003` 36M are placeholders because the view returns 0 rows today.

---

## 4) What to run next (one decision)

- **Option A — keep dump as-is, make the 3 screens “read-only demo”** — they will keep showing the 5+12+10 lookups correctly + the 3 confirmed GRNs for SRN, but Find will stay demo. No DDL.
- **Option B — make them real (30 min)** — I create `tbl_srnheader/details`, `tbl_damageheader/details`, `tbl_reconheader/details` + `tbl_serials` rows `('SRN'/'DMG'/'REC')` + the 3 pairs of `GET /api/inventory/*` list + confirm routes that run the SQL above inside a transaction and write `tbl_stocktxn`. Load for Recon will immediately list your ~290 items per branch instead of 12 FRUITS. Say the word and I ship the DDL + Prisma models + zip.

If you want me to wire it now, tell me which SRN model you prefer (A=`RETQTY` on `tbl_grndetails` only, or B=separate SRN tables) and whether Damage/Recon cost should be `RawCost` vs `OverallCost` — I will generate the exact `CREATE TABLE …` + MySQL view for your dump and push the updated `src/app/inventory/*` + `src/app/api/inventory/*` + `prisma/schema.prisma` bundle.

