import { NextResponse } from "next/server";
import { getServerSession } from "next-auth/next";
import { authOptions } from "@/lib/auth";
import { db } from "@/lib/db";
import { computeNextRun } from "@/lib/cron";
import { executeActions } from "@/lib/workflow";

// ────────────────────────────────────────────────────────────
// POST /api/workflows/run — manually trigger a workflow
// Body: { workflowId }
// ────────────────────────────────────────────────────────────
export async function POST(req: Request) {
  try {
    const session = await getServerSession(authOptions);

    if (!session || !session.user || !(session.user as any).id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const userId = (session.user as any).id;
    const body = await req.json();
    const { workflowId } = body;

    if (!workflowId) {
      return NextResponse.json({ error: "workflowId is required" }, { status: 400 });
    }

    // Verify ownership
    const workflow = await db.workflow.findFirst({
      where: { id: workflowId, userId },
    });

    if (!workflow) {
      return NextResponse.json({ error: "Workflow not found" }, { status: 404 });
    }

    // Mark as running
    await db.workflow.update({
      where: { id: workflowId },
      data: { lastRunStatus: "running" },
    });

    // Execute all actions directly in-process
    const { status, log } = await executeActions(workflow, userId);

    // Update workflow post-run
    await db.workflow.update({
      where: { id: workflowId },
      data: {
        lastRunAt: new Date(),
        lastRunStatus: status,
        lastRunLog: log,
        nextRunAt: computeNextRun(workflow.schedule, workflow.timezone),
      },
    });

    return NextResponse.json({ success: true, log });
  } catch (error: any) {
    console.error("POST /api/workflows/run error:", error);
    return NextResponse.json(
      { error: "Internal Server Error", details: error.message },
      { status: 500 }
    );
  }
}
