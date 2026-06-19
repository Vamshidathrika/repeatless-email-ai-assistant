import { NextResponse } from "next/server";
import { getServerSession } from "next-auth/next";
import { authOptions } from "@/lib/auth";
import { db } from "@/lib/db";
import { computeNextRun } from "@/lib/cron";

// ────────────────────────────────────────────────────────────
// GET /api/workflows — list all workflows for the authenticated user
// ────────────────────────────────────────────────────────────
export async function GET() {
  try {
    const session = await getServerSession(authOptions);

    if (!session || !session.user || !(session.user as any).id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const userId = (session.user as any).id;

    const workflows = await db.workflow.findMany({
      where: { userId },
      orderBy: { createdAt: "desc" },
    });

    return NextResponse.json({ workflows });
  } catch (error: any) {
    console.error("GET /api/workflows error:", error);
    return NextResponse.json(
      { error: "Internal Server Error", details: error.message },
      { status: 500 }
    );
  }
}

// ────────────────────────────────────────────────────────────
// POST /api/workflows — create a new workflow
// Body: { name, description?, schedule, timezone?, actions }
// ────────────────────────────────────────────────────────────
export async function POST(req: Request) {
  try {
    const session = await getServerSession(authOptions);

    if (!session || !session.user || !(session.user as any).id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const userId = (session.user as any).id;
    const body = await req.json();
    const { name, description, schedule, timezone = "UTC", actions } = body;

    if (!name || !schedule || !actions) {
      return NextResponse.json(
        { error: "Missing required fields: name, schedule, actions" },
        { status: 400 }
      );
    }

    // Validate actions is a valid JSON array string
    let actionsString: string;
    if (typeof actions === "string") {
      try {
        const parsed = JSON.parse(actions);
        if (!Array.isArray(parsed)) throw new Error("actions must be a JSON array");
        actionsString = actions;
      } catch {
        return NextResponse.json(
          { error: "actions must be a valid JSON array string" },
          { status: 400 }
        );
      }
    } else if (Array.isArray(actions)) {
      actionsString = JSON.stringify(actions);
    } else {
      return NextResponse.json(
        { error: "actions must be a JSON array or JSON string" },
        { status: 400 }
      );
    }

    const nextRunAt = computeNextRun(schedule, timezone);

    const workflow = await db.workflow.create({
      data: {
        userId,
        name,
        description: description || null,
        schedule,
        timezone,
        actions: actionsString,
        enabled: true,
        nextRunAt,
      },
    });

    return NextResponse.json({ workflow }, { status: 201 });
  } catch (error: any) {
    console.error("POST /api/workflows error:", error);
    return NextResponse.json(
      { error: "Internal Server Error", details: error.message },
      { status: 500 }
    );
  }
}
