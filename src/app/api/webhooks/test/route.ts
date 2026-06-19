import { NextResponse } from "next/server";
import { getServerSession } from "next-auth/next";
import { authOptions } from "@/lib/auth";
import { db } from "@/lib/db";
import crypto from "crypto";

// ────────────────────────────────────────────────────────────
// POST /api/webhooks/test — test-fire a webhook by { webhookId }
// ────────────────────────────────────────────────────────────
export async function POST(req: Request) {
  try {
    const session = await getServerSession(authOptions);
    if (!session || !session.user || !(session.user as any).id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const userId = (session.user as any).id;
    const body = await req.json();
    const { webhookId } = body;

    if (!webhookId) {
      return NextResponse.json({ error: "webhookId is required" }, { status: 400 });
    }

    // 1. Look up and verify ownership
    const webhook = await db.webhookConnection.findFirst({
      where: { id: webhookId, userId },
    });

    if (!webhook) {
      return NextResponse.json({ error: "Webhook not found" }, { status: 404 });
    }

    // 2. Parse custom headers
    let parsedHeaders: Record<string, string> = {};
    if (webhook.headers) {
      try {
        parsedHeaders = JSON.parse(webhook.headers);
      } catch {
        // Ignore malformed headers — proceed without them
        console.warn(`Webhook ${webhookId}: failed to parse headers JSON, ignoring.`);
      }
    }

    // 3. Build test payload
    const testPayload = {
      event: "test",
      source: "repeatless",
      timestamp: new Date().toISOString(),
      message: "This is a test ping from Repeatless Workflow Automation",
      webhook: { id: webhook.id, name: webhook.name },
    };

    // 4. Build fetch options based on method
    const method = webhook.method || "POST";
    let fetchUrl = webhook.url;
    const fetchHeaders: Record<string, string> = {
      ...parsedHeaders,
      "Content-Type": "application/json",
      "User-Agent": "Repeatless-Webhook/1.0",
    };
    let fetchBody: string | undefined;

    if (method === "GET") {
      // Append payload as a query param (JSON-encoded)
      const sep = fetchUrl.includes("?") ? "&" : "?";
      fetchUrl = `${fetchUrl}${sep}payload=${encodeURIComponent(JSON.stringify(testPayload))}`;
    } else {
      fetchBody = JSON.stringify(testPayload);
    }

    // 5. Add HMAC-SHA256 signature if secret is set
    if (webhook.secret) {
      const payloadStr = fetchBody || JSON.stringify(testPayload);
      const signature = crypto
        .createHmac("sha256", webhook.secret)
        .update(payloadStr)
        .digest("hex");
      fetchHeaders["X-Repeatless-Signature"] = `sha256=${signature}`;
    }

    // 6. Fetch with 10-second timeout via AbortController
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 10_000);

    let response: Response;
    try {
      response = await fetch(fetchUrl, {
        method,
        headers: fetchHeaders,
        body: fetchBody,
        signal: controller.signal,
      });
    } catch (fetchErr: any) {
      clearTimeout(timeoutId);

      // 7. Network / timeout error — update webhook record and return gracefully
      await db.webhookConnection.update({
        where: { id: webhookId },
        data: {
          lastTestedAt: new Date(),
          lastTestStatus: "error",
          lastTestCode: 0,
        },
      });

      return NextResponse.json({
        success: false,
        statusCode: 0,
        message: "Connection failed: " + fetchErr.message,
      });
    }

    clearTimeout(timeoutId);

    // 7. Update webhook record with test result
    await db.webhookConnection.update({
      where: { id: webhookId },
      data: {
        lastTestedAt: new Date(),
        lastTestStatus: response.ok ? "success" : "error",
        lastTestCode: response.status,
      },
    });

    // 8. Return result
    return NextResponse.json({
      success: response.ok,
      statusCode: response.status,
      message: response.ok
        ? "Webhook delivered successfully"
        : `Server responded with ${response.status}`,
    });
  } catch (error: any) {
    console.error("POST /api/webhooks/test error:", error);
    return NextResponse.json(
      { error: "Internal Server Error", details: error.message },
      { status: 500 }
    );
  }
}
