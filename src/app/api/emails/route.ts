import { NextResponse } from "next/server";
import { getServerSession } from "next-auth/next";
import { authOptions } from "@/lib/auth";
import { db } from "@/lib/db";

export async function GET(req: Request) {
  try {
    const session = await getServerSession(authOptions);

    if (!session || !session.user || !(session.user as any).id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const userId = (session.user as any).id;
    const { searchParams } = new URL(req.url);

    const category = searchParams.get("category");
    const search = searchParams.get("search");
    const includeDuplicates = searchParams.get("includeDuplicates") === "true";

    // Build Prisma query filters
    const whereClause: any = {
      userId,
    };

    if (!includeDuplicates) {
      whereClause.isDuplicate = false;
    }

    if (category) {
      whereClause.summary = {
        category: category,
      };
    }

    if (search) {
      whereClause.OR = [
        { subject: { contains: search } },
        { sender: { contains: search } },
        { bodyContent: { contains: search } },
        {
          summary: {
            OR: [
              { shortSummary: { contains: search } },
              { detailedSummary: { contains: search } },
            ],
          },
        },
      ];
    }

    // Retrieve emails sorted by date desc
    const emails = await db.email.findMany({
      where: whereClause,
      include: {
        summary: true,
      },
      orderBy: {
        date: "desc",
      },
    });

    return NextResponse.json({
      success: true,
      emails,
    });
  } catch (error: any) {
    console.error("Emails Fetch API Error:", error);
    return NextResponse.json(
      { error: error.message || "Failed to fetch emails" },
      { status: 500 }
    );
  }
}
