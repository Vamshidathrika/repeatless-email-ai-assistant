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

    // Delete all Jira accounts for this user
    await db.account.deleteMany({
      where: { userId, provider: "jira" },
    });

    return NextResponse.json({ success: true });
  } catch (error: any) {
    console.error("Jira disconnect error:", error);
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
}
