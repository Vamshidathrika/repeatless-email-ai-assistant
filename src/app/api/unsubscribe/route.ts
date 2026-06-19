import { NextResponse } from "next/server";
import { getServerSession } from "next-auth/next";
import { authOptions } from "@/lib/auth";

export async function POST(req: Request) {
  try {
    const session = await getServerSession(authOptions);

    if (!session || !session.user || !(session.user as any).id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { urls } = await req.json().catch(() => ({ urls: [] }));
    if (!urls || !Array.isArray(urls)) {
      return NextResponse.json({ error: "Invalid urls parameter" }, { status: 400 });
    }

    const results = await Promise.all(
      urls.map(async (url: string) => {
        if (!url || typeof url !== "string") {
          return { url, success: false, error: "Invalid URL string" };
        }

        if (!url.startsWith("http://") && !url.startsWith("https://")) {
          // E.g. mailto link or others
          return { url, success: false, openUrl: true };
        }

        try {
          console.log(`[Unsubscribe API] Attempting POST to: ${url}`);
          // Send RFC 8058 compliant POST request
          const postRes = await fetch(url, {
            method: "POST",
            headers: {
              "Content-Type": "application/x-www-form-urlencoded",
              "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
            },
            body: "List-Unsubscribe=One-Click",
          });

          if (postRes.status >= 200 && postRes.status < 300) {
            console.log(`[Unsubscribe API] POST Succeeded: Status ${postRes.status}`);
            return { url, success: true, method: "POST" };
          }

          console.warn(`[Unsubscribe API] POST Failed: Status ${postRes.status}. Trying GET...`);
          
          // If POST fails, try GET (e.g. standard unsubscribe links)
          const getRes = await fetch(url, {
            method: "GET",
            headers: {
              "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
            },
          });

          if (getRes.status >= 200 && getRes.status < 300) {
            console.log(`[Unsubscribe API] GET Succeeded: Status ${getRes.status}`);
            return { url, success: true, method: "GET" };
          }

          console.error(`[Unsubscribe API] GET Failed too: Status ${getRes.status}`);
          return { url, success: false, openUrl: true, error: `Status ${getRes.status}` };
        } catch (err: any) {
          console.error(`[Unsubscribe API] Fetch error for ${url}:`, err);
          return { url, success: false, openUrl: true, error: err.message || String(err) };
        }
      })
    );

    return NextResponse.json({
      success: true,
      results,
    });
  } catch (error: any) {
    console.error("Unsubscribe API Error:", error);
    return NextResponse.json(
      { error: error.message || "Internal server error" },
      { status: 500 }
    );
  }
}
