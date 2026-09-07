export const metadata = {
  title: "HR Analytics Agent",
  description: "OpenDART + Claude 기반 인력/보상/재무 분석 에이전트",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ko">
      <body style={{ fontFamily: "sans-serif", background: "#f7f7f8", margin: 0 }}>
        {children}
      </body>
    </html>
  );
}
