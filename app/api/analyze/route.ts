import { NextRequest, NextResponse } from "next/server";
import { GoogleGenAI } from "@google/genai";
import { findCorpCode, getEmployeeStatus, getExecutiveComp, getFinancials } from "@/lib/opendart";
import { computeMetrics } from "@/lib/metrics";

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

const REPORT_LABELS: Record<string, string> = {
  "11011": "사업보고서(연간)",
  "11012": "반기보고서",
  "11013": "1분기보고서",
  "11014": "3분기보고서",
};

export async function POST(req: NextRequest) {
  try {
    const { corpName, year, reprtCode = "11011" } = await req.json();
    if (!corpName || !year) {
      return NextResponse.json({ error: "기업명과 연도를 모두 입력하세요." }, { status: 400 });
    }

    const reportLabel = REPORT_LABELS[reprtCode] || "사업보고서(연간)";
    const corpCode = findCorpCode(corpName);

    const [employee, execComp, financials] = await Promise.all([
      getEmployeeStatus(corpCode, year, reprtCode),
      getExecutiveComp(corpCode, year, reprtCode),
      getFinancials(corpCode, year, reprtCode),
    ]);

    const metrics = computeMetrics(employee, execComp, financials);

    // 이 공시 원문의 접수번호(rcept_no)를 찾아서 DART 원문 페이지 링크를 만듭니다.
    // 직원현황/재무제표/임원보수 중 데이터가 있는 곳 아무 데서나 가져오면 됩니다.
    const rceptNo =
      employee[0]?.rcept_no || financials[0]?.rcept_no || execComp[0]?.rcept_no || null;
    const reportUrl = rceptNo ? `https://dart.fss.or.kr/dsaf001/main.do?rcpNo=${rceptNo}` : null;

    const response = await ai.models.generateContent({
      model: "gemini-3.5-flash-lite",
      contents:
        `다음은 ${corpName}의 ${year}년 ${reportLabel} 기준 인력·보상·재무 지표입니다:\n\n` +
        JSON.stringify(metrics, null, 2) +
        `\n\n이 데이터만 근거로 HR 담당자가 이해하기 쉽게 핵심 인사이트를 3~5개, 짧은 문장으로 설명해줘. ` +
        `데이터에 없는 값은 추측하지 말고 "해당 공시에 없음"이라고 말해줘. ` +
        `분기·반기 보고서는 그 기간까지의 누적/현재 값일 수 있다는 점도 참고해서 설명해줘.`,
    });

    const analysis = response.text ?? "";

    return NextResponse.json({ corpName, year, reprtCode, reportLabel, metrics, analysis, reportUrl });
  } catch (e: any) {
    return NextResponse.json({ error: e.message || "알 수 없는 오류" }, { status: 500 });
  }
}
