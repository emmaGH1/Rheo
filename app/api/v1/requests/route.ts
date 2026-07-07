import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export async function GET(req: NextRequest) {
  try {
    const url = process.env.SUPABASE_URL;
    const key = process.env.SUPABASE_SERVICE_ROLE_KEY;

    if (!url || !key) {
      return NextResponse.json(
        { error: "Supabase config missing on server." },
        { status: 500 }
      );
    }

    const supabase = createClient(url, key);

    // Fetch the 50 most recent proxy requests
    const { data, error } = await supabase
      .from("proxy_requests")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(50);

    if (error) {
      console.error("[API Requests] Supabase select error:", error.message);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({
      success: true,
      requests: data ?? [],
    });

  } catch (err: any) {
    console.error("[API Requests] Internal error:", err);
    return NextResponse.json({ error: err.message || String(err) }, { status: 500 });
  }
}
