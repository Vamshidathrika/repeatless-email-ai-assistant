import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { computeNextRun } from "@/lib/cron";
import { executeActions } from "@/lib/workflow";

// ────────────────────────────────────────────────────────────
// GET /api/cron/workflows — called by Vercel Cron
// ────────────────────────────────────────────────────────────
export async function GET(req: Request) {
  try {
    // ── Security check ──
    const cronSecret = process.env.CRON_SECRET;
    if (cronSecret) {
      const authHeader = req.headers.get("authorization");
      if (authHeader !== `Bearer ${cronSecret}`) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
      }
    }

    const now = new Date();

    // Find all enabled workflows whose nextRunAt is overdue
    const dueWorkflows = await db.workflow.findMany({
      where: {
        enabled: true,
        nextRunAt: { lte: now },
      },
    });

    if (dueWorkflows.length === 0) {
      return NextResponse.json({ ran: 0, results: [] });
    }

    const results: Array<{
      id: string;
      name: string;
      status: string;
      log: string;
    }> = [];

    for (const workflow of dueWorkflows) {
      // Mark as running
      await db.workflow.update({
        where: { id: workflow.id },
        data: { lastRunStatus: "running" },
      });

      // Run actions directly in-process using the user ID associated with the workflow
      const { status, log } = await executeActions(workflow, workflow.userId);

      // Update workflow post-run
      await db.workflow.update({
        where: { id: workflow.id },
        data: {
          lastRunAt: new Date(),
          lastRunStatus: status,
          lastRunLog: log,
          nextRunAt: computeNextRun(workflow.schedule, workflow.timezone),
        },
      });

      results.push({ id: workflow.id, name: workflow.name, status, log });
    }

    console.log(`[cron/workflows] Ran ${results.length} workflow(s) at ${now.toISOString()}`);

    return NextResponse.json({ ran: results.length, results });
  } catch (error: any) {
    console.error("GET /api/cron/workflows error:", error);
    return NextResponse.json(
      { error: "Internal Server Error", details: error.message },
      { status: 500 }
    );
  }
}
