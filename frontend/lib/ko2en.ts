// 공공데이터·서버가 한국어로 주는 짧은 말(시설 이름, 업종, 판정 기준 등)을 영어 화면에서 바꿔 보여 준다.
// 장소·가게 이름과 주소는 현지 표지판과 같도록 한국어 그대로 둔다.
const EN: Record<string, string> = {
  // 시설
  "장애인 화장실": "Accessible toilet", "장애인 주차": "Accessible parking", "장애인 주차 (확대)": "Accessible parking (expanded)", "휠체어 안전 통로": "Marked wheelchair path",
  "이동약자 해안 산책로 (나무 데크 약 700m)": "Step-free seaside deck path (~700 m)", "화장실 앞 경사로": "Ramp at the toilets",
  "촉지 음성 안내판": "Tactile audio guide board", "장애인 공용 샤워실 (제2캠핑장)": "Accessible shower (Camp 2)",
  "음성 안내기 무료 대여 (신분증)": "Free audio guide (ID required)", "물품 보관함": "Lockers", "출입구 경사로": "Entrance ramp",
  "자동심장충격기": "AED", "출입구 턱 없음": "Step-free entrance", "장애인 리프트": "Wheelchair lift", "장애인 공용 샤워실": "Accessible shower", "점자 안내": "Braille info", "보조견 동반 가능": "Guide dogs welcome", "수유실": "Nursing room", "기저귀 교환대": "Changing table", "주출입구 경사로": "Main entrance ramp", "점자 블록": "Tactile paving", "휠체어 대여": "Wheelchair rental", "엘리베이터": "Elevator",
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

// ---------- 영어 화면의 고유명사: 뜻이 있는 말은 영어로, 나머지는 로마자(국어의 로마자 표기법 기본 규칙) ----------
const CHO = ["g", "kk", "n", "d", "tt", "r", "m", "b", "pp", "s", "ss", "", "j", "jj", "ch", "k", "t", "p", "h"];
const JUNG = ["a", "ae", "ya", "yae", "eo", "e", "yeo", "ye", "o", "wa", "wae", "oe", "yo", "u", "wo", "we", "wi", "yu", "eu", "ui", "i"];
const JONG = ["", "k", "k", "k", "n", "n", "n", "t", "l", "k", "m", "l", "l", "l", "p", "l", "m", "p", "p", "t", "t", "ng", "t", "t", "k", "t", "p", "t"];
// 받침 뒤에 모음(ㅇ)이 오면 받침 소리를 다음 글자 첫소리로 넘긴다 (예: 묵호 → Mukho, 음악 → eumak)
const LINK = ["", "g", "kk", "ks", "n", "nj", "nh", "d", "r", "lg", "lm", "lb", "ls", "lt", "lp", "lh", "m", "b", "ps", "s", "ss", "ng", "j", "ch", "k", "t", "p", "h"];
export function roma(s: string): string {
  let out = "";
  const cs = Array.from(s);
  for (let i = 0; i < cs.length; i++) {
    const c = cs[i].charCodeAt(0) - 0xac00;
    if (c < 0 || c > 11171) { out += cs[i]; continue; }
    const cho = Math.floor(c / 588), jung = Math.floor((c % 588) / 28), jong = c % 28;
    const prev = i > 0 ? cs[i - 1].charCodeAt(0) - 0xac00 : -1;
    const prevJong = prev >= 0 && prev <= 11171 ? prev % 28 : 0;
    let head = CHO[cho];
    if (cho === 11 && prevJong && prevJong !== 21) head = "";   // 넘겨받은 받침은 앞에서 이미 붙음
    if (cho === 5 && (prevJong === 8 || prevJong === 4)) head = "l";   // ㄹㄹ·ㄴㄹ → ll
    out += head + JUNG[jung];
    if (jong) {
      const n = i + 1 < cs.length ? cs[i + 1].charCodeAt(0) - 0xac00 : -1;
      const nextIsVowel = n >= 0 && n <= 11171 && Math.floor(n / 588) === 11;
      out += nextIsVowel && jong !== 21 ? LINK[jong] : JONG[jong];
    }
  }
  return out;
}
const cap = (w: string) => w.replace(/(^|[\s(-])([a-z])/g, (_, a, b) => a + b.toUpperCase());
// 긴 말부터 바꾼다
const WORDS: [RegExp, string][] = ([
  ["강원특별자치도", ""], ["동해시", "Donghae"], ["교통약자이동지원센터", " Mobility Support Center"], ["교통약자광역이동지원센터", " Regional Mobility Support Center"],
  ["문화관광재단", " Culture & Tourism Foundation"], ["관광문화코스", "Tour & Culture Course"], ["순환형", "Loop"], ["종합버스터미널", " Bus Terminal"], ["시외버스터미널", " Intercity Bus Terminal"],
  ["근로자종합복지회관", " Workers' Welfare Center"], ["상공회의소", " Chamber of Commerce"], ["관광안내소", " Tourist Information"], ["안내소", " Information Center"],
  ["공영주차장", " Public Parking"], ["주차장", " Parking"], ["렌트카", " Rent-a-car"], ["렌터카", " Rent-a-car"], ["주사무소", " Head Office"], ["영업소", " Branch"], ["사무소", " Office"],
  ["해수욕장", " Beach"], ["해변", " Beach"], ["계곡", " Valley"], ["공원", " Park"], ["시장", " Market"], ["터미널", " Terminal"], ["은행", " Bank"], ["시청", " City Hall"],
  ["주민센터", " Community Center"], ["보건소", " Health Center"], ["병원", " Hospital"], ["약국", " Pharmacy"], ["체육관", " Gym"], ["복지관", " Welfare Center"], ["센터", " Center"],
  ["이마트", "E-Mart"], ["우리은행", "Woori Bank"], ["역영업소", " Station Branch"], ["공영", "Public "], ["입구", " Entrance"], ["중앙", " Central"],
  ["교육지원청", " Office of Education"], ["근로복지공단", "KCOMWEL "], ["동해시청", "Donghae City Hall"], ["본관", " Main Bldg"], ["별관", " Annex"], ["화장실", " Toilet"], ["행정복지센터", " Community Center"], ["도서관", " Library"], ["문화원", " Cultural Center"], ["경찰서", " Police Station"], ["소방서", " Fire Station"], ["우체국", " Post Office"], ["학교", " School"], ["어린이", " Children's"], ["놀이터", " Playground"], ["광장", " Plaza"], ["체험관", " Experience Center"], ["박물관", " Museum"], ["기념관", " Memorial Hall"], ["해안", " Coast"], ["강원도", "Gangwon "], ["습지", " Wetland"], ["생태", " Eco"], ["자연", " Nature"], ["바다", " Sea"], ["휴게소", " Rest Area"], ["전망대", " Observatory"], ["등대", " Lighthouse"], ["동굴", " Cave"],
] as [string, string][]).sort((x, y) => y[0].length - x[0].length).map(([k, v]) => [new RegExp(k, "g"), `\u0001${v}\u0001`] as [RegExp, string]);
export function enName(s: string): string {
  if (!s || !/[가-힣]/.test(s)) return s;
  let t = s.replace(/\(주\)|㈜/g, "").replace(/제\s*(\d+)/g, " No.$1 ");
  t = t.replace(/(\d+)층/g, " $1F ");
  let front = false;
  if (/\s*앞$/.test(t)) { front = true; t = t.replace(/\s*앞$/, ""); }
  t = t.replace(/(\S+)역(?=$|\s)/g, "$1\u0001 Station\u0001");
  t = t.replace(/(\S{2,})항(?=$|\s)/g, "$1\u0001 Port\u0001");
  for (const [re, v] of WORDS) t = t.replace(re, v);
  const out = t.split("\u0001").map((part, i) => (i % 2 ? part : cap(roma(part)))).join("").replace(/\s+/g, " ").trim();
  return front ? `In front of ${out}` : out;
}
// 도로명 주소: '동해시 동해대로 6270-16, 1층 (망상동)' → 'Donghaedae-ro 6270-16, 1F, Donghae'
export function enAddr(s: string): string {
  if (!s || !/[가-힣]/.test(s)) return s;
  const t = s.replace("강원특별자치도 ", "").replace(/\s*\([^)]*\)\s*$/, "").replace(/(\d+)층/g, "$1F").replace(/(\d+)호/g, "#$1").replace(/(\d+)동(?=\s|,|$)/g, "Bldg $1");
  const parts = t.split(/\s+/).filter((w) => w !== "동해시");
  const conv = parts.map((w) => {
    const m = w.match(/^([가-힣\d]+?)(대로|로|길)$/);
    if (m) return cap(roma(m[1])) + (m[2] === "대로" ? "-daero" : m[2] === "로" ? "-ro" : "-gil");
    return /[가-힣]/.test(w) ? cap(roma(w)) : w;
  });
  return `${conv.join(" ")}, Donghae`.replace(/\s+,/g, ",");
}
// 화면용: 한국어 화면은 그대로, 영어 화면은 영어 이름
export const nm = (lang: string, s?: string | null) => (s == null ? "" : lang === "ko" ? s : enName(s));
export const ad = (lang: string, s?: string | null) => (s == null ? "" : lang === "ko" ? s.replace("강원특별자치도 ", "") : enAddr(s));
