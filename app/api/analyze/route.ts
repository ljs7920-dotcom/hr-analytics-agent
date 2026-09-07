import { NextRequest, NextResponse } from "next/server";
import { GoogleGenAI } from "@google/genai";
import { findCorpCode, getEmployeeStatus, getExecutiveComp, getFinancials } from "@/lib/opendart";
import { computeMetrics } from "@/lib/metrics";

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

export async function POST(req: NextRequest) {
  try {
    const { corpName, year } = await req.json();
    if (!corpName || !year) {
      return NextResponse.json({ error: "기업명과 연도를 모두 입력하세요." }, { status: 400 });
    }

    const corpCode = findCorpCode(corpName);

    const [employee, execComp, financials] = await Promise.all([
      getEmployeeStatus(corpCode, year),
      getExecutiveComp(corpCode, year),
      getFinancials(corpCode, year),
    ]);

    const metrics = computeMetrics(employee, execComp, financials);

    const response = await ai.models.generateContent({
      model: "gemini-2.5-flash",
      contents:
        `다음은 ${corpName}의 ${year}년 공시 기준 인력·보상·재무 지표입니다:\n\n` +
        JSON.stringify(metrics, null, 2) +
        `\n\n이 데이터만 근거로 HR 담당자가 이해하기 쉽게 핵심 인사이트를 3~5개, 짧은 문장으로 설명해줘. ` +
        `데이터에 없는 값은 추측하지 말고 "해당 공시에 없음"이라고 말해줘.`,
    });

    const analysis = response.text ?? "";

    return NextResponse.json({ corpName, year, metrics, analysis });
  } catch (e: any) {
    return NextResponse.json({ error: e.message || "알 수 없는 오류" }, { status: 500 });
  }
}
