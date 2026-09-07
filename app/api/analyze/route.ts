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
    const { corpName, year, reprtCode = "11011", yearsCount = 1 } = await req.json();
    if (!corpName || !year) {
      return NextResponse.json({ error: "기업명과 연도를 모두 입력하세요." }, { status: 400 });
    }

    const n = Math.min(Math.max(parseInt(yearsCount, 10) || 1, 1), 5);
    const multiYear = n > 1;

    const reportLabel = REPORT_LABELS[reprtCode] || "사업보고서(연간)";
    const corpCode = findCorpCode(corpName);

    // 선택한 개수만큼 연도를 준비합니다. (예: n=3, 선택 연도 2024 -> 2022, 2023, 2024)
    const baseYear = parseInt(year, 10);
    const years = Array.from({ length: n }, (_, i) => String(baseYear - (n - 1 - i)));

    const perYearData = await Promise.all(
      years.map(async (y) => {
        const [employee, execComp, financials] = await Promise.all([
          getEmployeeStatus(corpCode, y, reprtCode),
          getExecutiveComp(corpCode, y, reprtCode),
          getFinancials(corpCode, y, reprtCode),
        ]);
        return { year: y, employee, execComp, financials };
      })
    );

    const metricsByYear: Record<string, ReturnType<typeof computeMetrics>> = {};
    for (const d of perYearData) {
      metricsByYear[d.year] = computeMetrics(d.employee, d.execComp, d.financials);
    }

    // 공시 원문 링크는 가장 최근(선택한) 연도 기준으로 만듭니다.
    const latest = perYearData[perYearData.length - 1];
    const rceptNo =
      latest.employee[0]?.rcept_no || latest.financials[0]?.rcept_no || latest.execComp[0]?.rcept_no || null;
    const reportUrl = rceptNo ? `https://dart.fss.or.kr/dsaf001/main.do?rcpNo=${rceptNo}` : null;

    // AI에게는 화면 표시용 요약형이 아니라 "정확한 숫자(exact)"만 추려서 전달합니다.
    // 이렇게 해야 AI가 "조/억" 요약형을 다시 해석하다 실수하지 않고 정확한 값을 그대로 인용합니다.
    const exactMetricsByYear: Record<string, Record<string, string | null>> = {};
    for (const [y, metrics] of Object.entries(metricsByYear)) {
      exactMetricsByYear[y] = Object.fromEntries(
        Object.entries(metrics).map(([k, v]) => [k, v ? v.exact : null])
      );
    }

    const promptIntro = multiYear
      ? `다음은 ${corpName}의 ${years.join("~")}년(${reportLabel} 기준) 연도별 인력·보상·재무 지표입니다. 연도를 키(key)로 하는 JSON입니다:`
      : `다음은 ${corpName}의 ${year}년 ${reportLabel} 기준 인력·보상·재무 지표입니다:`;

    const promptTail = multiYear
      ? `이 데이터만 근거로 HR 담당자가 이해하기 쉽게 연도별 추이(증가/감소 흐름)를 3~5개 핵심 포인트로 짧게 설명해줘. `
      : `이 데이터만 근거로 HR 담당자가 이해하기 쉽게 핵심 인사이트를 3~5개, 짧은 문장으로 설명해줘. `;

    const response = await ai.models.generateContent({
      model: "gemini-3.5-flash-lite",
      contents:
        `${promptIntro}\n\n` +
        JSON.stringify(exactMetricsByYear, null, 2) +
        `\n\n${promptTail}` +
        `데이터에 없는 값은 추측하지 말고 "해당 공시에 없음"이라고 말해줘. ` +
        `분기·반기 보고서는 그 기간까지의 누적/현재 값일 수 있다는 점도 참고해서 설명해줘.`,
    });

    const analysis = response.text ?? "";

    return NextResponse.json({
      corpName,
      years,
      reprtCode,
      reportLabel,
      metricsByYear,
      analysis,
      reportUrl,
    });
  } catch (e: any) {
    return NextResponse.json({ error: e.message || "알 수 없는 오류" }, { status: 500 });
  }
}
