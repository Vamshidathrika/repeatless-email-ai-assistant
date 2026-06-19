import { NextResponse } from "next/server";
import { getServerSession } from "next-auth/next";
import { authOptions } from "@/lib/auth";
import { db } from "@/lib/db";

export async function POST() {
  try {
    const session = await getServerSession(authOptions);

    if (!session || !session.user || !(session.user as any).id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const userId = (session.user as any).id;

    await db.account.deleteMany({
      where: { userId, provider: "slack" },
    });

    return NextResponse.json({ success: true });
  } catch (error: any) {
    console.error("Slack disconnect error:", error);
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
}
