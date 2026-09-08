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
function formatWon(n: number | null): Metric {
  return metricValue(formatWonCompact(n), formatWonExact(n));
}

// 매출액처럼 워낙 큰 금액은 "만원" 단위까지 보여주면 오히려 지저분해 보여서,
// "조/억원" 단위까지만 반올림해서 보여줍니다. (정확한 값은 hover/엑셀에서 그대로 확인 가능)
function formatWonCompactEokOnly(n: number | null): string | null {
  if (n === null) return null;
  const isNeg = n < 0;
  const eokTotal = Math.round(Math.abs(n) / 1_0000_0000); // 억 단위로 반올림
  const jo = Math.floor(eokTotal / 10000);
  const eok = eokTotal % 10000;

  const parts: string[] = [];
  if (jo) parts.push(`${jo.toLocaleString("ko-KR")}조`);
  parts.push(`${eok.toLocaleString("ko-KR")}억`);

  return (isNeg ? "-" : "") + parts.join(" ") + "원";
}

function formatWonEokOnly(n: number | null): Metric {
  return metricValue(formatWonCompactEokOnly(n), formatWonExact(n));
}

// 연간급여총액/1인평균급여처럼 자잘한 원 단위까지 보여줄 필요 없는 값은
// 천만원 단위로 반올림해서 보여줍니다. (정확한 값은 hover/엑셀에서 그대로 확인 가능)
function formatWonRoundedToChunman(n: number | null): Metric {
  if (n === null) return null;
  const rounded = Math.round(n / 10_000_000) * 10_000_000;
  return metricValue(formatWonCompact(rounded), formatWonExact(n));
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

type EmployeeAggregate = {
  totalEmployees: number | null;
  regularCount: number | null;
  contractCount: number | null;
  totalSalaryWon: number | null; // 원 단위로 이미 환산됨
  avgTenure: string | null; // "12.5" 같은 문자열
};

// 연간급여총액 필드는 회사·연도에 따라 "백만원" 단위의 작은 정수로 오기도 하고,
// 이미 "원" 단위의 큰 숫자로 오기도 합니다(공시 형식이 통일돼있지 않음). 값의 크기로 자동 판별해서,
// 10억 미만이면 "백만원 단위"로 보고 100만을 곱하고, 이미 10억 이상이면 "이미 원 단위"로 보고 그대로 둡니다.
// (실제 회사 급여총액이 10억원 밑으로 내려가는 경우는 사실상 없어서 이 기준으로 안전하게 구분됩니다)
function normalizeWonAmount(raw: number): number {
  if (!raw) return 0;
  return Math.abs(raw) < 1_000_000_000 ? raw * 1_000_000 : raw;
}

// 여러 행(부서/성별)을 하나로 합칠 때 쓰는 함수.
// 인원수, 급여총액은 단순 합산하면 되지만, 근속연수처럼 "평균"인 값은
// 그냥 더하면 틀리기 때문에 인원수(sm)로 가중평균을 냅니다.
// 주의: "1인평균급여액(jan_salary_am)" 필드는 회사·연도별로 단위가 자꾸 어긋나는 문제가
// 있어서 더 이상 이 필드를 직접 쓰지 않고, 연간급여총액 ÷ 총직원수로 직접 계산합니다.
// (공시상 "1인평균급여"는 기말 인원이 아니라 "평균 재직자 수" 기준이라 실제 공시값과
// 1~3% 정도 차이가 날 수 있습니다.)
function aggregateRows(rows: any[]): EmployeeAggregate {
  const totalEmployees = rows.reduce((s, e) => s + toNumber(e.sm), 0) || null;
  const regularCount = rows.reduce((s, e) => s + toNumber(e.rgllbr_co), 0) || null;
  const contractCount = rows.reduce((s, e) => s + toNumber(e.cnttk_co), 0) || null;
  const salarySumRaw = rows.reduce((s, e) => s + toNumber(e.fyer_salary_totamt), 0);
  const totalSalaryWon = salarySumRaw ? normalizeWonAmount(salarySumRaw) : null;

  let tenureNum = 0;
  let tenureDen = 0;
  for (const e of rows) {
    const w = toNumber(e.sm);
    const tenure = parseFloat(String(e.avrg_cnwk_sdytrn || "").trim());
    if (!isNaN(tenure) && w) {
      tenureNum += tenure * w;
      tenureDen += w;
    }
  }
  const avgTenure = tenureDen ? (tenureNum / tenureDen).toFixed(1) : null;

  return { totalEmployees, regularCount, contractCount, totalSalaryWon, avgTenure };
}

function aggregateSingleRow(row: any): EmployeeAggregate {
  return {
    totalEmployees: toNumber(row.sm) || null,
    regularCount: toNumber(row.rgllbr_co) || null,
    contractCount: toNumber(row.cnttk_co) || null,
    totalSalaryWon: normalizeWonAmount(toNumber(row.fyer_salary_totamt)) || null,
    avgTenure: row.avrg_cnwk_sdytrn ? String(row.avrg_cnwk_sdytrn).trim() : null,
  };
}

// OpenDART 직원현황(empSttus) 응답 구조는 연도/회사마다 조금씩 다릅니다:
// - "합계"라는 글자가 정확히 적힌 행이 있는 경우 → 그 행 하나를 그대로 씁니다.
// - "합계" 행 없이 "성별합계"(남/여 각각의 전체 소계) 행만 있는 경우 → 그 두 행을 더합니다.
//   (부서별 개별 행만 더하면 "성별합계"와 중복 집계될 수 있어, 성별합계가 있으면 그것만 씁니다.)
// - 행이 1개뿐인 경우 → 그 행을 그대로 씁니다.
// - 위 경우가 다 아니면 → "합계"라는 글자가 들어간 소계로 보이는 행은 제외하고 나머지를 더합니다.
function pickEmployeeAggregate(employee: any[]): EmployeeAggregate | null {
  if (employee.length === 0) return null;

  // "성별합계"(남/여 소계) 행이 있으면 그걸 우선 씁니다. "합계"라는 글자가 붙은 행은
  // 실제로는 DART가 "성별합계"를 더해서 화면에 보여주는 계산값인 경우가 많아, 이 행을
  // 안정적으로 찾지 못할 때가 있었습니다. 성별합계 방식을 기본으로 쓰면 항상 일관된 결과가 나옵니다.
  const genderTotalRows = employee.filter((e) => normalizeLabel(e.fo_bbm) === "성별합계");
  if (genderTotalRows.length > 0) return aggregateRows(genderTotalRows);

  const byLabel = employee.find((e) => normalizeLabel(e.fo_bbm) === "합계");
  if (byLabel) return aggregateSingleRow(byLabel);

  if (employee.length === 1) return aggregateSingleRow(employee[0]);

  const rows = employee.filter((e) => !normalizeLabel(e.fo_bbm).includes("합계"));
  return aggregateRows(rows);
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

// 영업이익도 매출액과 같은 방식으로 폭넓게 찾습니다. 적자인 해는 "영업손실" 또는
// "영업이익(손실)"이라는 계정명으로 표기되는 경우가 많아 그것까지 후보에 넣습니다.
function findOperatingProfitItem(financials: any[]) {
  const candidates = ["영업이익", "영업이익(손실)", "영업손실"];
  for (const name of candidates) {
    const hit = financials.find((f) => f.account_nm === name);
    if (hit) return hit;
  }
  return financials.find((f) => f.account_nm && f.account_nm.includes("영업이익")) || null;
}

// OpenDART 응답의 필드명은 보고서마다 표기가 조금씩 다를 수 있습니다.
// 실제 응답을 한 번 콘솔에 찍어보고 아래 필드명이 다르면 맞춰서 수정하세요.
export function computeMetrics(
  employee: any[],
  execComp: any[],
  financials: any[]
) {
  const agg = pickEmployeeAggregate(employee);

  const totalEmployees = agg?.totalEmployees ?? null;
  const regularCount = agg?.regularCount ?? null;
  const contractCount = agg?.contractCount ?? null;
  const avgTenure = agg?.avgTenure ?? null;
  const totalSalaryWon = agg?.totalSalaryWon ?? null;

  const avgSalaryWon =
    totalEmployees && totalSalaryWon ? Math.round(totalSalaryWon / totalEmployees) : null;

  const revenueItem = findRevenueItem(financials);
  const revenue = revenueItem ? toNumber(revenueItem.thstrm_amount) : null;
  const revenueAccountName = revenueItem ? revenueItem.account_nm : null;

  const operatingProfitItem = findOperatingProfitItem(financials);
  const operatingProfitRaw = operatingProfitItem ? toNumber(operatingProfitItem.thstrm_amount) : null;
  // 계정명이 "영업손실"이면 적자를 뜻하므로, 표시할 때 음수로 바꿔줍니다.
  const operatingProfit =
    operatingProfitRaw !== null && operatingProfitItem?.account_nm?.includes("손실") && operatingProfitRaw > 0
      ? -operatingProfitRaw
      : operatingProfitRaw;
  const operatingProfitAccountName = operatingProfitItem ? operatingProfitItem.account_nm : null;

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
    "1인평균급여": formatWonRoundedToChunman(avgSalaryWon),
    연간급여총액: formatWonRoundedToChunman(totalSalaryWon),
    매출액: formatWonEokOnly(revenue),
    "매출액 산출 근거 계정명": formatSimple(revenueAccountName),
    영업이익: formatWonEokOnly(operatingProfit),
    "영업이익 산출 근거 계정명": formatSimple(operatingProfitAccountName),
    "인건비/매출 비중": formatSimple(laborCostRatio === null ? null : `${laborCostRatio}%`),
    등기임원보수총액: formatWon(execTotalComp || null),
  };
}
