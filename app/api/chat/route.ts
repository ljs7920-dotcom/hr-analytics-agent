import { NextRequest, NextResponse } from "next/server";
import { GoogleGenAI } from "@google/genai";

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

// 화면에서 보내는 형식: { role: "user" | "assistant", content: string }[]
// Gemini가 요구하는 형식: { role: "user" | "model", parts: [{ text }] }[]
function toGeminiContents(messages: { role: string; content: string }[]) {
  return messages.map((m) => ({
    role: m.role === "assistant" ? "model" : "user",
    parts: [{ text: m.content }],
  }));
}

export async function POST(req: NextRequest) {
  try {
    const { messages, context } = await req.json();

    const response = await ai.models.generateContent({
      model: "gemini-3.6-flash",
      contents: toGeminiContents(messages),
      config: {
        systemInstruction:
          "당신은 HR 데이터 분석 어시스턴트입니다. 아래 JSON 데이터에 있는 내용만 근거로 답변하세요. " +
          "데이터에 없는 내용은 모른다고 솔직히 답하세요.\n\n" +
          JSON.stringify(context),
      },
    });

    const reply = response.text ?? "";

    return NextResponse.json({ reply });
  } catch (e: any) {
    return NextResponse.json({ error: e.message || "알 수 없는 오류" }, { status: 500 });
  }
}
