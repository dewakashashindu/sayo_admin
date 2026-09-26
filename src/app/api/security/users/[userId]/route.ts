// src/app/api/security/users/[userId]/route.ts
// GET    /api/security/users/USR0000001 → one user (password never returned)
// PUT    …/USR0000001 → update fields; blank PSW keeps the current password
// PSW is stored as a bcrypt hash — the exact format the admin login verifies.
// DELETE …/USR0000001 → remove the user
import { NextRequest, NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const trim = (v: unknown) => String(v ?? "").trim();
function ok(data: unknown, status = 200) {
  return NextResponse.json({ success: true, data }, { status });
}
function err(message: string, status = 400) {
  return NextResponse.json({ success: false, message }, { status });
}

export async function GET(_req: NextRequest, ctx: { params: Promise<{ userId: string }> }) {
  try {
    const { userId: raw } = await ctx.params;
    const userId = trim(raw).slice(0, 10);
    const rows = await prisma.$queryRaw<{
      UserId: string; NIC: string; LogName: string; GroupId: string; UserName: string; Address: string;
      WorkingLocID: string; ContNo: string; Email: string; Rmks: string; Enable: number;
    }[]>`
      SELECT RTRIM(UserId) AS UserId, RTRIM(NIC) AS NIC, RTRIM(LogName) AS LogName,
        RTRIM(GroupId) AS GroupId, RTRIM(UserName) AS UserName, RTRIM(Address) AS Address,
        RTRIM(WorkingLocID) AS WorkingLocID, RTRIM(ContNo) AS ContNo, RTRIM(Email) AS Email,
        RTRIM(Rmks) AS Rmks, Enable AS Enable
      FROM tbl_userdetails WHERE UserId = ${userId} LIMIT 1
    `;
    if (!rows.length) return err(`User ${userId} was not found.`, 404);
    const r = rows[0];
    return ok({
      userId: trim(r.UserId), nic: trim(r.NIC), logName: trim(r.LogName), groupId: trim(r.GroupId),
      userName: trim(r.UserName), address: trim(r.Address), workingLocID: trim(r.WorkingLocID),
      contNo: trim(r.ContNo), email: trim(r.Email), rmks: trim(r.Rmks), enable: Boolean(Number(r.Enable)),
    });
  } catch (e) {
    return err(e instanceof Error ? e.message : "Could not load the user", 500);
  }
}

export async function PUT(req: NextRequest, ctx: { params: Promise<{ userId: string }> }) {
  try {
    const { userId: raw } = await ctx.params;
    const userId = trim(raw).slice(0, 10);
    if (!userId) return err("User id is missing.");
    const body = (await req.json()) as Record<string, unknown>;

    const logName = trim(body.logName);
    const userName = trim(body.userName);
    if (!logName) return err("Type the login name first.");
    if (!userName) return err("Type the user's full name first.");
    const groupId = trim(body.groupId).slice(0, 10);
    const nic = trim(body.nic).slice(0, 20);
    const address = trim(body.address).slice(0, 200);
    const workingLocID = trim(body.workingLocID).slice(0, 200);
    const contNo = trim(body.contNo).slice(0, 100);
    const email = trim(body.email).slice(0, 100);
    const rmks = trim(body.rmks).slice(0, 250);
    const enable = body.enable === true || trim(body.enable) === "1" ? 1 : 0;
    const newPsw = String(body.psw ?? "").trim();

    if (groupId) {
      const g = await prisma.$queryRaw<{ n: number }[]>`
        SELECT COUNT(*) AS n FROM tbl_usergroups WHERE GroupId = ${groupId}
      `;
      if (Number(g[0]?.n || 0) === 0) return err(`Group ${groupId} does not exist.`, 400);
    }
    const dup = await prisma.$queryRaw<{ n: number }[]>`
      SELECT COUNT(*) AS n FROM tbl_userdetails
      WHERE UPPER(RTRIM(LogName)) = UPPER(${logName}) AND RTRIM(UserId) <> RTRIM(${userId})
    `;
    if (Number(dup[0]?.n || 0) > 0) return err(`Login name '${logName}' is already taken.`, 409);

    // blank password field = keep the existing one
    const n = newPsw
      ? await prisma.$executeRaw`
          UPDATE tbl_userdetails
          SET NIC=${nic}, LogName=${logName}, PSW=${await bcrypt.hash(newPsw, 10)}, GroupId=${groupId}, UserName=${userName},
              Address=${address}, WorkingLocID=${workingLocID}, ContNo=${contNo}, Email=${email}, Rmks=${rmks}, Enable=${enable}
          WHERE UserId=${userId}
        `
      : await prisma.$executeRaw`
          UPDATE tbl_userdetails
          SET NIC=${nic}, LogName=${logName}, GroupId=${groupId}, UserName=${userName},
              Address=${address}, WorkingLocID=${workingLocID}, ContNo=${contNo}, Email=${email}, Rmks=${rmks}, Enable=${enable}
          WHERE UserId=${userId}
        `;
    if (Number(n) === 0) return err(`User ${userId} was not found.`, 404);
    return ok({ userId });
  } catch (e) {
    return err(e instanceof Error ? e.message : "Could not update the user", 500);
  }
}

export async function DELETE(_req: NextRequest, ctx: { params: Promise<{ userId: string }> }) {
  try {
    const { userId: raw } = await ctx.params;
    const userId = trim(raw).slice(0, 10);
    if (!userId) return err("User id is missing.");
    const n = await prisma.$executeRaw`DELETE FROM tbl_userdetails WHERE UserId=${userId}`;
    if (Number(n) === 0) return err(`User ${userId} was not found.`, 404);
    return ok({ userId });
  } catch (e) {
    return err(e instanceof Error ? e.message : "Could not delete the user", 500);
  }
}
