function toNumber(v: any): number {
  if (!v) return 0;
  const n = parseInt(String(v).replace(/,/g, ""), 10);
  return isNaN(n) ? 0 : n;
}

// 1000 단위마다 콤마(,)를 찍고 끝에 단위를 붙여줍니다. (예: 135000000 -> "1억 3,500만원"이 아니라 "135,000,000원")
function formatWithUnit(n: number | null, unit: string): string | null {
  if (n === null) return null;
  return `${n.toLocaleString("ko-KR")}${unit}`;
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
    총직원수: formatWithUnit(totalEmployees || null, "명"),
    "1인평균급여": formatWithUnit(avgSalary, "원"),
    매출액: formatWithUnit(revenue, "원"),
    "인건비/매출 비중": laborCostRatio === null ? null : `${laborCostRatio}%`,
    등기임원보수총액: formatWithUnit(execTotalComp || null, "원"),
  };
}
