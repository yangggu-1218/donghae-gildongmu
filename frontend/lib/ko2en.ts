// 공공데이터·서버가 한국어로 주는 짧은 말(시설 이름, 업종, 판정 기준 등)을 영어 화면에서 바꿔 보여 준다.
// 장소·가게 이름과 주소는 현지 표지판과 같도록 한국어 그대로 둔다.
const EN: Record<string, string> = {
  // 시설
  "장애인 화장실": "Accessible toilet", "장애인 주차": "Accessible parking", "휠체어 대여": "Wheelchair rental", "엘리베이터": "Elevator",
  "경사로": "Ramp", "공중화장실": "Public toilet", "개방화장실": "Open toilet", "화장실": "Toilet", "주차장": "Parking", "넓은 주차장": "Large car park",
  "테이블석": "Table seating", "테이블 없음(좌식)": "Floor seating only", "입식 테이블": "Chairs & tables", "입식 테이블 일부": "Some chairs & tables",
  // 의료
  "약국": "Pharmacy", "의원": "Clinic", "응급실": "Emergency room",
  // 숙박 업종
  "호스텔업": "Hostel", "숙박업(일반)": "Inn / motel", "숙박업(생활)": "Guesthouse / rental", "관광호텔업": "Tourist hotel", "휴양콘도미니엄업": "Resort condo", "가족호텔업": "Family hotel",
  // 요금·시간
  "무료": "Free", "유료": "Paid", "24시간": "24 hours", "상시 개방": "Always open",
  // 판정 기준표
  "경사로 기울기": "Ramp slope", "1/18 이하 (약 3.2°)": "1:18 or gentler (~3.2°)", "1/12 이하 (약 4.8°)까지": "Up to 1:12 (~4.8°)", "1/8 넘음 (약 7.1°)": "Steeper than 1:8 (~7.1°)",
  "장애인등편의법 시행규칙 별표1": "Korean Disability Convenience Act, Annex 1", "출입구·통로 턱": "Step at entrance or path", "2cm 이하": "2 cm or less", "2~5cm": "2–5 cm", "5cm 넘음": "Over 5 cm",
  "통로 폭": "Path width", "1.2m 이상": "1.2 m or wider", "0.9~1.2m": "0.9–1.2 m", "0.9m 미만": "Under 0.9 m", "계단": "Stairs", "없음": "None",
  "있지만 우회로·경사로 있음": "Yes, but with a detour or ramp", "우회로 없음": "No detour", "현장 답사 기준": "Our site survey", "바닥": "Surface",
  "포장·데크": "Paved or deck", "자갈·데크 이음새": "Gravel or deck joints", "모래·흙길·산길": "Sand, dirt or mountain trail",
};
export const tr = (lang: string, s?: string | null) => (s == null ? "" : lang === "ko" ? s : EN[s] ?? s);

// 출처 페이지의 판정 메모 (서버는 한국어로만 준다)
export const SOURCE_NOTES_EN = [
  "Grades are calculated from measurements when we have them; otherwise we use what was recorded on the site survey. With no information, a place is marked 'Caution'.",
  "Restaurants, cafes, pharmacies and clinics marked '(예시)' and hours marked 'sample' have not been checked yet.",
  "Public lodging data has no coordinates or room accessibility, so accessible rooms are marked 'not checked'.",
  "Accessible toilets are shown on the map only when their address matches another public dataset (attractions, car parks, chargers).",
];

// 지도 점 안의 글자 (화장실·충전기·약국)
export const DOT_EN: Record<string, string> = { "화": "WC", "충": "⚡", "약": "Rx" };
export const dot = (lang: string, s: string) => (lang === "ko" ? s : DOT_EN[s] ?? s);
