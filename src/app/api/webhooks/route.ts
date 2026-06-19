import { NextResponse } from "next/server";
import { getServerSession } from "next-auth/next";
import { authOptions } from "@/lib/auth";
import { db } from "@/lib/db";

// ────────────────────────────────────────────────────────────
// GET /api/webhooks — list all webhook connections for the user
// ────────────────────────────────────────────────────────────
export async function GET() {
  try {
    const session = await getServerSession(authOptions);
    if (!session || !session.user || !(session.user as any).id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const userId = (session.user as any).id;

    const webhooks = await db.webhookConnection.findMany({
      where: { userId },
      orderBy: { createdAt: "desc" },
    });

    return NextResponse.json({ webhooks });
  } catch (error: any) {
    console.error("GET /api/webhooks error:", error);
    return NextResponse.json(
      { error: "Internal Server Error", details: error.message },
      { status: 500 }
    );
  }
}

// ────────────────────────────────────────────────────────────
// POST /api/webhooks — create a new webhook connection
// Body: { name, description?, url, method?, headers?, emoji?, secret? }
// ────────────────────────────────────────────────────────────
export async function POST(req: Request) {
  try {
    const session = await getServerSession(authOptions);
    if (!session || !session.user || !(session.user as any).id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const userId = (session.user as any).id;
    const body = await req.json();

    const {
      name,
      description,
      url,
      method = "POST",
      headers,
      emoji = "🔗",
      secret,
    } = body;

    // Validate required fields
    if (!name || typeof name !== "string" || !name.trim()) {
      return NextResponse.json({ error: "name is required" }, { status: 400 });
    }

    if (!url || typeof url !== "string") {
      return NextResponse.json({ error: "url is required" }, { status: 400 });
    }

    // Validate URL starts with http:// or https://
    if (!url.startsWith("http://") && !url.startsWith("https://")) {
      return NextResponse.json(
        { error: "url must start with http:// or https://" },
        { status: 400 }
      );
    }

    // Validate headers is valid JSON string if provided
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

    const webhook = await db.webhookConnection.create({
      data: {
        userId,
        name: name.trim(),
        description: description || null,
        url,
        method: method || "POST",
        headers: headers || null,
        emoji: emoji || "🔗",
        secret: secret || null,
      },
    });

    return NextResponse.json({ webhook }, { status: 201 });
  } catch (error: any) {
    console.error("POST /api/webhooks error:", error);
    return NextResponse.json(
      { error: "Internal Server Error", details: error.message },
      { status: 500 }
    );
  }
}
