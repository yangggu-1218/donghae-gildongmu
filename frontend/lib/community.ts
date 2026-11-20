// 커뮤니티 '다녀온 길' — 시연용 예시 글 20개와 이 브라우저에 저장하는 내 글·댓글·도움 됐어요.
// 서버 저장은 관리자 검수 기능과 함께 다음 단계 (docs/16_COMMUNITY_PANEL.md).
export type Cmt = { nick: string; date: string; text: string };
export type Post = {
  id: string; title: string; nick: string; date: string;
  kind: "easy" | "free";          // 이동약자 / 일반
  move: string[];                 // 휠체어, 유모차, 어르신(오래 걷기 어려움), 계단 어려움
  who: string; zone: string; stops: string[]; rating: number;
  body: string; tips: string[];   // 길 메모: 다녀온 사람이 본 턱·경사·화장실 등
  helpful: number; comments: Cmt[]; mine?: boolean;
};
export type PlaceNote = { nick: string; date: string; text: string; tip?: boolean };

// 시연용 임시 계정 [Test]의 프로필 사진 (댓글·글쓴이·프로필에 같이 보임)
export const TEST_NICK = "Test";
export const AVATAR: Record<string, string> = { [TEST_NICK]: "/photos/test-avatar.webp" };
export const SEED: Post[] = [
  { id: "t01", title: "Test의 첫 동해 여행, 추암 해돋이부터 촛대바위까지", nick: "Test", date: "2026-11-18", kind: "easy", move: ["오래 걷기 어려움"], who: "부모님과", zone: "chuam",
    stops: ["chuam_bridge", "chotdae", "haeamjeong", "food_chuam_hanki"], rating: 5,
    body: "부모님과 새벽에 추암에 갔어요. 출렁다리는 바닥이 평평해서 천천히 걸으셨고, 촛대바위 앞 데크는 넓어서 쉬어 가기 좋았어요. 아침은 근처 식당에서 따뜻하게 먹었습니다.",
    tips: ["해돋이 보려면 해 뜨기 30분 전 도착", "촛대바위 데크 중간에 벤치 있어요", "추암 공영주차장에서 출렁다리까지 평지"], helpful: 7,
    comments: [{ nick: "부모님효도여행", date: "2026-11-19", text: "저희도 다음 달에 부모님이랑 가 보려고요. 벤치 정보 고마워요!" }, { nick: "Test", date: "2026-11-19", text: "네, 데크에서 쉬면서 사진 찍기 좋았어요." }] },
  { id: "t02", title: "묵호 바다 한 바퀴, 도째비골 스카이밸리와 등대", nick: "Test", date: "2026-11-12", kind: "free", move: [], who: "연인·친구", zone: "mukho",
    stops: ["dokkaebi", "mukho_lighthouse", "nongol", "cafe_harbor"], rating: 4,
    body: "친구랑 묵호를 한 바퀴 돌았어요. 스카이밸리에서 바다 내려다보는 게 제일 좋았고, 논골담길은 오르막이 꽤 있어서 천천히 올라갔어요. 마지막은 항구 앞 카페에서 쉬었습니다.",
    tips: ["논골담길은 오르막이 있어 편한 신발 추천", "스카이밸리는 주말 오후에 줄이 길어요"], helpful: 3, comments: [] },

  { id: "p01", title: "휠체어로 도째비골부터 묵호항까지, 생각보다 수월했어요", nick: "휠체어로동해", date: "2026-11-16", kind: "easy", move: ["휠체어"], who: "연인·친구", zone: "mukho",
    stops: ["dokkaebi", "haerang", "food_boohung", "mukho_park"], rating: 5,
    body: "수동 휠체어로 친구랑 다녀왔어요. 스카이밸리는 매표소 옆 엘리베이터로 전망대까지 바로 올라가요. 해랑전망대는 데크가 넓어서 둘이 나란히 가도 됐어요. 점심은 부흥횟집, 입구 턱이 없어 편했습니다.",
    tips: ["스카이밸리 엘리베이터는 매표소 오른쪽", "해랑전망대 데크 끝부분은 살짝 경사", "부흥횟집 장애인 주차 2칸, 점심때는 금방 차요"], helpful: 41,
    comments: [{ nick: "전동휠체어로세상구경", date: "2026-11-17", text: "전동도 엘리베이터 들어가나요?" }, { nick: "휠체어로동해", date: "2026-11-17", text: "네, 일반 전동 크기는 들어가요. 안이 넓은 편이에요." }, { nick: "Test", date: "2026-11-18", text: "엘리베이터 위치 정보 덕분에 헤매지 않았어요. 고마워요!" }] },
  { id: "p02", title: "70대 부모님 모시고 묵호 반나절, 무릎 편한 순서", nick: "부모님효도여행", date: "2026-11-14", kind: "easy", move: ["오래 걷기 어려움"], who: "부모님과", zone: "mukho",
    stops: ["mukho_lighthouse", "nongol", "cafe_harbor", "food_geodong"], rating: 4,
    body: "등대는 차로 바로 위 주차장까지 가서 내리시게 했어요. 논골담길은 내려오는 방향으로만 걸어서 무릎 부담이 덜했어요. 계단이 있는 골목은 미리 길동무에서 확인하고 피했습니다.",
    tips: ["논골담길은 등대 쪽에서 내려오는 길이 편해요", "골목 중간 벤치 3곳 정도", "거동탕수육은 입구 평지"], helpful: 33,
    comments: [{ nick: "무릎조심아빠", date: "2026-11-15", text: "내려오는 방향 팁 좋네요. 저도 그렇게 해 볼게요." }] },
  { id: "p03", title: "돌 지난 아기랑 유모차로 망상해변 산책", nick: "아기랑첫바다", date: "2026-11-10", kind: "easy", move: ["유모차"], who: "아이와", zone: "mangsang",
    stops: ["mangsang", "cafe_clam", "nobong"], rating: 4,
    body: "망상해변 산책로는 포장이 잘 돼 있어서 유모차 밀기 좋았어요. 클램은 유아 의자가 있고 수유할 자리도 물어보니 안내해 주셨어요. 노봉해변은 모래라 유모차는 입구까지만.",
    tips: ["망상 산책로 바닥 평평", "클램 유아 의자 있음", "노봉해변 모래사장은 유모차 어려움"], helpful: 28, comments: [{ nick: "Test", date: "2026-11-11", text: "유모차로 가기 좋은 바다 찾고 있었는데 딱이네요." }] },
  { id: "p04", title: "비 오는 날 천곡동굴, 실내 위주로 바꾸니 좋았어요", nick: "비오는날동굴", date: "2026-11-08", kind: "free", move: [], who: "연인·친구", zone: "cheongok",
    stops: ["cave", "nature_park", "cafe_ddori", "food_imgye"], rating: 4,
    body: "비 예보 보고 동이한테 실내 위주로 바꿔 달라고 했어요. 동굴 안은 계단이 꽤 있어서 걷기 편한 분께만 추천해요. 끝나고 한우 먹고 커피까지 시내에서 해결.",
    tips: ["동굴 안 계단 많고 천장 낮은 곳 있음 (머리 조심)", "우산은 입구 보관함에"], helpful: 19,
    comments: [{ nick: "동해토박이", date: "2026-11-09", text: "동굴 안은 늘 15도쯤이라 여름엔 시원하고 겨울엔 따뜻해요." }] },
  { id: "p05", title: "초록봉 등산 후 천곡항에서 바다 보기", nick: "초록봉등산러", date: "2026-11-02", kind: "free", move: [], who: "혼자", zone: "cheongok",
    stops: ["chorokbong", "cheongok_port", "hanseom"], rating: 5,
    body: "초록봉은 왕복 2시간 정도, 정상에서 시내랑 바다가 한눈에 보여요. 내려와서 천곡항이랑 한섬 감성바닷길까지 걸었어요. 등산화 꼭 신으세요.",
    tips: ["초록봉 등산로는 흙길·바위 구간 있음", "한섬 바닷길 터널 안은 어둡지 않아요"], helpful: 22, comments: [] },
  { id: "p06", title: "전동휠체어로 무릉별유천지 다녀왔어요", nick: "전동휠체어로세상구경", date: "2026-10-30", kind: "easy", move: ["휠체어"], who: "혼자", zone: "mureung",
    stops: ["mureung", "cafe_byeolyu", "food_daege"], rating: 4,
    body: "방문자센터까지 평지라 문제없었고, 호수 쪽 데크는 완만한 경사가 있어요. 전동이라 괜찮았는데 수동이면 동행이 필요할 것 같아요. 충전기 위치를 미리 봐 둬서 마음이 놓였어요.",
    tips: ["방문자센터 장애인 화장실 깨끗", "호수 전망 데크 경사 완만, 수동은 동행 권장", "전망카페는 엘리베이터 있음"], helpful: 37, comments: [] },
  { id: "p07", title: "KTX 타고 당일치기, 차 없이 묵호 한 바퀴", nick: "서울에서KTX", date: "2026-10-27", kind: "free", move: [], who: "혼자", zone: "mukho",
    stops: ["nongol", "mukho_lighthouse", "dokkaebi", "food_jangsu"], rating: 5,
    body: "묵호역에서 걸어서 다 돌 수 있어요. 오르막이 좀 있지만 풍경이 보상해 줍니다. 장수돌짜장 가리비짬뽕 추천.",
    tips: ["묵호역 → 논골담길 걸어서 15분", "오르막 구간 있음"], helpful: 15, comments: [] },
  { id: "p08", title: "할머니 칠순 기념, 3대가 추암 해돋이", nick: "칠순기념여행", date: "2026-10-25", kind: "easy", move: ["오래 걷기 어려움"], who: "부모님과", zone: "chuam",
    stops: ["chotdae", "haeamjeong", "food_chuam_hanki"], rating: 4,
    body: "해돋이는 촛대바위 아래 데크에서 봤어요. 할머니는 주차장 가까운 벤치에서 보셨는데 그래도 잘 보였어요. 출렁다리는 걷는 거리가 있어서 젊은 사람들만 다녀왔습니다.",
    tips: ["해돋이 땐 주차장이 일찍 차요 (6시 전 도착 추천)", "주차장 옆 벤치에서도 해 보임"], helpful: 26,
    comments: [{ nick: "해돋이부부", date: "2026-10-26", text: "겨울엔 바람이 세니 담요 꼭 챙기세요!" }] },
  { id: "p09", title: "유모차 + 비 오는 날, 연필뮤지엄 강추", nick: "유모차부대장", date: "2026-10-20", kind: "easy", move: ["유모차"], who: "아이와", zone: "mukho",
    stops: ["pencil_museum", "bookvillage", "cafe_karamel"], rating: 4,
    body: "연필뮤지엄은 실내라 비 와도 좋고 아이들이 신기해해요. 책방마을은 계단식 좌석이 있어서 유모차는 입구에 세워 뒀어요.",
    tips: ["연필뮤지엄 화·수 휴관", "책방마을 안쪽은 계단식 좌석"], helpful: 12, comments: [] },
  { id: "p10", title: "무릉계곡 반석까지만, 어르신도 갈 만해요", nick: "시니어산책클럽", date: "2026-10-18", kind: "easy", move: ["오래 걷기 어려움"], who: "단체", zone: "mureung",
    stops: ["valley", "food_boribat", "samhwasa"], rating: 4,
    body: "회원 여덟 명이 다녀왔어요. 무릉반석까지는 길이 넓고 완만해서 다들 괜찮았고, 삼화사는 입구까지만. 용추폭포는 돌길이라 다음에 도전하기로 했어요. 점심은 보리밭 산채비빔밥.",
    tips: ["무릉반석까지 완만한 포장·데크길", "용추폭포 가는 길은 돌길·계단", "보리밭은 좌식·입식 섞여 있음"], helpful: 30, comments: [] },
  { id: "p11", title: "동해 토박이가 알려 주는 한적한 해변 코스", nick: "동해토박이", date: "2026-10-12", kind: "free", move: [], who: "연인·친구", zone: "mukho",
    stops: ["eodal", "daejin", "kkamak", "cafe_harbor"], rating: 5,
    body: "주말에 망상·추암이 붐비면 어달·대진 쪽으로 가요. 까막바위는 사진 찍기 좋고 사람도 적어요.",
    tips: ["어달해변 산책로 평지", "대진해변은 서핑하는 분들 많음"], helpful: 24, comments: [] },
  { id: "p12", title: "휠체어 + 기차, 동해역 도착 후 이렇게 움직였어요", nick: "휠체어로동해", date: "2026-10-08", kind: "easy", move: ["휠체어"], who: "혼자", zone: "cheongok",
    stops: ["cave", "food_yeongbin", "hanseom"], rating: 3,
    body: "동해역에서 1577-2014로 휠체어 차량을 불렀는데 평일이라 30분쯤 기다렸어요. 미리 예약하면 훨씬 수월할 것 같아요. 천곡동굴은 휠체어로는 입구까지만이에요.",
    tips: ["휠체어 차량은 전날 예약 추천", "천곡동굴 내부는 계단이라 휠체어 불가", "영빈관 경사로 있음"], helpful: 45,
    comments: [{ nick: "쉬엄쉬엄여행", date: "2026-10-09", text: "차량 대기 시간 정보 정말 도움 돼요." }] },
  { id: "p13", title: "라벤더 시즌 무릉별유천지, 사진 맛집", nick: "라벤더좋아", date: "2026-06-21", kind: "free", move: [], who: "연인·친구", zone: "mureung",
    stops: ["mureung", "cafe_byeolyu", "yongchu"], rating: 5,
    body: "6월 라벤더 축제 때 다녀왔어요. 보라색 들판이 정말 예뻐요. 무릉별열차 타면 덜 걸어도 돼요.",
    tips: ["라벤더는 6월 중순이 절정", "무릉별열차로 이동하면 걷는 거리 줄어요"], helpful: 18, comments: [] },
  { id: "p14", title: "무릎 수술 후 첫 여행, 쉬엄쉬엄 망상", nick: "쉬엄쉬엄여행", date: "2026-09-29", kind: "easy", move: ["오래 걷기 어려움"], who: "연인·친구", zone: "mangsang",
    stops: ["mangsang", "food_mangsang_mak", "cafe_giguin"], rating: 4,
    body: "동이한테 '더 느긋하게' 눌러서 3곳만 넣었어요. 중간에 카페에서 오래 쉬니 무리 없었어요.",
    tips: ["망상해변 벤치 간격 넓은 편", "막국수집 입식 테이블 있음"], helpful: 14, comments: [] },
  { id: "p15", title: "추암 출렁다리, 계단 각오하고 가세요", nick: "혼자걷는토요일", date: "2026-09-21", kind: "free", move: [], who: "혼자", zone: "chuam",
    stops: ["chotdae", "chuam_bridge", "chuam_sculpture", "haeamjeong"], rating: 4,
    body: "출렁다리까지 가는 길에 계단이 꽤 있어요. 다리 위에서 보는 바다는 최고. 조각공원은 언덕이라 천천히.",
    tips: ["출렁다리 가는 길 계단 다수", "조각공원 잔디 언덕 경사"], helpful: 11, comments: [] },
  { id: "p16", title: "북평 오일장 장날 맞춰 3·8일 방문", nick: "동해토박이", date: "2026-09-18", kind: "free", move: [], who: "부모님과", zone: "chuam",
    stops: ["bukpyeong_market", "hohaejeong", "food_daege"], rating: 4,
    body: "장날(3·8로 끝나는 날)에 맞춰 가야 해요. 길동무가 장날 아니면 코스에서 빼 줘서 헛걸음 안 했어요. 시장 안은 사람이 많아 휠체어·유모차는 이른 시간 추천.",
    tips: ["장날은 3·8·13·18·23·28일", "오전 10시 전이 덜 붐빔"], helpful: 20, comments: [] },
  { id: "p17", title: "손주랑 할머니 둘이서 하평해변", nick: "손주랑할머니", date: "2026-09-10", kind: "easy", move: ["오래 걷기 어려움"], who: "아이와", zone: "cheongok",
    stops: ["hapyeong", "gamchu", "cafe_bakery_dh"], rating: 4,
    body: "하평해변 나무 데크가 평평해서 손주 손 잡고 걷기 좋았어요. 감추해변은 조용하고 바다가 맑아요.",
    tips: ["하평해변 데크 평평", "감추사 가는 길은 계단"], helpful: 9, comments: [] },
  { id: "p18", title: "해돋이 부부의 새벽 추암 + 오후 묵호", nick: "해돋이부부", date: "2026-08-30", kind: "free", move: [], who: "연인·친구", zone: "chuam",
    stops: ["chotdae", "manggyeongdae", "mukho_lighthouse", "little_prince"], rating: 5,
    body: "새벽에 추암에서 해 뜨는 것 보고, 오후엔 묵호로 넘어가 별빛마을 전망대에서 노을까지.",
    tips: ["별빛마을 전망대 가는 길 긴 계단", "만경대 주차 공간 좁음"], helpful: 13, comments: [] },
  { id: "p19", title: "동해휴게소 들러서 망상까지, 운전 쉬어 가기", nick: "강릉말고동해", date: "2026-08-22", kind: "easy", move: ["휠체어"], who: "부모님과", zone: "mangsang",
    stops: ["donghae_rest", "mangsang", "food_mangsang_mak"], rating: 4,
    body: "고속도로 동해휴게소(삼척 방향) 전망대까지 경사로와 점자 블록이 있어서 휠체어로 바다를 볼 수 있었어요. 생각 못 한 명소!",
    tips: ["휴게소 전망대 경사로 있음", "장애인 화장실 휴게소 본관"], helpful: 16, comments: [] },
  { id: "p20", title: "묵호 카페 투어, 커피 세 잔의 하루", nick: "묵호커피산책", date: "2026-08-15", kind: "free", move: [], who: "혼자", zone: "mukho",
    stops: ["cafe_karamel", "nongol", "cafe_harbor", "mukho_park"], rating: 4,
    body: "옛 여관을 고친 카라멜 스테이션에서 시작해 논골담길 골목 걷고 바다 앞 카페에서 마무리.",
    tips: ["카라멜 스테이션은 지하·1층, 계단 있음"], helpful: 8, comments: [] },
];

const KEY = "gd-community";
type Store = { posts: Post[]; helpful: Record<string, boolean>; comments: Record<string, Cmt[]>; hidden: Record<string, boolean>; notes: Record<string, PlaceNote[]> };
export function load(): Store {
  try { const s = JSON.parse(localStorage.getItem(KEY) || "{}"); return { posts: s.posts || [], helpful: s.helpful || {}, comments: s.comments || {}, hidden: s.hidden || {}, notes: s.notes || {} }; }
  catch { return { posts: [], helpful: {}, comments: {}, hidden: {}, notes: {} }; }
}
export function save(s: Store) { try { localStorage.setItem(KEY, JSON.stringify(s)); } catch { /* 저장소를 못 쓰는 브라우저 */ } }
export const today = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`; };
// 내 글 + 예시 글, 내 반응을 합친 목록
export function allPosts(s: Store): Post[] {
  return [...s.posts, ...SEED].filter((p) => !s.hidden[p.id]).map((p) => ({ ...p, helpful: p.helpful + (s.helpful[p.id] ? 1 : 0), comments: [...p.comments, ...(s.comments[p.id] || [])] }));
}
