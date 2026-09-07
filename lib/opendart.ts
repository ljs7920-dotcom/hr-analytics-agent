import corpCodes from "@/data/corp-codes.json";

const DART_KEY = process.env.OPENDART_API_KEY!;

type CorpCodeEntry = { corp_name: string; corp_code: string; stock_code: string };

const list = corpCodes as CorpCodeEntry[];

export function findCorpCode(name: string): string {
  const exact = list.find((c) => c.corp_name === name);
  const partial = list.find((c) => c.corp_name.includes(name));
  const found = exact || partial;
  if (!found) {
    throw new Error(
      `'${name}' 이라는 이름의 상장회사를 찾을 수 없습니다. 정확한 회사명을 확인해주세요.`
    );
  }
  return found.corp_code;
}

// 자동완성용: 입력한 글자가 포함된 회사명을 최대 10개까지 찾아줍니다.
export function searchCorpNames(query: string): string[] {
  if (!query || query.trim().length === 0) return [];
  const q = query.trim();
  return list
    .filter((c) => c.corp_name.includes(q))
    .slice(0, 10)
    .map((c) => c.corp_name);
}

async function dartGet(path: string, params: Record<string, string>) {
  const qs = new URLSearchParams({ crtfc_key: DART_KEY, ...params });
  const res = await fetch(`https://opendart.fss.or.kr/api/${path}?${qs.toString()}`);
  const data = await res.json();

  // OpenDART는 데이터가 없을 때도 정상 응답(status 013)을 주는 경우가 있어
  // 에러로 처리하지 않고 빈 배열로 넘어갑니다.
  if (data.status !== "000") return [];
  return data.list || [];
}

// reprt_code: 11011=사업보고서(연간), 11012=반기보고서, 11013=1분기보고서, 11014=3분기보고서
// (OpenDART에는 4분기/하반기 전용 보고서가 따로 없습니다. 4분기는 사업보고서, 하반기는 사업보고서에 포함됩니다.)

// 직원현황 (부문별 직원 수, 평균 근속연수, 1인평균 급여액 등)
export async function getEmployeeStatus(corp_code: string, year: string, reprt_code: string = "11011") {
  return dartGet("empSttus.json", { corp_code, bsns_year: year, reprt_code });
}

// 이사·감사 전체의 보수현황 (등기임원 보수 총액)
export async function getExecutiveComp(corp_code: string, year: string, reprt_code: string = "11011") {
  return dartGet("hmvAuditAllSttus.json", { corp_code, bsns_year: year, reprt_code });
}

// 단일회사 전체 재무제표 (매출액, 영업이익 등)
export async function getFinancials(corp_code: string, year: string, reprt_code: string = "11011") {
  return dartGet("fnlttSinglAcntAll.json", {
    corp_code,
    bsns_year: year,
    reprt_code,
    fs_div: "CFS",
  });
}
