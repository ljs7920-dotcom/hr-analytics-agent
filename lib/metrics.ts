function toNumber(v: any): number {
  if (!v) return 0;
  const n = parseInt(String(v).replace(/,/g, ""), 10);
  return isNaN(n) ? 0 : n;
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

  return {
    총직원수: totalEmployees || null,
    "1인평균급여(원)": totalEmployees ? Math.round(totalSalary / totalEmployees) : null,
    매출액: revenue,
    "인건비/매출 비중(%)":
      revenue && totalSalary ? +((totalSalary / revenue) * 100).toFixed(2) : null,
    등기임원보수총액: execTotalComp || null,
  };
}
