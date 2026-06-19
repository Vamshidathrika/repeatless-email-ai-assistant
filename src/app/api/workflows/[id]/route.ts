import { NextResponse } from "next/server";
import { getServerSession } from "next-auth/next";
import { authOptions } from "@/lib/auth";
import { db } from "@/lib/db";
import { computeNextRun } from "@/lib/cron";

interface RouteContext {
  params: Promise<{ id: string }>;
}

// ────────────────────────────────────────────────────────────
// GET /api/workflows/[id] — fetch a single workflow (verify ownership)
// ────────────────────────────────────────────────────────────
export async function GET(_req: Request, context: RouteContext) {
  try {
    const session = await getServerSession(authOptions);

    if (!session || !session.user || !(session.user as any).id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const userId = (session.user as any).id;
    const { id } = await context.params;

    const workflow = await db.workflow.findFirst({
      where: { id, userId },
    });

    if (!workflow) {
      return NextResponse.json({ error: "Workflow not found" }, { status: 404 });
    }

    return NextResponse.json({ workflow });
  } catch (error: any) {
    console.error(`GET /api/workflows/[id] error:`, error);
    return NextResponse.json(
      { error: "Internal Server Error", details: error.message },
      { status: 500 }
    );
  }
}

// ────────────────────────────────────────────────────────────
// PUT /api/workflows/[id] — update a workflow (verify ownership)
// Body: { name?, description?, schedule?, timezone?, actions?, enabled? }
// ────────────────────────────────────────────────────────────
export async function PUT(req: Request, context: RouteContext) {
  try {
    const session = await getServerSession(authOptions);

    if (!session || !session.user || !(session.user as any).id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const userId = (session.user as any).id;
    const { id } = await context.params;

    // Verify ownership
    const existing = await db.workflow.findFirst({ where: { id, userId } });
    if (!existing) {
      return NextResponse.json({ error: "Workflow not found" }, { status: 404 });
    }

    const body = await req.json();
    const { name, description, schedule, timezone, actions, enabled } = body;

    // Build update payload (only provided fields)
    const updateData: Record<string, any> = {};

    if (name !== undefined) updateData.name = name;
    if (description !== undefined) updateData.description = description;
    if (timezone !== undefined) updateData.timezone = timezone;
    if (enabled !== undefined) {
      updateData.enabled = enabled;
      if (enabled) {
        // Recompute nextRunAt when resuming workflow
        const tz = timezone ?? existing.timezone;
        updateData.nextRunAt = computeNextRun(schedule ?? existing.schedule, tz);
      }
    }

    if (actions !== undefined) {
      if (typeof actions === "string") {
        try {
          const parsed = JSON.parse(actions);
          if (!Array.isArray(parsed)) throw new Error();
          updateData.actions = actions;
        } catch {
          return NextResponse.json(
            { error: "actions must be a valid JSON array string" },
            { status: 400 }
          );
        }
      } else if (Array.isArray(actions)) {
        updateData.actions = JSON.stringify(actions);
      }
    }

    if (schedule !== undefined) {
      updateData.schedule = schedule;
      // Recompute nextRunAt when schedule changes
      const tz = timezone ?? existing.timezone;
      updateData.nextRunAt = computeNextRun(schedule, tz);
    }

    const workflow = await db.workflow.update({
      where: { id },
      data: updateData,
    });

    return NextResponse.json({ workflow });
  } catch (error: any) {
    console.error(`PUT /api/workflows/[id] error:`, error);
    return NextResponse.json(
      { error: "Internal Server Error", details: error.message },
      { status: 500 }
    );
  }
}

// ────────────────────────────────────────────────────────────
// DELETE /api/workflows/[id] — delete a workflow (verify ownership)
// ────────────────────────────────────────────────────────────
export async function DELETE(_req: Request, context: RouteContext) {
  try {
    const session = await getServerSession(authOptions);

    if (!session || !session.user || !(session.user as any).id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const userId = (session.user as any).id;
    const { id } = await context.params;

    // Verify ownership before deletion
    const existing = await db.workflow.findFirst({ where: { id, userId } });
    if (!existing) {
      return NextResponse.json({ error: "Workflow not found" }, { status: 404 });
    }

    await db.workflow.delete({ where: { id } });

    return NextResponse.json({ success: true });
  } catch (error: any) {
    console.error(`DELETE /api/workflows/[id] error:`, error);
    return NextResponse.json(
      { error: "Internal Server Error", details: error.message },
      { status: 500 }
    );
  }
}
