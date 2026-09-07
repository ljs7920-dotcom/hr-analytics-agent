"use client";

import { useState } from "react";

type ChatMsg = { role: "user" | "assistant"; content: string };

export default function Home() {
  const [corpName, setCorpName] = useState("");
  const [suggestions, setSuggestions] = useState<string[]>([]);
  const [year, setYear] = useState("2024");
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<any>(null);
  const [error, setError] = useState("");
  const [chat, setChat] = useState<ChatMsg[]>([]);
  const [question, setQuestion] = useState("");
  const [chatLoading, setChatLoading] = useState(false);

  async function handleCorpNameChange(value: string) {
    setCorpName(value);
    if (value.trim().length === 0) {
      setSuggestions([]);
      return;
    }
    try {
      const res = await fetch(`/api/companies?q=${encodeURIComponent(value)}`);
      const data = await res.json();
      setSuggestions(data.names || []);
    } catch {
      // 자동완성은 실패해도 분석 기능 자체엔 영향 없도록 조용히 무시합니다.
      setSuggestions([]);
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
        body: JSON.stringify({ corpName, year }),
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
        기업명과 연도를 입력하면 OpenDART 공시 데이터를 기반으로 인력·보상·재무 지표를 계산하고 설명합니다.
      </p>

      <div style={{ display: "flex", gap: 8, marginBottom: 16 }}>
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
        <button
          onClick={runAnalysis}
          disabled={loading || !corpName}
          style={{ padding: "10px 18px", borderRadius: 8, border: "none", background: "#111", color: "#fff" }}
        >
          {loading ? "분석중..." : "분석하기"}
        </button>
      </div>

      {error && <p style={{ color: "crimson" }}>{error}</p>}

      {result && (
        <div style={{ background: "#fff", padding: 20, borderRadius: 12, marginBottom: 20 }}>
          <h3>
            {result.corpName} · {result.year}
          </h3>
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
