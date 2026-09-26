// src/app/api/security/users/route.ts
// GET  /api/security/users?q=       → users list (group name joined)
// POST /api/security/users          → create; UserId assigned (USR0000001…)
// PSW is stored as a bcrypt hash — the exact format the admin login verifies.
// Source of truth: tbl_userdetails. Group options come from tbl_usergroups.
import { NextRequest, NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { prisma } from "@/lib/prisma";
import { Prisma } from "@prisma/client";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function ok(data: unknown, status = 200) {
  return NextResponse.json({ success: true, data }, { status });
}
function err(message: string, status = 400) {
  return NextResponse.json({ success: false, message }, { status });
}
const trim = (v: unknown) => String(v ?? "").trim();

export async function GET(req: NextRequest) {
  try {
    const q = trim(req.nextUrl.searchParams.get("q")).toLowerCase();
    const like = `%${q}%`;
    const rows = await prisma.$queryRaw<{
      UserId: string; LogName: string; UserName: string; GroupId: string; GroupDes: string | null;
      NIC: string; ContNo: string; Email: string; WorkingLocID: string; Enable: number; Rmks: string;
    }[]>`
      SELECT RTRIM(u.UserId) AS UserId, RTRIM(u.LogName) AS LogName, RTRIM(u.UserName) AS UserName,
        RTRIM(u.GroupId) AS GroupId,
        (SELECT RTRIM(g.GroupDes) FROM tbl_usergroups g WHERE RTRIM(g.GroupId)=RTRIM(u.GroupId) LIMIT 1) AS GroupDes,
        RTRIM(u.NIC) AS NIC, RTRIM(u.ContNo) AS ContNo, RTRIM(u.Email) AS Email,
        RTRIM(u.WorkingLocID) AS WorkingLocID, u.Enable AS Enable, RTRIM(u.Rmks) AS Rmks
      FROM tbl_userdetails u
      WHERE ${q ? Prisma.sql`(LOWER(RTRIM(u.UserId)) LIKE ${like} OR LOWER(RTRIM(u.UserName)) LIKE ${like} OR LOWER(RTRIM(u.LogName)) LIKE ${like})` : Prisma.sql`1=1`}
      ORDER BY u.UserId
    `;
    return ok(rows.map((r) => ({
      userId: trim(r.UserId), logName: trim(r.LogName), userName: trim(r.UserName),
      groupId: trim(r.GroupId), groupDes: trim(r.GroupDes ?? ""),
      nic: trim(r.NIC), contNo: trim(r.ContNo), email: trim(r.Email),
      workingLocID: trim(r.WorkingLocID), enable: Boolean(Number(r.Enable)), rmks: trim(r.Rmks),
    })));
  } catch (e) {
    return err(e instanceof Error ? e.message : "Could not load the users", 500);
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = (await req.json()) as Record<string, unknown>;
    const logName = trim(body.logName);
    const userName = trim(body.userName);
    const psw = String(body.psw ?? "");
    if (!logName) return err("Type the login name first.");
    if (!userName) return err("Type the user's full name first.");
    if (!psw.trim()) return err("Type a password first.");
    const groupId = trim(body.groupId).slice(0, 10);
    const nic = trim(body.nic).slice(0, 20);
    const address = trim(body.address).slice(0, 200);
    const workingLocID = trim(body.workingLocID).slice(0, 200);
    const contNo = trim(body.contNo).slice(0, 100);
    const email = trim(body.email).slice(0, 100);
    const rmks = trim(body.rmks).slice(0, 250);
    const enable = body.enable === true || trim(body.enable) === "1" ? 1 : 0;

    if (groupId) {
      const g = await prisma.$queryRaw<{ n: number }[]>`
        SELECT COUNT(*) AS n FROM tbl_usergroups WHERE GroupId = ${groupId}
      `;
      if (Number(g[0]?.n || 0) === 0) return err(`Group ${groupId} does not exist.`, 400);
    }

    const dup = await prisma.$queryRaw<{ n: number }[]>`
      SELECT COUNT(*) AS n FROM tbl_userdetails WHERE UPPER(RTRIM(LogName)) = UPPER(${logName})
    `;
    if (Number(dup[0]?.n || 0) > 0) return err(`Login name '${logName}' is already taken.`, 409);

    const max = await prisma.$queryRaw<{ m: string | null }[]>`
      SELECT MAX(CAST(REGEXP_REPLACE(RTRIM(UserId), '[^0-9]', '') AS UNSIGNED)) AS m FROM tbl_userdetails
    `;
    const next = (Number(max[0]?.m || 0) || 0) + 1;
    const userId = `USR${String(next).padStart(7, "0")}`.slice(0, 10);

    // DOB/DOJ/DOL/Picture/CreateUser: DB defaults ('CURRENT_TIMESTAMP'/'0'/NULL)
    const pswHash = await bcrypt.hash(psw, 10);
    await prisma.$executeRaw`
      INSERT INTO tbl_userdetails
        (UserId, NIC, LogName, PSW, GroupId, UserName, Address, WorkingLocID, ContNo, Email, Rmks, Enable)
      VALUES
        (${userId}, ${nic}, ${logName}, ${pswHash}, ${groupId}, ${userName}, ${address}, ${workingLocID}, ${contNo}, ${email}, ${rmks}, ${enable})
    `;
    return ok({ userId, logName, userName, groupId, enable: Boolean(enable) }, 201);
  } catch (e) {
    return err(e instanceof Error ? e.message : "Could not save the user", 500);
  }
}
