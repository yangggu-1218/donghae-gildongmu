"use client";
// 코스 결과 위 배너: 왼쪽 문구, 오른쪽 동해 관광지 사진(해랑전망대 바다) 위에 동해 마스코트 동이.
import { photoAt } from "@/lib/photos";

export function CourseHero({ lang, mascot = true }: { lang: string; mascot?: boolean }) {
  const ko = lang === "ko";
  const bg = photoAt("haerang", 960);   // 도째비골 해랑전망대 바다 (팀 제공 사진)
  return (
    <div className="course-hero" style={bg ? { ["--ch-photo" as any]: `url("${bg}")` } : undefined}>
      <div className="ch-text">
        <h2 id="plan-h">{ko ? <>동해의 여행,<br />모두를 위한 길</> : <>Donghae travel,<br />a way for everyone</>}</h2>
        <p>{ko ? "무장애 관광으로 더 자유로운 동해 여행을 시작해보세요!" : "Start a freer, barrier-free trip in Donghae!"}</p>
      </div>
      {mascot && <div className="ch-art" aria-hidden="true"><img className="ch-dongi" src="/dongi/full-basic.webp" alt="" /></div>}
    </div>
  );
}
