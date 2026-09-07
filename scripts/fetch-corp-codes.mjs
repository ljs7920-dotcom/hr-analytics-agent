// 이 스크립트는 웹사이트를 "배포"할 때 딱 한 번 자동으로 실행됩니다 (package.json의 prebuild).
// 매번 사용자가 분석 버튼을 누를 때마다 실행되는 게 아니라서, 여기서 시간이 좀 걸려도 괜찮습니다.
// 결과물(data/corp-codes.json)을 만들어두면, 실제 서비스에서는 이 파일에서 빠르게 검색만 하면 됩니다.

import AdmZip from "adm-zip";
import { parseStringPromise } from "xml2js";
import fs from "fs";
import path from "path";

const DART_KEY = process.env.OPENDART_API_KEY;

async function main() {
  if (!DART_KEY) {
    console.warn(
      "[corp-codes] OPENDART_API_KEY가 없어서 회사 목록을 받지 못했습니다. " +
        "빈 목록으로 빌드를 계속 진행합니다. (Vercel 환경변수 설정을 확인하세요)"
    );
    writeResult([]);
    return;
  }

  console.log("[corp-codes] 오픈다트에서 전체 회사 목록을 받는 중...");
  const res = await fetch(
    `https://opendart.fss.or.kr/api/corpCode.xml?crtfc_key=${DART_KEY}`
  );

  if (!res.ok) {
    console.warn(`[corp-codes] 다운로드 실패 (status ${res.status}). 빈 목록으로 진행합니다.`);
    writeResult([]);
    return;
  }

  const buffer = Buffer.from(await res.arrayBuffer());
  const zip = new AdmZip(buffer);
  const xml = zip.readAsText("CORPCODE.xml");
  const parsed = await parseStringPromise(xml);

  const all = parsed.result.list;

  // stock_code가 있는 회사 = 실제 상장(주식시장에 등록된) 회사만 남깁니다.
  // 비상장 계열사, 협회, 조합 등 수만 개를 제외해서 파일 용량과 검색 속도를 크게 줄여줍니다.
  const listedOnly = all
    .filter((item) => item.stock_code && item.stock_code[0].trim() !== "")
    .map((item) => ({
      corp_name: item.corp_name[0],
      corp_code: item.corp_code[0],
      stock_code: item.stock_code[0],
    }));

  writeResult(listedOnly);
  console.log(`[corp-codes] 완료: 상장회사 ${listedOnly.length}개 저장`);
}

function writeResult(list) {
  const dataPath = path.join(process.cwd(), "data", "corp-codes.json");
  fs.writeFileSync(dataPath, JSON.stringify(list));

  // public 폴더에 넣으면 브라우저가 정적 파일처럼 직접 내려받을 수 있습니다.
  // 이름만 남긴 가벼운 목록이라, 자동완성할 때마다 서버에 물어볼 필요 없이
  // 브라우저 안에서 바로 걸러낼 수 있어 훨씬 빠릅니다.
  const publicDir = path.join(process.cwd(), "public");
  if (!fs.existsSync(publicDir)) fs.mkdirSync(publicDir, { recursive: true });
  const namesOnly = list.map((c) => c.corp_name).sort((a, b) => a.localeCompare(b, "ko"));
  fs.writeFileSync(path.join(publicDir, "corp-names.json"), JSON.stringify(namesOnly));
}

main().catch((err) => {
  console.error("[corp-codes] 오류 발생, 빈 목록으로 진행합니다:", err.message);
  writeResult([]);
});
