import { NextResponse } from "next/server";
import { getServerSession } from "next-auth/next";
import { authOptions } from "@/lib/auth";
import { db } from "@/lib/db";

// ────────────────────────────────────────────────────────────
// GET /api/webhooks/[id] — fetch a single webhook (verify ownership)
// ────────────────────────────────────────────────────────────
export async function GET(
  _req: Request,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const session = await getServerSession(authOptions);
    if (!session || !session.user || !(session.user as any).id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const userId = (session.user as any).id;
    const { id } = await context.params;

    const webhook = await db.webhookConnection.findFirst({
      where: { id, userId },
    });

    if (!webhook) {
      return NextResponse.json({ error: "Webhook not found" }, { status: 404 });
    }

    return NextResponse.json({ webhook });
  } catch (error: any) {
    console.error("GET /api/webhooks/[id] error:", error);
    return NextResponse.json(
      { error: "Internal Server Error", details: error.message },
      { status: 500 }
    );
  }
}

// ────────────────────────────────────────────────────────────
// PUT /api/webhooks/[id] — update a webhook connection
// ────────────────────────────────────────────────────────────
export async function PUT(
  req: Request,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const session = await getServerSession(authOptions);
    if (!session || !session.user || !(session.user as any).id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const userId = (session.user as any).id;
    const { id } = await context.params;

    // Verify ownership
    const existing = await db.webhookConnection.findFirst({
      where: { id, userId },
    });

    if (!existing) {
      return NextResponse.json({ error: "Webhook not found" }, { status: 404 });
    }

    const body = await req.json();
    const { name, description, url, method, headers, emoji, secret } = body;

    // Validate URL if provided
    if (url !== undefined) {
      if (typeof url !== "string" || (!url.startsWith("http://") && !url.startsWith("https://"))) {
        return NextResponse.json(
          { error: "url must start with http:// or https://" },
          { status: 400 }
        );
      }
    }

    // Validate headers JSON if provided
    if (headers !== undefined && headers !== null && headers !== "") {
      try {
        JSON.parse(headers);
      } catch {
        return NextResponse.json(
          { error: "headers must be a valid JSON string" },
          { status: 400 }
        );
      }
    }

    const webhook = await db.webhookConnection.update({
      where: { id },
      data: {
        ...(name !== undefined && { name: String(name).trim() }),
        ...(description !== undefined && { description: description || null }),
        ...(url !== undefined && { url }),
        ...(method !== undefined && { method }),
        ...(headers !== undefined && { headers: headers || null }),
        ...(emoji !== undefined && { emoji }),
        ...(secret !== undefined && { secret: secret || null }),
      },
    });

    return NextResponse.json({ webhook });
  } catch (error: any) {
    console.error("PUT /api/webhooks/[id] error:", error);
    return NextResponse.json(
      { error: "Internal Server Error", details: error.message },
      { status: 500 }
    );
  }
}

// ────────────────────────────────────────────────────────────
// DELETE /api/webhooks/[id] — delete a webhook (verify ownership)
// ────────────────────────────────────────────────────────────
export async function DELETE(
  _req: Request,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const session = await getServerSession(authOptions);
    if (!session || !session.user || !(session.user as any).id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const userId = (session.user as any).id;
    const { id } = await context.params;

    // Verify ownership before deleting
    const existing = await db.webhookConnection.findFirst({
      where: { id, userId },
    });

    if (!existing) {
      return NextResponse.json({ error: "Webhook not found" }, { status: 404 });
    }

    await db.webhookConnection.delete({ where: { id } });

    return NextResponse.json({ success: true });
  } catch (error: any) {
    console.error("DELETE /api/webhooks/[id] error:", error);
    return NextResponse.json(
      { error: "Internal Server Error", details: error.message },
      { status: 500 }
    );
  }
}
