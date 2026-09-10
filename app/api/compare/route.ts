import { NextRequest, NextResponse } from "next/server";
import { GoogleGenAI } from "@google/genai";

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

// 화면 표시용 {display, exact} 구조에서 exact(정확한 값)만 뽑아서 AI에게 넘길 형태로 바꿉니다.
function toExactMetrics(metricsByYear: Record<string, any>) {
  const out: Record<string, Record<string, string | null>> = {};
  for (const [year, metrics] of Object.entries(metricsByYear)) {
    out[year] = Object.fromEntries(
      Object.entries(metrics as Record<string, any>).map(([k, v]) => [k, v ? v.exact : null])
    );
  }
  return out;
}

export async function POST(req: NextRequest) {
  try {
    const { companyA, companyB } = await req.json();
    if (!companyA?.metricsByYear || !companyB?.metricsByYear) {
      return NextResponse.json({ error: "비교할 두 기업의 데이터가 필요합니다." }, { status: 400 });
    }

    const prompt =
      `다음은 두 기업의 인력·보상·재무 지표입니다. 연도를 키(key)로 하는 JSON입니다.\n\n` +
      `[${companyA.corpName} (${companyA.reportLabel})]\n` +
      JSON.stringify(toExactMetrics(companyA.metricsByYear), null, 2) +
      `\n\n[${companyB.corpName} (${companyB.reportLabel})]\n` +
      JSON.stringify(toExactMetrics(companyB.metricsByYear), null, 2) +
      `\n\n이 데이터만 근거로, HR 담당자가 두 기업을 비교할 때 참고할 만한 핵심 포인트를 3~5개, ` +
      `짧은 문장으로 설명해줘. 인력 규모, 급여 수준, 인건비 비중, 실적 흐름 등을 비교해줘. ` +
      `데이터에 없는 값은 추측하지 말고 "해당 공시에 없음"이라고 말해줘.`;

    const response = await ai.models.generateContent({
      model: "gemini-3.5-flash-lite",
      contents: prompt,
    });

    return NextResponse.json({ comparison: response.text ?? "" });
  } catch (e: any) {
    return NextResponse.json({ error: e.message || "알 수 없는 오류" }, { status: 500 });
  }
}
