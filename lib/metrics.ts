function toNumber(v: any): number {
  if (!v) return 0;
  const n = parseInt(String(v).replace(/,/g, ""), 10);
  return isNaN(n) ? 0 : n;
}

type Metric = { display: string; exact: string } | null;

function metricValue(display: string | null, exact: string | null): Metric {
  if (display === null || exact === null) return null;
  return { display, exact };
}

// 명/% 처럼 짧은 값은 요약형과 정확한 값이 어차피 똑같습니다.
function formatWithUnit(n: number | null, unit: string): string | null {
  if (n === null) return null;
  return `${n.toLocaleString("ko-KR")}${unit}`;
}

// 정확한 원(₩) 금액: 1000단위 콤마 + "원" (예: "300,870,903,000,000원")
function formatWonExact(n: number | null): string | null {
  if (n === null) return null;
  return `${n.toLocaleString("ko-KR")}원`;
}

// 표에서 한눈에 보기 좋은 요약형: "조/억/만원" 단위 (예: "300조 8,709억원")
function formatWonCompact(n: number | null): string | null {
  if (n === null) return null;
  const isNeg = n < 0;
  let rest = Math.abs(Math.round(n));

  const jo = Math.floor(rest / 1_0000_0000_0000);
  rest %= 1_0000_0000_0000;
  const eok = Math.floor(rest / 1_0000_0000);
  rest %= 1_0000_0000;
  const man = Math.floor(rest / 1_0000);
  rest %= 1_0000;

  const parts: string[] = [];
  if (jo) parts.push(`${jo.toLocaleString("ko-KR")}조`);
  if (eok) parts.push(`${eok.toLocaleString("ko-KR")}억`);
  if (man) parts.push(`${man.toLocaleString("ko-KR")}만`);
  if (rest || parts.length === 0) parts.push(`${rest.toLocaleString("ko-KR")}`);

  return (isNeg ? "-" : "") + parts.join(" ") + "원";
}

// 원 단위 금액은 {display: 요약형, exact: 정확한 숫자} 쌍으로 반환합니다.
// 화면에는 display를 보여주고, 마우스를 올리면(hover) exact가 툴팁으로 뜨고,
// 엑셀로 복사할 때는 exact(정확한 숫자)가 복사됩니다.
function formatWon(n: number | null): Metric {
  return metricValue(formatWonCompact(n), formatWonExact(n));
}

// 명/% 등 이미 짧은 값은 display와 exact가 같습니다.
function formatSimple(s: string | null): Metric {
  return metricValue(s, s);
}

// 한글 사이에 일반 공백뿐 아니라 전각 공백("합　계") 등이 섞여 오는 경우도 있어
// 모든 공백류 문자를 제거하고 비교합니다.
function normalizeLabel(s: any): string {
  return String(s || "").replace(/\s+/g, "");
}

// OpenDART 직원현황(empSttus) 응답에는 "DX 남", "DX 여", "성별합계 남", "성별합계 여", "합계" 같은
// 부서별·성별 소계 행이 섞여서 옵니다. 전부 더하면 중복 집계가 되므로, "합계"라고 표시된
// 행 하나만 뽑아서 씁니다. (그런 행이 없는 회사는 어차피 행이 1개뿐인 경우가 많아 그 행을 그대로 씁니다.)
function pickEmployeeTotalRow(employee: any[]): any | null {
  const total = employee.find((e) => normalizeLabel(e.fo_bbm) === "합계");
  if (total) return total;
  if (employee.length === 1) return employee[0];
  return null;
}

// 회사/연도에 따라 "매출액"이 아니라 "수익(매출액)", 금융/보험사는 "영업수익"으로 표기되기도 합니다.
// 우선순위대로 먼저 정확히 일치하는 계정명을 찾고, 그래도 없으면 "매출액"이 포함된 계정명을 찾습니다.
function findRevenueItem(financials: any[]) {
  const candidates = ["매출액", "수익(매출액)", "영업수익"];
  for (const name of candidates) {
    const hit = financials.find((f) => f.account_nm === name);
    if (hit) return hit;
  }
  return financials.find((f) => f.account_nm && f.account_nm.includes("매출액")) || null;
}

// OpenDART 응답의 필드명은 보고서마다 표기가 조금씩 다를 수 있습니다.
// 실제 응답을 한 번 콘솔에 찍어보고 아래 필드명이 다르면 맞춰서 수정하세요.
export function computeMetrics(
  employee: any[],
  execComp: any[],
  financials: any[]
) {
  const empTotal = pickEmployeeTotalRow(employee);

  let totalEmployees: number | null = null;
  let regularCount: number | null = null;
  let contractCount: number | null = null;
  let avgTenure: string | null = null;
  let totalSalaryWon: number | null = null;
  let avgSalaryFieldWon: number | null = null;

  if (empTotal) {
    totalEmployees = toNumber(empTotal.sm) || null;
    regularCount = toNumber(empTotal.rgllbr_co) || null; // 기간의 정함이 없는 근로자(정규직)
    contractCount = toNumber(empTotal.cnttk_co) || null; // 기간제근로자
    avgTenure = empTotal.avrg_cnwk_sdytrn ? String(empTotal.avrg_cnwk_sdytrn).trim() : null;
    // 연간급여총액/1인평균급여액은 OpenDART에서 "백만원" 단위로 내려오므로 100만을 곱해 원 단위로 바꿉니다.
    totalSalaryWon = toNumber(empTotal.fyer_salary_totamt) * 1_000_000 || null;
    avgSalaryFieldWon = toNumber(empTotal.jan_salary_am) * 1_000_000 || null;
  } else if (employee.length > 1) {
    // "합계" 행을 못 찾은 경우의 최후 수단: 소계로 보이는("합계"라는 글자가 들어간) 행은 빼고
    // 나머지 부서/성별 행만 더합니다. (평균근속연수는 단순 평균이 부정확할 수 있어 생략합니다.)
    const rows = employee.filter((e) => !normalizeLabel(e.fo_bbm).includes("합계"));
    totalEmployees = rows.reduce((sum, e) => sum + toNumber(e.sm), 0) || null;
    regularCount = rows.reduce((sum, e) => sum + toNumber(e.rgllbr_co), 0) || null;
    contractCount = rows.reduce((sum, e) => sum + toNumber(e.cnttk_co), 0) || null;
    const summedSalary = rows.reduce((sum, e) => sum + toNumber(e.fyer_salary_totamt), 0);
    totalSalaryWon = summedSalary ? summedSalary * 1_000_000 : null;
  }

  const avgSalaryWon =
    avgSalaryFieldWon || (totalEmployees && totalSalaryWon ? Math.round(totalSalaryWon / totalEmployees) : null);

  const revenueItem = findRevenueItem(financials);
  const revenue = revenueItem ? toNumber(revenueItem.thstrm_amount) : null;
  const revenueAccountName = revenueItem ? revenueItem.account_nm : null;

  // 주의: 이 API(hmvAuditAllSttus)의 정확한 필드명을 아직 실제 응답으로 검증하지 못했습니다.
  // 자주 쓰이는 후보 필드명 여러 개를 시도하도록 방어적으로 짜뒀지만, 실제 값이 계속 "-"로
  // 나온다면 이 필드명이 다르다는 뜻이니 알려주세요.
  const execTotalComp = execComp.reduce(
    (sum, e) =>
      sum +
      toNumber(e.mendng_totamt || e.pymt_totamt || e.jan_pymnt_amt || e.gnrmst_pymntamt),
    0
  );

  const laborCostRatio =
    revenue && totalSalaryWon ? +((totalSalaryWon / revenue) * 100).toFixed(2) : null;

  return {
    총직원수: formatSimple(formatWithUnit(totalEmployees, "명")),
    "정규직(기간의 정함이 없는 근로자)": formatSimple(formatWithUnit(regularCount, "명")),
    기간제근로자: formatSimple(formatWithUnit(contractCount, "명")),
    평균근속연수: formatSimple(avgTenure ? `${avgTenure}년` : null),
    "1인평균급여": formatWon(avgSalaryWon),
    연간급여총액: formatWon(totalSalaryWon),
    매출액: formatWon(revenue),
    "매출액 산출 근거 계정명": formatSimple(revenueAccountName),
    "인건비/매출 비중": formatSimple(laborCostRatio === null ? null : `${laborCostRatio}%`),
    등기임원보수총액: formatWon(execTotalComp || null),
  };
}
