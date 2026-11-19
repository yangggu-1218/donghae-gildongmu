// 서버 배포용: 진짜 백엔드(/api)를 그대로 쓴다. (정적 데모는 entry.tsx — 브라우저 안 계산)
import React from "react";
import { createRoot } from "react-dom/client";
import Page from "@/app/page";

createRoot(document.getElementById("root")!).render(<Page />);
