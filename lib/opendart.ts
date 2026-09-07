import AdmZip from "adm-zip";
import { parseStringPromise } from "xml2js";

const DART_KEY = process.env.OPENDART_API_KEY!;

type CorpCodeEntry = { corp_name: string; corp_code: string };

// 기업명 -> 고유번호(corp_code) 매핑 목록은 매번 새로 받으면 느리므로
// 서버가 살아있는 동안(warm instance) 메모리에 캐시해둡니다.
let corpCodeCache: CorpCodeEntry[] | null = null;

async function loadCorpCodes(): Promise<CorpCodeEntry[]> {
  if (corpCodeCache) return corpCodeCache;

  const res = await fetch(
    `https://opendart.fss.or.kr/api/corpCode.xml?crtfc_key=${DART_KEY}`
  );
  if (!res.ok) throw new Error("OpenDART 기업코드 목록을 받아오지 못했습니다.");

  const buffer = Buffer.from(await res.arrayBuffer());
  const zip = new AdmZip(buffer);
  const xml = zip.readAsText("CORPCODE.xml");
  const parsed = await parseStringPromise(xml);

  const list: CorpCodeEntry[] = parsed.result.list.map((item: any) => ({
    corp_name: item.corp_name[0],
    corp_code: item.corp_code[0],
  }));

  corpCodeCache = list;
  return list;
}

export async function findCorpCode(name: string): Promise<string> {
  const list = await loadCorpCodes();
  const exact = list.find((c) => c.corp_name === name);
  const partial = list.find((c) => c.corp_name.includes(name));
  const found = exact || partial;
  if (!found) throw new Error(`'${name}' 이라는 이름의 기업을 찾을 수 없습니다.`);
  return found.corp_code;
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

// 직원현황 (부문별 직원 수, 평균 근속연수, 1인평균 급여액 등)
export async function getEmployeeStatus(corp_code: string, year: string) {
  return dartGet("empSttus.json", { corp_code, bsns_year: year, reprt_code: "11011" });
}

// 이사·감사 전체의 보수현황 (등기임원 보수 총액)
export async function getExecutiveComp(corp_code: string, year: string) {
  return dartGet("hmvAuditAllSttus.json", { corp_code, bsns_year: year, reprt_code: "11011" });
}

// 단일회사 전체 재무제표 (매출액, 영업이익 등)
export async function getFinancials(corp_code: string, year: string) {
  return dartGet("fnlttSinglAcntAll.json", {
    corp_code,
    bsns_year: year,
    reprt_code: "11011",
    fs_div: "CFS",
  });
}
