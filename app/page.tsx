"use client";

import { useEffect, useState } from "react";

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
  const [year, setYear] = useState("2024");
  const [reportCategory, setReportCategory] = useState<ReportCategory>("annual");
  const [quarterCode, setQuarterCode] = useState<"11013" | "11014">("11013");
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<any>(null);
  const [error, setError] = useState("");
  const [chat, setChat] = useState<ChatMsg[]>([]);
  const [question, setQuestion] = useState("");
  const [chatLoading, setChatLoading] = useState(false);
  const [copied, setCopied] = useState(false);

  // 페이지가 열릴 때 회사 이름 전체 목록을 딱 한 번만 받아둡니다.
  // 그 이후엔 서버에 물어보지 않고 브라우저 안에서 바로 검색하기 때문에 훨씬 빠릅니다.
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

  async function copyMetricsForExcel() {
    if (!result) return;
    const rows = [
      ["기업명", result.corpName],
      ["연도", result.year],
      ["보고서 종류", result.reportLabel],
      ...Object.entries(result.metrics).map(([k, v]) => [k, v === null ? "-" : String(v)]),
    ];
    const tsv = rows.map((row) => row.join("\t")).join("\n");
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
        body: JSON.stringify({ corpName, year, reprtCode }),
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
      setChat([...newHistory, { role: "assistant", content: data.reply }]);
    } finally {
      setChatLoading(false);
    }
  }

  return (
    <main style={{ maxWidth: 720, margin: "0 auto", padding: "40px 20px" }}>
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

        <p style={{ fontSize: 12, color: "#888", background: "#f0f0f0", padding: "8px 10px", borderRadius: 8, margin: 0 }}>
          2분기(4~6월) 데이터는 반기보고서에, 4분기 데이터는 사업보고서에 포함되어 있어 별도 항목이 없습니다.
        </p>
      </div>

      <button
        onClick={runAnalysis}
        disabled={loading || !corpName}
        style={{ width: "100%", padding: "12px 18px", borderRadius: 8, border: "none", background: "#111", color: "#fff", marginBottom: 20 }}
      >
        {loading ? "분석중..." : "분석하기"}
      </button>

      {error && <p style={{ color: "crimson" }}>{error}</p>}

      {result && (
        <div style={{ background: "#fff", padding: 20, borderRadius: 12, marginBottom: 20 }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <h3 style={{ margin: 0 }}>
              {result.corpName} · {result.year} · {result.reportLabel}
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
          <table style={{ width: "100%", borderCollapse: "collapse", margin: "12px 0" }}>
            <tbody>
              {Object.entries(result.metrics).map(([k, v]) => (
                <tr key={k}>
                  <td style={{ padding: "4px 0", color: "#666" }}>{k}</td>
                  <td style={{ padding: "4px 0", fontWeight: 600 }}>
                    {v === null ? "-" : String(v)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          <p style={{ whiteSpace: "pre-wrap", lineHeight: 1.6 }}>{result.analysis}</p>
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
              placeholder="예: 작년이랑 비교하면 어때?"
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
