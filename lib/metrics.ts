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

// OpenDART 응답의 필드명은 보고서마다 표기가 조금씩 다를 수 있습니다.
// 실제 응답을 한 번 콘솔에 찍어보고 아래 필드명이 다르면 맞춰서 수정하세요.
export function computeMetrics(
  employee: any[],
  execComp: any[],
  financials: any[]
) {
  const totalEmployees = employee.reduce((sum, e) => sum + toNumber(e.sm), 0);
  const totalSalary = employee.reduce(
    (sum, e) => sum + toNumber(e.fyer_salary_totamt),
    0
  );

  const revenueItem = financials.find((f) => f.account_nm === "매출액");
  const revenue = revenueItem ? toNumber(revenueItem.thstrm_amount) : null;

  const execTotalComp = execComp.reduce(
    (sum, e) => sum + toNumber(e.jan_pymnt_amt || e.gnrmst_pymntamt),
    0
  );

  const avgSalary = totalEmployees ? Math.round(totalSalary / totalEmployees) : null;
  const laborCostRatio =
    revenue && totalSalary ? +((totalSalary / revenue) * 100).toFixed(2) : null;

  return {
    총직원수: formatSimple(formatWithUnit(totalEmployees || null, "명")),
    "1인평균급여": formatWon(avgSalary),
    매출액: formatWon(revenue),
    "인건비/매출 비중": formatSimple(laborCostRatio === null ? null : `${laborCostRatio}%`),
    등기임원보수총액: formatWon(execTotalComp || null),
  };
}
