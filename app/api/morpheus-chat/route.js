// app/api/morpheus-chat/route.js
// Local backend for this product's "Ask Morpheus" widget. Deliberately
// self-contained (own Anthropic call, no dependency on Hyperion) so a
// Hyperion outage never takes down chat in a live customer product.
import { NextResponse } from "next/server";

export async function POST(request) {
  try {
    const { system, messages } = await request.json();
    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) {
      return NextResponse.json({ error: "ANTHROPIC_API_KEY not configured" }, { status: 500 });
    }
    const res = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: "claude-haiku-4-5-20251001",
        max_tokens: 1024,
        system,
        messages,
      }),
    });
    if (!res.ok) {
      const errBody = await res.text().catch(() => "");
      return NextResponse.json({ error: `Anthropic API error ${res.status}: ${errBody}` }, { status: 500 });
    }
    const data = await res.json();
    return NextResponse.json({ text: data.content?.[0]?.text || "" });
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
