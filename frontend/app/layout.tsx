import "./globals.css";
import type { ReactNode } from "react";

export const metadata = {
  title: "동해 길동무",
  description: "가보기 전에 갈 수 있는 길인지 알려 주는 동해 여행 코스",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="ko">
      <head>
        <link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=IBM+Plex+Sans+KR:wght@400;600;700&family=Jua&display=swap" />
      </head>
      <body>{children}</body>
    </html>
  );
}
