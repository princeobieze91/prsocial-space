import { auth } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";

export async function POST(req: Request) {
  try {
    // 1. Authenticate the request on the backend
    const { userId } = await auth();
    if (!userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // 2. Parse payload arguments from dashboard frontend
    const { topic, tone } = await req.json();
    if (!topic) {
      return NextResponse.json({ error: "Topic is required" }, { status: 400 });
    }

    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      return NextResponse.json({ error: "Gemini API key is not configured on the server." }, { status: 500 });
    }

    // 3. Formulate the highly structured structural prompt for the AI
    const systemInstruction =
      "You are an expert social media content writer. " +
      "You output ONLY structured JSON with exact platform optimizations. " +
      "Do not include any Markdown syntax wrappers, no backticks (```), and no extra trailing symbols outside the JSON schema.";

    const prompt = `
      Topic: "${topic}"
      Tone of voice: "${tone || "professional"}"

      Generate highly optimized social media copy matching this topic and tone. Your output must strictly be a JSON object containing these keys:
      {
        "linkedin": "A professional post outlining insights, lessons, or stories. Max 500 characters. Use bullet points and appropriate spacing.",
        "twitter": "A punchy, viral tweet under 280 characters with relevant hashtags.",
        "instagram": "An engaging, visual-oriented caption. Focus on punchy hooks, storytelling, and list 5 target hashtags."
      }
    `;

    // 4. Request generation using Google Gemini API endpoint
    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${apiKey}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contents: [{ parts: [{ text: prompt }] }],
          generationConfig: {
            responseMimeType: "application/json",
          },
          systemInstruction: { parts: [{ text: systemInstruction }] },
        }),
        // Don't let a slow upstream hang the request.
        signal: AbortSignal.timeout(15_000),
      }
    );

    if (!response.ok) {
      const errBody = await response.text();
      return NextResponse.json({ error: `Gemini API returned error: ${errBody}` }, { status: response.status });
    }

    const data = await response.json();
    const rawText = data.candidates?.[0]?.content?.parts?.[0]?.text;

    if (!rawText) {
      throw new Error("No output response returned from Gemini.");
    }

    // 5. Safely clean and parse JSON response payload (strip any ``` fences)
    const cleanedText = rawText
      .trim()
      .replace(/^```(?:json)?\s*/i, "")
      .replace(/```\s*$/, "");
    const parsedData = JSON.parse(cleanedText);

    return NextResponse.json(parsedData);
  } catch (error: any) {
    if (error?.name === "TimeoutError") {
      return NextResponse.json({ error: "Gemini request timed out." }, { status: 504 });
    }
    console.error("Backend Post API Error:", error);
    return NextResponse.json(
      { error: error.message || "Failed to generate social media content" },
      { status: 500 }
    );
  }
}

export function GET() {
  return NextResponse.json(
    { error: "Method Not Allowed" },
    {
      status: 405,
      headers: { Allow: "POST" },
    }
  );
}
