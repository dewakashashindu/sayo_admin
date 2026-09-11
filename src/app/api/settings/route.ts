// app/api/settings/route.ts
import { NextRequest, NextResponse } from "next/server";
import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";

const prisma = new PrismaClient();

/* ─────────────────────────────────────────
   HELPERS
───────────────────────────────────────── */
function bufToBase64(buf: Buffer | Uint8Array | null | undefined): string | null {
  if (!buf) return null;
  const b = Buffer.isBuffer(buf) ? buf : Buffer.from(buf);
  if (b.length === 0) return null;
  return `data:image/jpeg;base64,${b.toString("base64")}`;
}

function base64ToBuf(dataUrl: string | null | undefined): Buffer | null {
  if (!dataUrl) return null;
  const match = dataUrl.match(/^data:.+;base64,(.+)$/);
  const raw = match ? match[1] : dataUrl;
  try {
    return Buffer.from(raw, "base64");
  } catch {
    return null;
  }
}

function toChar(s: string | null | undefined, len: number): string {
  return (s ?? "").substring(0, len).padEnd(len, " ");
}

function dateOnly(d: Date | null | undefined): string {
  if (!d) return "";
  try {
    return new Date(d).toISOString().split("T")[0];
  } catch {
    return "";
  }
}

function parseDateInput(s: string | null | undefined): Date {
  if (!s || !s.trim()) return new Date("1900-01-01T00:00:00.000Z");
  const d = new Date(s);
  return isNaN(d.getTime()) ? new Date("1900-01-01T00:00:00.000Z") : d;
}

function nextSeqId(prefix: string, len: number, existingIds: string[]): string {
  let max = 0;
  existingIds.forEach((id) => {
    const trimmed = (id || "").trim();
    if (trimmed.startsWith(prefix)) {
      const num = parseInt(trimmed.replace(prefix, ""), 10);
      if (!isNaN(num) && num > max) max = num;
    }
  });
  const next = max + 1;
  const digits = Math.max(1, len - prefix.length);
  return `${prefix}${String(next).padStart(digits, "0")}`;
}

/* ─────────────────────────────────────────
   MAPPERS
───────────────────────────────────────── */
function mapGroup(g: any) {
  return { groupId: g.GroupId.trim(), groupDes: g.GroupDes.trim() };
}

function mapBookingType(b: any) {
  return {
    bookingTypeID: b.BooikingTypeID.trim(),
    bookingTypeDes: b.BookingTypeDes.trim(),
    enabel: b.Enabel,
  };
}

function mapSpeciality(s: any) {
  return {
    specAreaID: s.SpecAreaID.trim(),
    specilities: s.Specilities.trim(),
  };
}

// ── NEW: Location mapper ──
function mapLocation(l: any) {
  return {
    locCode: l.LocCode.trim(),
    locDes: l.LocDes.trim(),
    address: (l.Address ?? "").trim(),
    enable: l.Enable,
  };
}

function mapUser(u: any, specAreaIDs: string[] = []) {
  return {
    userId: u.UserId.trim(),
    nic: u.NIC.trim(),
    logName: u.LogName.trim(),
    // SECURITY: never send the stored password hash to the browser.
    psw: "",
    hasPassword: Boolean(u.PSW && u.PSW.trim()),
    groupId: u.GroupId.trim(),
    userName: u.UserName.trim(),
    address: u.Address.trim(),
    workingLocID: u.WorkingLocID.trim(),
    contNo: u.ContNo.trim(),
    email: u.Email.trim(),
    dob: dateOnly(u.DOB),
    doj: dateOnly(u.DOJ),
    dol: dateOnly(u.DOL),
    createUser: u.CreateUser.trim(),
    picture: bufToBase64(u.Picture as any),
    rmks: u.Rmks.trim(),
    enable: u.Enable,
    specAreaIDs,
  };
}

async function fetchAllUsers() {
  const [users, assignments] = await Promise.all([
    prisma.tbl_userdetails.findMany({ orderBy: { UserId: "asc" } }),
    prisma.tbl_technicianspecilityassignment.findMany(),
  ]);

  const specMap = new Map<string, string[]>();
  assignments.forEach((a) => {
    const uid = a.UserID.trim();
    if (!specMap.has(uid)) specMap.set(uid, []);
    specMap.get(uid)!.push(a.SpecAreaID.trim());
  });

  return users.map((u) => mapUser(u, specMap.get(u.UserId.trim()) || []));
}

/* ═══════════════════════════════════════
   GET
═══════════════════════════════════════ */
export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const entity = searchParams.get("entity");

  try {
    if (entity === "groups") {
      const rows = await prisma.tbl_usergroups.findMany({ orderBy: { GroupId: "asc" } });
      return NextResponse.json({ success: true, data: rows.map(mapGroup) });
    }

    if (entity === "bookingtypes") {
      const rows = await prisma.tbl_bookingtypes.findMany({ orderBy: { BooikingTypeID: "asc" } });
      return NextResponse.json({ success: true, data: rows.map(mapBookingType) });
    }

    if (entity === "specialities") {
      const rows = await prisma.tbl_technicianspecilities.findMany({ orderBy: { SpecAreaID: "asc" } });
      return NextResponse.json({ success: true, data: rows.map(mapSpeciality) });
    }

    if (entity === "users") {
      const data = await fetchAllUsers();
      return NextResponse.json({ success: true, data });
    }

    // ── NEW: locations entity ──
    if (entity === "locations") {
      const rows = await prisma.tbl_LocationMaster.findMany({ orderBy: { LocCode: "asc" } });
      return NextResponse.json({ success: true, data: rows.map(mapLocation) });
    }

    // ── Full load (no entity param) ──
    const [groups, bookingTypes, specialities, users, locations] = await Promise.all([
      prisma.tbl_usergroups.findMany({ orderBy: { GroupId: "asc" } }),
      prisma.tbl_bookingtypes.findMany({ orderBy: { BooikingTypeID: "asc" } }),
      prisma.tbl_technicianspecilities.findMany({ orderBy: { SpecAreaID: "asc" } }),
      fetchAllUsers(),
      prisma.tbl_LocationMaster.findMany({ orderBy: { LocCode: "asc" } }),
    ]);

    return NextResponse.json({
      success: true,
      data: {
        users,
        groups: groups.map(mapGroup),
        bookingTypes: bookingTypes.map(mapBookingType),
        specialities: specialities.map(mapSpeciality),
        locations: locations.map(mapLocation),
      },
    });
  } catch (err: any) {
    console.error("[GET /api/settings]", err);
    return NextResponse.json({ success: false, error: err?.message }, { status: 500 });
  } finally {
    await prisma.$disconnect();
  }
}

/* ═══════════════════════════════════════
   POST
═══════════════════════════════════════ */
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { entity, payload } = body;

    if (!entity || !payload) {
      return NextResponse.json(
        { success: false, error: "entity and payload are required" },
        { status: 422 }
      );
    }

    switch (entity) {

      case "groups": {
        if (!payload.groupDes?.trim()) {
          return NextResponse.json({ success: false, error: "Group description is required" }, { status: 422 });
        }
        const existing = await prisma.tbl_usergroups.findMany({ select: { GroupId: true } });
        const newId = nextSeqId("GRP", 10, existing.map((e) => e.GroupId));
        const created = await prisma.tbl_usergroups.create({
          data: { GroupId: toChar(newId, 10), GroupDes: payload.groupDes.trim() },
        });
        return NextResponse.json({ success: true, data: mapGroup(created) });
      }

      case "bookingtypes": {
        if (!payload.bookingTypeDes?.trim()) {
          return NextResponse.json({ success: false, error: "Booking type description is required" }, { status: 422 });
        }
        const existing = await prisma.tbl_bookingtypes.findMany({ select: { BooikingTypeID: true } });
        const newId = nextSeqId("BKT", 10, existing.map((e) => e.BooikingTypeID));
        const created = await prisma.tbl_bookingtypes.create({
          data: {
            BooikingTypeID: toChar(newId, 10),
            BookingTypeDes: payload.bookingTypeDes.trim(),
            Enabel: payload.enabel ?? true,
          },
        });
        return NextResponse.json({ success: true, data: mapBookingType(created) });
      }

      case "specialities": {
        if (!payload.specilities?.trim()) {
          return NextResponse.json({ success: false, error: "Speciality name is required" }, { status: 422 });
        }
        const existing = await prisma.tbl_technicianspecilities.findMany({ select: { SpecAreaID: true } });
        const newId = nextSeqId("SPC", 10, existing.map((e) => e.SpecAreaID));
        const created = await prisma.tbl_technicianspecilities.create({
          data: { SpecAreaID: toChar(newId, 10), Specilities: payload.specilities.trim() },
        });
        return NextResponse.json({ success: true, data: mapSpeciality(created) });
      }

      // ── NEW: locations POST ──
      case "locations": {
        if (!payload.locDes?.trim()) {
          return NextResponse.json({ success: false, error: "Location description is required" }, { status: 422 });
        }
        const existing = await prisma.tbl_LocationMaster.findMany({ select: { LocCode: true } });
        const newId = nextSeqId("LOC", 10, existing.map((e) => e.LocCode));
        const created = await prisma.tbl_LocationMaster.create({
          data: {
            LocCode: toChar(newId, 10),
            LocDes: payload.locDes.trim().substring(0, 50),
            Address: payload.address?.trim() ?? " ",
            Enable: payload.enable ?? true,
          },
        });
        return NextResponse.json({ success: true, data: mapLocation(created) });
      }

      case "users": {
        if (!payload.userName?.trim()) {
          return NextResponse.json({ success: false, error: "User name is required" }, { status: 422 });
        }
        if (!payload.logName?.trim()) {
          return NextResponse.json({ success: false, error: "Login name is required" }, { status: 422 });
        }
        const rawPsw = payload.psw?.trim() || "";
        if (rawPsw.length < 8) {
          return NextResponse.json({ success: false, error: "Password is required (minimum 8 characters)" }, { status: 422 });
        }
        const dupLog = await prisma.tbl_userdetails.findFirst({ where: { LogName: payload.logName.trim() } });
        if (dupLog) {
          return NextResponse.json({ success: false, error: "Login name already exists" }, { status: 409 });
        }
        const existing = await prisma.tbl_userdetails.findMany({ select: { UserId: true } });
        const newId = nextSeqId("USR", 10, existing.map((e) => e.UserId));
        const created = await prisma.tbl_userdetails.create({
          data: {
            UserId: toChar(newId, 10),
            NIC: toChar(payload.nic, 20),
            LogName: payload.logName?.trim() || " ",
            PSW: await bcrypt.hash(rawPsw, 10),
            GroupId: toChar(payload.groupId, 10),
            UserName: payload.userName.trim(),
            Address: payload.address?.trim() || " ",
            WorkingLocID: payload.workingLocID?.trim() || "0",
            ContNo: payload.contNo?.trim() || "0",
            Email: payload.email?.trim() || " ",
            DOB: parseDateInput(payload.dob),
            DOJ: parseDateInput(payload.doj),
            DOL: parseDateInput(payload.dol),
            CreateUser: toChar(payload.createUser || "ADMIN", 10),
            Picture: base64ToBuf(payload.picture),
            Rmks: payload.rmks?.trim() || " ",
            Enable: payload.enable ?? true,
          },
        });

        const specIDs: string[] = Array.isArray(payload.specAreaIDs) ? payload.specAreaIDs : [];
        if (specIDs.length > 0) {
          await prisma.tbl_technicianspecilityassignment.createMany({
            data: specIDs.map((sid) => ({
              UserID: toChar(created.UserId, 10),
              SpecAreaID: toChar(sid, 10),
            })),
            skipDuplicates: true,
          });
        }
        return NextResponse.json({ success: true, data: mapUser(created, specIDs) });
      }

      default:
        return NextResponse.json({ success: false, error: "Unknown entity" }, { status: 400 });
    }
  } catch (err: any) {
    console.error("[POST /api/settings]", err);
    return NextResponse.json({ success: false, error: err?.message }, { status: 500 });
  } finally {
    await prisma.$disconnect();
  }
}

/* ═══════════════════════════════════════
   PUT
═══════════════════════════════════════ */
export async function PUT(req: NextRequest) {
  try {
    const body = await req.json();
    const { entity, id, payload } = body;

    if (!entity || !id || !payload) {
      return NextResponse.json(
        { success: false, error: "entity, id and payload are required" },
        { status: 422 }
      );
    }

    switch (entity) {

      case "groups": {
        const updated = await prisma.tbl_usergroups.update({
          where: { GroupId: toChar(id, 10) },
          data: { GroupDes: payload.groupDes?.trim() || "" },
        });
        return NextResponse.json({ success: true, data: mapGroup(updated) });
      }

      case "bookingtypes": {
        const updated = await prisma.tbl_bookingtypes.update({
          where: { BooikingTypeID: toChar(id, 10) },
          data: {
            BookingTypeDes: payload.bookingTypeDes?.trim() || "",
            Enabel: payload.enabel ?? true,
          },
        });
        return NextResponse.json({ success: true, data: mapBookingType(updated) });
      }

      case "specialities": {
        const updated = await prisma.tbl_technicianspecilities.update({
          where: { SpecAreaID: toChar(id, 10) },
          data: { Specilities: payload.specilities?.trim() || "" },
        });
        return NextResponse.json({ success: true, data: mapSpeciality(updated) });
      }

      // ── NEW: locations PUT ──
      case "locations": {
        const updated = await prisma.tbl_LocationMaster.update({
          where: { LocCode: toChar(id, 10) },
          data: {
            LocDes: payload.locDes?.trim().substring(0, 50) || "",
            Address: payload.address?.trim() ?? " ",
            Enable: payload.enable ?? true,
          },
        });
        return NextResponse.json({ success: true, data: mapLocation(updated) });
      }

      case "users": {
        const updateData: any = {
          NIC: toChar(payload.nic, 20),
          LogName: payload.logName?.trim() || " ",
          GroupId: toChar(payload.groupId, 10),
          UserName: payload.userName?.trim() || " ",
          Address: payload.address?.trim() || " ",
          WorkingLocID: payload.workingLocID?.trim() || "0",
          ContNo: payload.contNo?.trim() || "0",
          Email: payload.email?.trim() || " ",
          DOB: parseDateInput(payload.dob),
          DOJ: parseDateInput(payload.doj),
          DOL: parseDateInput(payload.dol),
          Rmks: payload.rmks?.trim() || " ",
          Enable: payload.enable ?? true,
        };

        const rawPsw = payload.psw?.trim() || "";
        if (rawPsw && !/^•+$/.test(rawPsw)) {
          if (rawPsw.length < 8) {
            return NextResponse.json({ success: false, error: "Password must be at least 8 characters" }, { status: 422 });
          }
          updateData.PSW = await bcrypt.hash(rawPsw, 10);
        }
        const newLogName = payload.logName?.trim() || "";
        if (newLogName) {
          const dupLog = await prisma.tbl_userdetails.findFirst({
            where: { LogName: newLogName, NOT: { UserId: toChar(id, 10) } },
          });
          if (dupLog) {
            return NextResponse.json({ success: false, error: "Login name already exists" }, { status: 409 });
          }
        }
        if (payload.picture !== undefined) {
          updateData.Picture = base64ToBuf(payload.picture);
        }

        const updated = await prisma.tbl_userdetails.update({
          where: { UserId: toChar(id, 10) },
          data: updateData,
        });

        await prisma.tbl_technicianspecilityassignment.deleteMany({
          where: { UserID: toChar(id, 10) },
        });

        const specIDs: string[] = Array.isArray(payload.specAreaIDs) ? payload.specAreaIDs : [];
        if (specIDs.length > 0) {
          await prisma.tbl_technicianspecilityassignment.createMany({
            data: specIDs.map((sid) => ({
              UserID: toChar(id, 10),
              SpecAreaID: toChar(sid, 10),
            })),
            skipDuplicates: true,
          });
        }
        return NextResponse.json({ success: true, data: mapUser(updated, specIDs) });
      }

      default:
        return NextResponse.json({ success: false, error: "Unknown entity" }, { status: 400 });
    }
  } catch (err: any) {
    console.error("[PUT /api/settings]", err);
    return NextResponse.json({ success: false, error: err?.message }, { status: 500 });
  } finally {
    await prisma.$disconnect();
  }
}

/* ═══════════════════════════════════════
   DELETE
═══════════════════════════════════════ */
export async function DELETE(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const entity = searchParams.get("entity");
  const id = searchParams.get("id");

  if (!entity || !id) {
    return NextResponse.json(
      { success: false, error: "entity and id query params are required" },
      { status: 422 }
    );
  }

  try {
    switch (entity) {

      case "groups": {
        const usedCount = await prisma.tbl_userdetails.count({
          where: { GroupId: toChar(id, 10) },
        });
        if (usedCount > 0) {
          return NextResponse.json(
            { success: false, error: "Cannot delete: this group is assigned to one or more users." },
            { status: 409 }
          );
        }
        await prisma.tbl_usergroups.delete({ where: { GroupId: toChar(id, 10) } });
        return NextResponse.json({ success: true });
      }

      case "bookingtypes": {
        await prisma.tbl_bookingtypes.delete({ where: { BooikingTypeID: toChar(id, 10) } });
        return NextResponse.json({ success: true });
      }

      case "specialities": {
        const usedCount = await prisma.tbl_technicianspecilityassignment.count({
          where: { SpecAreaID: toChar(id, 10) },
        });
        if (usedCount > 0) {
          return NextResponse.json(
            { success: false, error: "Cannot delete: this speciality is assigned to one or more technicians." },
            { status: 409 }
          );
        }
        await prisma.tbl_technicianspecilities.delete({ where: { SpecAreaID: toChar(id, 10) } });
        return NextResponse.json({ success: true });
      }

      // ── NEW: locations DELETE ──
      case "locations": {
        // Block delete if items use this location
        const usedByItems = await prisma.tbl_ItemMaster.count({
          where: { LocCode: toChar(id, 10) },
        });
        if (usedByItems > 0) {
          return NextResponse.json(
            { success: false, error: "Cannot delete: this location is used by one or more items." },
            { status: 409 }
          );
        }
        await prisma.tbl_LocationMaster.delete({ where: { LocCode: toChar(id, 10) } });
        return NextResponse.json({ success: true });
      }

      case "users": {
        await prisma.tbl_technicianspecilityassignment.deleteMany({
          where: { UserID: toChar(id, 10) },
        });
        await prisma.tbl_userdetails.delete({ where: { UserId: toChar(id, 10) } });
        return NextResponse.json({ success: true });
      }

      default:
        return NextResponse.json({ success: false, error: "Unknown entity" }, { status: 400 });
    }
  } catch (err: any) {
    console.error("[DELETE /api/settings]", err);
    return NextResponse.json({ success: false, error: err?.message }, { status: 500 });
  } finally {
    await prisma.$disconnect();
  }
}