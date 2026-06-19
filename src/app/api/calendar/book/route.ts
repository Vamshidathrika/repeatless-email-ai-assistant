import { NextResponse } from "next/server";
import { getServerSession } from "next-auth/next";
import { authOptions } from "@/lib/auth";
import { getCalendarClient } from "@/lib/calendar";
import crypto from "crypto";

export async function POST(req: Request) {
  try {
    const session = await getServerSession(authOptions);

    if (!session || !session.user || !(session.user as any).id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const userId = (session.user as any).id;
    const body = await req.json();
    const { title, description, startTime, duration, clientEmail } = body;

    if (!title || !startTime || !duration) {
      return NextResponse.json({ error: "Missing required fields" }, { status: 400 });
    }

    let calendar;
    try {
      calendar = await getCalendarClient(userId);
    } catch (e: any) {
      return NextResponse.json({ error: "Google account not connected or configured" }, { status: 400 });
    }

    const start = new Date(startTime);
    const end = new Date(start.getTime() + duration * 60 * 1000);

    const event = {
      summary: title,
      description: description || "Scheduled via Repeatless AI Assistant",
      start: {
        dateTime: start.toISOString(),
        timeZone: "UTC",
      },
      end: {
        dateTime: end.toISOString(),
        timeZone: "UTC",
      },
      attendees: clientEmail ? [{ email: clientEmail }] : [],
      conferenceData: {
        createRequest: {
          requestId: crypto.randomUUID(),
          conferenceSolutionKey: {
            type: "hangoutsMeet",
          },
        },
      },
    };

    try {
      const response = await calendar.events.insert({
        calendarId: "primary",
        requestBody: event,
        conferenceDataVersion: 1,
      });

      const eventData = response.data;
      const hangoutLink = eventData.hangoutLink || null;
      const htmlLink = eventData.htmlLink || null;

      return NextResponse.json({
        success: true,
        eventId: eventData.id,
        hangoutLink,
        htmlLink,
        summary: eventData.summary,
        start: eventData.start?.dateTime,
        end: eventData.end?.dateTime,
      });
    } catch (apiError: any) {
      console.error("Google Calendar API error:", apiError);
      
      // Check for scope or permission errors
      if (apiError.status === 403 || (apiError.message && apiError.message.includes("insufficient"))) {
        return NextResponse.json({ 
          error: "insufficient_scopes", 
          details: "Calendar permission not granted. Please re-authenticate and allow Calendar access." 
        }, { status: 403 });
      }

      return NextResponse.json({ 
        error: "Failed to schedule meeting", 
        details: apiError.message || "Unknown Calendar API error" 
      }, { status: 500 });
    }

  } catch (error: any) {
    console.error("Calendar booking route error:", error);
    return NextResponse.json({ error: "Internal Server Error", details: error.message }, { status: 500 });
  }
}
