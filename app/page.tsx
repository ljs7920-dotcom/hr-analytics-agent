"use client";

import { useEffect, useRef, useState } from "react";

type ChatMsg = { role: "user" | "assistant"; content: string };
type ReportCategory = "annual" | "half" | "quarter";

const btnBase: React.CSSProperties = {
  flex: 1,
  padding: "8px 10px",
  borderRadius: 8,
  border: "1px solid #ccc",
  background: "#fff",
  color: "#111",
  fontSize: 13,
  cursor: "pointer",
};
const btnActive: React.CSSProperties = {
  ...btnBase,
  background: "#111",
  color: "#fff",
  border: "1px solid #111",
};

export default function Home() {
  const [corpName, setCorpName] = useState("");
  const [allNames, setAllNames] = useState<string[]>([]);
  const [suggestions, setSuggestions] = useState<string[]>([]);
  const [year, setYear] = useState("");
  const [reportCategory, setReportCategory] = useState<ReportCategory>("annual");
  const [quarterCode, setQuarterCode] = useState<"11013" | "11014">("11013");
  const [yearsCount, setYearsCount] = useState(1);
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<any>(null);
  const [error, setError] = useState("");
  const [chat, setChat] = useState<ChatMsg[]>([]);
  const [question, setQuestion] = useState("");
  const [chatLoading, setChatLoading] = useState(false);
  const [copied, setCopied] = useState(false);
  const tableScrollRef = useRef<HTMLDivElement>(null);

  // 새 결과가 나오면 표의 가로 스크롤 위치를 항상 맨 왼쪽(지표 이름이 보이는 위치)으로 되돌립니다.
  useEffect(() => {
    if (result && tableScrollRef.current) {
      tableScrollRef.current.scrollLeft = 0;
    }
  }, [result]);

  // 사업보고서(연간)는 통상 다음 해 3월에 제출됩니다.
  // 그래서 "최신으로 확인 가능한 사업보고서 연도"는 보통 작년이고,
  // 아직 3월이 지나지 않은 1~2월에는 재작년 것까지만 확실히 나와있을 수 있습니다.
  useEffect(() => {
    const now = new Date();
    const latestAnnualYear = now.getMonth() < 2 ? now.getFullYear() - 2 : now.getFullYear() - 1;
    setYear(String(latestAnnualYear));
  }, []);

  // 페이지가 열릴 때 회사 이름 전체 목록을 딱 한 번만 받아둡니다.
  useEffect(() => {
    fetch("/corp-names.json")
      .then((res) => res.json())
      .then((names) => setAllNames(names || []))
      .catch(() => setAllNames([]));
  }, []);

  function handleCorpNameChange(value: string) {
    setCorpName(value);
    if (value.trim().length === 0) {
      setSuggestions([]);
      return;
    }
    const q = value.trim();
    const matches = allNames.filter((name) => name.includes(q)).slice(0, 10);
    setSuggestions(matches);
  }

  const reprtCode = reportCategory === "annual" ? "11011" : reportCategory === "half" ? "11012" : quarterCode;
  const isValidCorpName = allNames.includes(corpName);

  async function copyMetricsForExcel() {
    if (!result) return;
    const years: string[] = result.years;
    const metricNames = Object.keys(result.metricsByYear[years[0]]);

    const header = ["지표", ...years.map((y) => `${y}년`)];
    const rows = metricNames.map((name) => [
      name,
      ...years.map((y) => {
        const v = result.metricsByYear[y][name];
        return v === null ? "-" : v.exact;
      }),
    ]);

    const tsv = [
      ["기업명", result.corpName],
      ["보고서 종류", result.reportLabel],
      [],
      header,
      ...rows,
    ]
      .map((row) => row.join("\t"))
      .join("\n");

    try {
      await navigator.clipboard.writeText(tsv);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      setError("복사에 실패했습니다. 브라우저 권한을 확인해주세요.");
    }
  }

  async function runAnalysis() {
    setLoading(true);
    setError("");
    setResult(null);
    setChat([]);
    try {
      const res = await fetch("/api/analyze", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ corpName, year, reprtCode, yearsCount }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      setResult(data);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }

  async function askFollowUp() {
    if (!question.trim() || !result) return;
    const newHistory: ChatMsg[] = [...chat, { role: "user", content: question }];
    setChat(newHistory);
    setQuestion("");
    setChatLoading(true);
    try {
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ messages: newHistory, context: result }),
      });
      const data = await res.json();
      if (!res.ok || !data.reply) {
        setChat([
          ...newHistory,
          { role: "assistant", content: `(오류) ${data.error || "답변을 받지 못했습니다."}` },
        ]);
        return;
      }
      setChat([...newHistory, { role: "assistant", content: data.reply }]);
    } catch (e: any) {
      setChat([...newHistory, { role: "assistant", content: `(오류) ${e.message}` }]);
    } finally {
      setChatLoading(false);
    }
  }

  const years: string[] = result?.years || [];
  const metricNames = result ? Object.keys(result.metricsByYear[years[0]]) : [];

  return (
    <main style={{ maxWidth: 920, margin: "0 auto", padding: "40px 20px" }}>
      <h1 style={{ fontSize: 22, marginBottom: 4 }}>HR Analytics Agent</h1>
      <p style={{ color: "#666", marginBottom: 24 }}>
        기업명, 연도, 보고서 종류를 선택하면 OpenDART 공시 데이터를 기반으로 인력·보상·재무 지표를 계산하고 설명합니다.
      </p>

      <div style={{ marginBottom: 12 }}>
        <label style={{ fontSize: 12, color: "#888", display: "block", marginBottom: 4 }}>기업명</label>
        <div style={{ display: "flex", gap: 8 }}>
          <input
            placeholder="기업명 (예: 삼성전자)"
            value={corpName}
            onChange={(e) => handleCorpNameChange(e.target.value)}
            list="corp-name-suggestions"
            autoComplete="off"
            style={{ flex: 1, padding: 10, borderRadius: 8, border: "1px solid #ccc" }}
          />
          <datalist id="corp-name-suggestions">
            {suggestions.map((name) => (
              <option key={name} value={name} />
            ))}
          </datalist>
          <input
            placeholder="연도 (예: 2024)"
            value={year}
            onChange={(e) => setYear(e.target.value)}
            style={{ width: 100, padding: 10, borderRadius: 8, border: "1px solid #ccc" }}
          />
        </div>
        {corpName.trim().length > 0 && !isValidCorpName && (
          <p style={{ fontSize: 12, color: "#c0392b", margin: "6px 0 0" }}>
            자동완성 목록에 뜨는 회사명 중 하나를 정확히 선택해주세요. (직접 입력만으로는 분석할 수 없습니다)
          </p>
        )}
      </div>

      <div style={{ marginBottom: 16 }}>
        <label style={{ fontSize: 12, color: "#888", display: "block", marginBottom: 6 }}>보고서 종류</label>
        <div style={{ display: "flex", gap: 8, marginBottom: 8 }}>
          <button style={reportCategory === "annual" ? btnActive : btnBase} onClick={() => setReportCategory("annual")}>
            사업보고서(연간)
          </button>
          <button style={reportCategory === "half" ? btnActive : btnBase} onClick={() => setReportCategory("half")}>
            반기보고서
          </button>
          <button style={reportCategory === "quarter" ? btnActive : btnBase} onClick={() => setReportCategory("quarter")}>
            분기보고서
          </button>
        </div>

        {reportCategory === "quarter" && (
          <div style={{ display: "flex", gap: 8, marginBottom: 8 }}>
            <button style={quarterCode === "11013" ? btnActive : btnBase} onClick={() => setQuarterCode("11013")}>
              1분기 (1~3월)
            </button>
            <button style={quarterCode === "11014" ? btnActive : btnBase} onClick={() => setQuarterCode("11014")}>
              3분기 (7~9월)
            </button>
          </div>
        )}

        <p style={{ fontSize: 12, color: "#888", background: "#f0f0f0", padding: "8px 10px", borderRadius: 8, margin: "0 0 8px" }}>
          2분기(4~6월) 데이터는 반기보고서에, 4분기 데이터는 사업보고서에 포함되어 있어 별도 항목이 없습니다.
        </p>

        <label style={{ fontSize: 12, color: "#888", display: "block", marginBottom: 6 }}>
          조회할 연도 수 (선택한 연도부터 과거로 몇 개년)
        </label>
        <div style={{ display: "flex", gap: 8 }}>
          {[1, 2, 3, 4, 5].map((n) => (
            <button key={n} style={yearsCount === n ? btnActive : btnBase} onClick={() => setYearsCount(n)}>
              {n}개년
            </button>
          ))}
        </div>
        {yearsCount > 1 && (
          <p style={{ fontSize: 12, color: "#888", margin: "8px 0 0" }}>
            {parseInt(year || "0", 10) - yearsCount + 1}년 ~ {year}년, 총 {yearsCount}개년을 함께 조회하고 추이를 분석합니다.
          </p>
        )}
      </div>

      <button
        onClick={runAnalysis}
        disabled={loading || !isValidCorpName}
        style={{ width: "100%", padding: "12px 18px", borderRadius: 8, border: "none", background: "#111", color: "#fff", marginBottom: 20 }}
      >
        {loading ? "분석중..." : "분석하기"}
      </button>

      {error && <p style={{ color: "crimson" }}>{error}</p>}

      {result && (
        <div style={{ background: "#fff", padding: 20, borderRadius: 12, marginBottom: 20 }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <h3 style={{ margin: 0, fontSize: 16 }}>
              {result.corpName} · {years.length > 1 ? `${years[0]}~${years[years.length - 1]}` : years[0]}년 · {result.reportLabel}
            </h3>
            <button
              onClick={copyMetricsForExcel}
              style={{
                padding: "6px 12px",
                borderRadius: 8,
                border: "1px solid #ccc",
                background: copied ? "#111" : "#fff",
                color: copied ? "#fff" : "#111",
                fontSize: 13,
              }}
            >
              {copied ? "복사됨!" : "엑셀로 복사하기"}
            </button>
          </div>

          <div style={{ overflowX: "auto" }} ref={tableScrollRef}>
          <table style={{ width: "100%", borderCollapse: "collapse", margin: "12px 0", fontSize: 13 }}>
            <thead>
              <tr>
                <th
                  style={{
                    textAlign: "left",
                    padding: "4px 6px 4px 0",
                    color: "#888",
                    fontWeight: 400,
                    fontSize: 11,
                    position: "sticky",
                    left: 0,
                    background: "#fff",
                  }}
                >
                  지표
                </th>
                {years.map((y) => (
                  <th key={y} style={{ textAlign: "right", padding: "4px 0", color: "#888", fontWeight: 400, fontSize: 11, whiteSpace: "nowrap" }}>
                    {y}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {metricNames.map((name) => (
                <tr key={name}>
                  <td
                    style={{
                      padding: "4px 6px 4px 0",
                      color: "#666",
                      position: "sticky",
                      left: 0,
                      background: "#fff",
                      whiteSpace: "nowrap",
                    }}
                  >
                    {name}
                  </td>
                  {years.map((y) => {
                    const v = result.metricsByYear[y][name];
                    return (
                      <td
                        key={y}
                        title={v ? `정확한 값: ${v.exact}` : undefined}
                        style={{
                          padding: "4px 0",
                          fontWeight: 600,
                          textAlign: "right",
                          whiteSpace: "nowrap",
                          cursor: v ? "help" : "default",
                          borderBottom: v ? "1px dotted #bbb" : undefined,
                        }}
                      >
                        {v === null ? "-" : v.display}
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
          </div>
          <p style={{ fontSize: 11, color: "#999", margin: "0 0 12px" }}>
            금액 위에 마우스를 올리면 정확한 숫자가 표시됩니다. (점선 밑줄이 있는 값)
          </p>

          <p style={{ whiteSpace: "pre-wrap", lineHeight: 1.6, fontSize: 14 }}>{result.analysis}</p>
          {result.reportUrl && (
            <a
              href={result.reportUrl}
              target="_blank"
              rel="noopener noreferrer"
              style={{
                display: "inline-block",
                marginTop: 8,
                fontSize: 13,
                color: "#0b5fa3",
                textDecoration: "underline",
              }}
            >
              DART 공시 원문 보러가기 ↗
            </a>
          )}
        </div>
      )}

      {result && (
        <div style={{ background: "#fff", padding: 20, borderRadius: 12 }}>
          <h4>후속 질문</h4>
          <div style={{ marginBottom: 12 }}>
            {chat.map((m, i) => (
              <p key={i} style={{ margin: "6px 0" }}>
                <b>{m.role === "user" ? "나" : "AI"}:</b> {m.content}
              </p>
            ))}
          </div>
          <div style={{ display: "flex", gap: 8 }}>
            <input
              placeholder={yearsCount > 1 ? "예: 가장 많이 늘어난 지표는?" : "예: 3개년으로 비교하려면 위에서 개수를 늘리고 다시 분석해줘"}
              value={question}
              onChange={(e) => setQuestion(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && askFollowUp()}
              style={{ flex: 1, padding: 10, borderRadius: 8, border: "1px solid #ccc" }}
            />
            <button
              onClick={askFollowUp}
              disabled={chatLoading}
              style={{ padding: "10px 18px", borderRadius: 8, border: "none", background: "#111", color: "#fff" }}
            >
              {chatLoading ? "..." : "질문"}
            </button>
          </div>
        </div>
      )}
    </main>
  );
}
