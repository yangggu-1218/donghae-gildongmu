// 장소 대표 사진: Wikimedia Commons의 자유 이용 사진 (data/photos.csv). 저작자·라이선스를 함께 표시해야 한다.
// 실제 서비스에서는 TourAPI 대표 이미지(공공누리 제1·3유형)로 넓힌다.
export type Photo = { src: string; author: string; license: string; page: string };
export const PHOTOS: Record<string, Photo> = {
  "chotdae": {
    "src": "https://upload.wikimedia.org/wikipedia/commons/thumb/e/e8/%EC%B6%94%EC%95%94%EC%B4%9B%EB%8C%80%EB%B0%94%EC%9C%84_2.jpg/500px-%EC%B6%94%EC%95%94%EC%B4%9B%EB%8C%80%EB%B0%94%EC%9C%84_2.jpg",
    "author": "동해시",
    "license": "KOGL Type 1",
    "page": "https://commons.wikimedia.org/wiki/File:%EC%B6%94%EC%95%94%EC%B4%9B%EB%8C%80%EB%B0%94%EC%9C%84_2.jpg"
  },
  "haeamjeong": {
    "src": "https://upload.wikimedia.org/wikipedia/commons/thumb/1/13/Amlou2518_%EB%B6%81%ED%8F%89%ED%95%B4%EC%95%94%EC%A0%95.jpg/500px-Amlou2518_%EB%B6%81%ED%8F%89%ED%95%B4%EC%95%94%EC%A0%95.jpg",
    "author": "Amlou2518",
    "license": "CC BY-SA 4.0",
    "page": "https://commons.wikimedia.org/wiki/File:Amlou2518_%EB%B6%81%ED%8F%89%ED%95%B4%EC%95%94%EC%A0%95.jpg"
  },
  "valley": {
    "src": "https://upload.wikimedia.org/wikipedia/commons/thumb/f/f3/%EB%AC%B4%EB%A6%89%EA%B3%84%EA%B3%A1%28AMJ%29.jpg/500px-%EB%AC%B4%EB%A6%89%EA%B3%84%EA%B3%A1%28AMJ%29.jpg",
    "author": "칼빈500",
    "license": "CC BY-SA 4.0",
    "page": "https://commons.wikimedia.org/wiki/File:%EB%AC%B4%EB%A6%89%EA%B3%84%EA%B3%A1%28AMJ%29.jpg"
  },
  "samhwasa": {
    "src": "https://upload.wikimedia.org/wikipedia/commons/thumb/1/12/Samhwasa_daeung-jun.jpg/500px-Samhwasa_daeung-jun.jpg",
    "author": "Ground",
    "license": "CC BY 2.0",
    "page": "https://commons.wikimedia.org/wiki/File:Samhwasa_daeung-jun.jpg"
  },
  "cave": {
    "src": "https://upload.wikimedia.org/wikipedia/commons/thumb/f/f0/DH-CGC-CEp13.jpg/500px-DH-CGC-CEp13.jpg",
    "author": "Dittwjfsdgkvkdjg",
    "license": "CC BY-SA 4.0",
    "page": "https://commons.wikimedia.org/wiki/File:DH-CGC-CEp13.jpg"
  },
  "nongol": {
    "src": "https://upload.wikimedia.org/wikipedia/commons/thumb/d/d8/%EB%8F%99%ED%95%B4_%EB%AC%B5%ED%98%B8_%EB%B2%BD%ED%99%94%EB%A7%88%EC%9D%84_%EC%A0%84%EA%B2%BD.JPG/500px-%EB%8F%99%ED%95%B4_%EB%AC%B5%ED%98%B8_%EB%B2%BD%ED%99%94%EB%A7%88%EC%9D%84_%EC%A0%84%EA%B2%BD.JPG",
    "author": "이다미",
    "license": "CC BY-SA 3.0",
    "page": "https://commons.wikimedia.org/wiki/File:%EB%8F%99%ED%95%B4_%EB%AC%B5%ED%98%B8_%EB%B2%BD%ED%99%94%EB%A7%88%EC%9D%84_%EC%A0%84%EA%B2%BD.JPG"
  },
  "mukho_port": {
    "src": "https://upload.wikimedia.org/wikipedia/commons/thumb/9/9b/2016%EB%85%84_7%EC%9B%94_30%EC%9D%BC_See%26Sea_DSC04009.jpg/500px-2016%EB%85%84_7%EC%9B%94_30%EC%9D%BC_See%26Sea_DSC04009.jpg",
    "author": "최광모 (Choe Kwangmo)",
    "license": "CC BY-SA 4.0",
    "page": "https://commons.wikimedia.org/wiki/File:2016%EB%85%84_7%EC%9B%94_30%EC%9D%BC_See%26Sea_DSC04009.jpg"
  },
  "mangsang": {
    "src": "https://upload.wikimedia.org/wikipedia/commons/thumb/9/99/%EB%A7%9D%EC%83%81%ED%95%B4%EC%88%98%EC%9A%95%EC%9E%A5%28AMJ%29.jpg/500px-%EB%A7%9D%EC%83%81%ED%95%B4%EC%88%98%EC%9A%95%EC%9E%A5%28AMJ%29.jpg",
    "author": "칼빈500",
    "license": "CC BY-SA 3.0",
    "page": "https://commons.wikimedia.org/wiki/File:%EB%A7%9D%EC%83%81%ED%95%B4%EC%88%98%EC%9A%95%EC%9E%A5%28AMJ%29.jpg"
  },
  "zone_mukho": {
    "src": "https://upload.wikimedia.org/wikipedia/commons/thumb/e/ed/Mukhohang_Port.jpg/500px-Mukhohang_Port.jpg",
    "author": "Cho Yungkwon (한국관광공사 포토코리아)",
    "license": "KOGL Type 1",
    "page": "https://commons.wikimedia.org/wiki/File:Mukhohang_Port.jpg"
  },
  "zone_mureung": {
    "src": "https://upload.wikimedia.org/wikipedia/commons/thumb/5/59/Samhwasa_and_murung_velley.jpg/500px-Samhwasa_and_murung_velley.jpg",
    "author": "eimoberg",
    "license": "CC BY 2.0",
    "page": "https://commons.wikimedia.org/wiki/File:Samhwasa_and_murung_velley.jpg"
  },
  "city": {
    "src": "https://upload.wikimedia.org/wikipedia/commons/thumb/a/a0/Panoramic_view_of_Donghae.jpg/500px-Panoramic_view_of_Donghae.jpg",
    "author": "Gangwon Office (한국관광공사 포토코리아)",
    "license": "KOGL Type 1",
    "page": "https://commons.wikimedia.org/wiki/File:Panoramic_view_of_Donghae.jpg"
  },
  "dokkaebi": {
    "src": "/photos/500px-dokkaebi.webp",
    "author": "팀 제공",
    "license": "출처 확인 중",
    "page": ""
  },
  "haerang": {
    "src": "/photos/500px-haerang.webp",
    "author": "팀 제공",
    "license": "출처 확인 중",
    "page": ""
  },
  "dokkaebi_2": {
    "src": "/photos/500px-dokkaebi_2.webp",
    "author": "팀 제공",
    "license": "출처 확인 중",
    "page": ""
  },
  "mureung": {
    "src": "/photos/500px-mureung.webp",
    "author": "팀 제공",
    "license": "출처 확인 중",
    "page": ""
  },
  "mureung_lavender": {
    "src": "/photos/500px-mureung_lavender.webp",
    "author": "팀 제공",
    "license": "출처 확인 중",
    "page": ""
  },
  "mureung_night": {
    "src": "/photos/500px-mureung_night.webp",
    "author": "팀 제공",
    "license": "출처 확인 중",
    "page": ""
  },
  "mureung_dumir": {
    "src": "/photos/500px-mureung_dumir.webp",
    "author": "팀 제공",
    "license": "출처 확인 중",
    "page": ""
  },
  "mukho_lighthouse": {
    "src": "/photos/500px-mukho_lighthouse.webp",
    "author": "팀 제공",
    "license": "출처 확인 중",
    "page": ""
  },
  "mukho_lighthouse_2": {
    "src": "/photos/500px-mukho_lighthouse_2.webp",
    "author": "팀 제공",
    "license": "출처 확인 중",
    "page": ""
  },
  "yongchu": {
    "src": "/photos/500px-yongchu.webp",
    "author": "팀 제공",
    "license": "출처 확인 중",
    "page": ""
  },
  "pencil_museum": {
    "src": "/photos/500px-pencil_museum.webp",
    "author": "팀 제공",
    "license": "출처 확인 중",
    "page": ""
  },
  "pencil_museum_2": {
    "src": "/photos/500px-pencil_museum_2.webp",
    "author": "팀 제공",
    "license": "출처 확인 중",
    "page": ""
  },
  "nobong": {
    "src": "/photos/500px-nobong.webp",
    "author": "팀 제공",
    "license": "출처 확인 중",
    "page": ""
  },
  "gamchu": {
    "src": "/photos/500px-gamchu.webp",
    "author": "팀 제공",
    "license": "출처 확인 중",
    "page": ""
  },
  "chuam_sculpture": {
    "src": "/photos/500px-chuam_sculpture.webp",
    "author": "팀 제공",
    "license": "출처 확인 중",
    "page": ""
  },
  "chuam_sculpture_2": {
    "src": "/photos/500px-chuam_sculpture_2.webp",
    "author": "팀 제공",
    "license": "출처 확인 중",
    "page": ""
  },
  "chuam_sculpture_3": {
    "src": "/photos/500px-chuam_sculpture_3.webp",
    "author": "팀 제공",
    "license": "출처 확인 중",
    "page": ""
  },
  "manggyeongdae": {
    "src": "/photos/500px-manggyeongdae.webp",
    "author": "팀 제공",
    "license": "출처 확인 중",
    "page": ""
  },
  "hohaejeong": {
    "src": "/photos/500px-hohaejeong.webp",
    "author": "팀 제공",
    "license": "출처 확인 중",
    "page": ""
  },
  "hohaejeong_2": {
    "src": "/photos/500px-hohaejeong_2.webp",
    "author": "팀 제공",
    "license": "출처 확인 중",
    "page": ""
  },
  "gamchusa": {
    "src": "/photos/500px-gamchusa.webp",
    "author": "팀 제공",
    "license": "출처 확인 중",
    "page": ""
  },
  "gamchusa_2": {
    "src": "/photos/500px-gamchusa_2.webp",
    "author": "팀 제공",
    "license": "출처 확인 중",
    "page": ""
  },
  "gobulgae": {
    "src": "/photos/500px-gobulgae.webp",
    "author": "팀 제공",
    "license": "출처 확인 중",
    "page": ""
  },
  "gobulgae_2": {
    "src": "/photos/500px-gobulgae_2.webp",
    "author": "팀 제공",
    "license": "출처 확인 중",
    "page": ""
  },
  "daejin": {
    "src": "/photos/500px-daejin.webp",
    "author": "팀 제공",
    "license": "출처 확인 중",
    "page": ""
  },
  "daejin_2": {
    "src": "/photos/500px-daejin_2.webp",
    "author": "팀 제공",
    "license": "출처 확인 중",
    "page": ""
  },
  "eodal": {
    "src": "/photos/500px-eodal.webp",
    "author": "팀 제공",
    "license": "출처 확인 중",
    "page": ""
  },
  "eodal_2": {
    "src": "/photos/500px-eodal_2.webp",
    "author": "팀 제공",
    "license": "출처 확인 중",
    "page": ""
  },
  "bookvillage": {
    "src": "/photos/500px-bookvillage.webp",
    "author": "팀 제공",
    "license": "출처 확인 중",
    "page": ""
  },
  "bookvillage_2": {
    "src": "/photos/500px-bookvillage_2.webp",
    "author": "팀 제공",
    "license": "출처 확인 중",
    "page": ""
  },
  "betel": {
    "src": "/photos/500px-betel.webp",
    "author": "팀 제공",
    "license": "출처 확인 중",
    "page": ""
  },
  "betel_2": {
    "src": "/photos/500px-betel_2.webp",
    "author": "팀 제공",
    "license": "출처 확인 중",
    "page": ""
  },
  "hapyeong": {
    "src": "/photos/500px-hapyeong.webp",
    "author": "팀 제공",
    "license": "출처 확인 중",
    "page": ""
  },
  "hapyeong_2": {
    "src": "/photos/500px-hapyeong_2.webp",
    "author": "팀 제공",
    "license": "출처 확인 중",
    "page": ""
  },
  "kkamak": {
    "src": "/photos/500px-kkamak.webp",
    "author": "팀 제공",
    "license": "출처 확인 중",
    "page": ""
  },
  "kkamak_2": {
    "src": "/photos/500px-kkamak_2.webp",
    "author": "팀 제공",
    "license": "출처 확인 중",
    "page": ""
  },
  "little_prince": {
    "src": "/photos/500px-little_prince.webp",
    "author": "팀 제공",
    "license": "출처 확인 중",
    "page": ""
  },
  "little_prince_2": {
    "src": "/photos/500px-little_prince_2.webp",
    "author": "팀 제공",
    "license": "출처 확인 중",
    "page": ""
  },
  "little_prince_3": {
    "src": "/photos/500px-little_prince_3.webp",
    "author": "팀 제공",
    "license": "출처 확인 중",
    "page": ""
  },
  "cheongok_port": {
    "src": "/photos/500px-cheongok_port.webp",
    "author": "팀 제공",
    "license": "출처 확인 중",
    "page": ""
  },
  "cheongok_port_2": {
    "src": "/photos/500px-cheongok_port_2.webp",
    "author": "팀 제공",
    "license": "출처 확인 중",
    "page": ""
  },
  "macheonru": {
    "src": "/photos/500px-macheonru.webp",
    "author": "팀 제공",
    "license": "출처 확인 중",
    "page": ""
  },
  "donghae_rest": {
    "src": "/photos/500px-donghae_rest.webp",
    "author": "팀 제공",
    "license": "출처 확인 중",
    "page": ""
  },
  "donghae_rest_2": {
    "src": "/photos/500px-donghae_rest_2.webp",
    "author": "팀 제공",
    "license": "출처 확인 중",
    "page": ""
  },
  "chuam_bridge": {
    "src": "/photos/500px-chuam_bridge.webp",
    "author": "동해시청",
    "license": "출처 확인 중",
    "page": ""
  },
  "chuam_bridge_2": {
    "src": "/photos/500px-chuam_bridge_2.webp",
    "author": "팀 제공",
    "license": "출처 확인 중",
    "page": ""
  },
  "nature_park": {
    "src": "/photos/500px-nature_park.webp",
    "author": "팀 제공",
    "license": "출처 확인 중",
    "page": ""
  },
  "nature_park_2": {
    "src": "/photos/500px-nature_park_2.webp",
    "author": "팀 제공",
    "license": "출처 확인 중",
    "page": ""
  },
  "hanseom": {
    "src": "/photos/500px-hanseom.webp",
    "author": "팀 제공",
    "license": "출처 확인 중",
    "page": ""
  },
  "hanseom_2": {
    "src": "/photos/500px-hanseom_2.webp",
    "author": "팀 제공",
    "license": "출처 확인 중",
    "page": ""
  },
  "hanseom_3": {
    "src": "/photos/500px-hanseom_3.webp",
    "author": "팀 제공",
    "license": "출처 확인 중",
    "page": ""
  },
  "bukpyeong_market": {
    "src": "/photos/500px-bukpyeong_market.webp",
    "author": "팀 제공",
    "license": "출처 확인 중",
    "page": ""
  },
  "bukpyeong_market_2": {
    "src": "/photos/500px-bukpyeong_market_2.webp",
    "author": "팀 제공",
    "license": "출처 확인 중",
    "page": ""
  },
  "mukho_park": {
    "src": "/photos/500px-mukho_park.webp",
    "author": "팀 제공",
    "license": "출처 확인 중",
    "page": ""
  },
  "mukho_park_2": {
    "src": "/photos/500px-mukho_park_2.webp",
    "author": "팀 제공",
    "license": "출처 확인 중",
    "page": ""
  },
  "chorokbong": {
    "src": "/photos/500px-chorokbong.webp",
    "author": "팀 제공",
    "license": "출처 확인 중",
    "page": ""
  },
  "bongjeong_lotus": {
    "src": "/photos/500px-bongjeong_lotus.webp",
    "author": "한국관광공사",
    "license": "출처 확인 중",
    "page": ""
  },
  "bongjeong_lotus_2": {
    "src": "/photos/500px-bongjeong_lotus_2.webp",
    "author": "팀 제공",
    "license": "출처 확인 중",
    "page": ""
  },
  "bongjeong_lotus_3": {
    "src": "/photos/500px-bongjeong_lotus_3.webp",
    "author": "namgil kim (사진에 표시)",
    "license": "출처 확인 중",
    "page": ""
  },
  "culture_center": {
    "src": "/photos/500px-culture_center.webp",
    "author": "한국관광공사",
    "license": "출처 확인 중",
    "page": ""
  },
  "culture_center_2": {
    "src": "/photos/500px-culture_center_2.webp",
    "author": "팀 제공",
    "license": "출처 확인 중",
    "page": ""
  },
  "bukpyeong_church": {
    "src": "/photos/500px-bukpyeong_church.webp",
    "author": "팀 제공",
    "license": "출처 확인 중",
    "page": ""
  },
  "bukpyeong_church_2": {
    "src": "/photos/500px-bukpyeong_church_2.webp",
    "author": "Wood Honey (사진에 표시)",
    "license": "출처 확인 중",
    "page": ""
  },
  "mukho_market": {
    "src": "/photos/500px-mukho_market.webp",
    "author": "한국관광공사",
    "license": "출처 확인 중",
    "page": ""
  },
  "mukho_market_2": {
    "src": "/photos/500px-mukho_market_2.webp",
    "author": "한국관광공사",
    "license": "출처 확인 중",
    "page": ""
  },
  "gawon": {
    "src": "/photos/500px-gawon.webp",
    "author": "동해시청 (사진에 표시)",
    "license": "출처 확인 중",
    "page": ""
  },
  "gawon_2": {
    "src": "/photos/500px-gawon_2.webp",
    "author": "팀 제공",
    "license": "출처 확인 중",
    "page": ""
  },
  "yakcheon": {
    "src": "/photos/500px-yakcheon.webp",
    "author": "한국관광공사",
    "license": "출처 확인 중",
    "page": ""
  },
  "yakcheon_2": {
    "src": "/photos/500px-yakcheon_2.webp",
    "author": "팀 제공",
    "license": "출처 확인 중",
    "page": ""
  }
};

// 큰 화면용: 위키미디어 표준 썸네일 폭(500·960·1920)만 쓴다.
export const photoAt = (id: string, w: 500 | 960 | 1920) => (PHOTOS[id] ? PHOTOS[id].src.replace("/500px-", `/${w}px-`) : "");

// 장소 상세에 더 보여 줄 사진과 설명
export const GALLERY: Record<string, [string, string, string][]> = {
  bongjeong_lotus: [["bongjeong_lotus_2", "'봉정연당' 표지판과 여름 홍련 단지", "The Bongjeong lotus pond sign and summer lotuses"], ["bongjeong_lotus_3", "7월 말 활짝 핀 연꽃", "Lotuses in full bloom in late July"]],
  culture_center: [["culture_center_2", "동해문화원 정면 (입구 계단 옆에 장애인 리프트)", "Front of the Cultural Center (wheelchair lift by the steps)"]],
  bukpyeong_church: [["bukpyeong_church_2", "성당 안 (1958년 지은 시멘트 블록 성당)", "Inside the 1958 cement-block church"]],
  mukho_market: [["mukho_market_2", "시장 앞 횟집·건어물 거리", "Raw-fish and dried-seafood shops by the market"]],
  gawon: [["gawon_2", "가원습지 생태자연공원 입구 표지와 산책로", "Park entrance sign and path"]],
  yakcheon: [["yakcheon_2", "여름에 여는 야외 온천풀장", "Outdoor hot-spring pool, open in summer"]],
  chuam_bridge: [["chuam_bridge_2", "바다 위 출렁다리와 촛대바위 쪽 해안", "The suspension bridge over the sea"]],
  nature_park: [["nature_park_2", "조명이 켜진 동굴 안 관람로 (난간 있음)", "Lit walkway inside the cave, with handrails"]],
  hanseom: [["hanseom_2", "바다를 향한 조타륜 전망 데크", "Ship-wheel lookout deck over the sea"], ["hanseom_3", "바다로 이어지는 옛 군사 터널", "Old military tunnel opening to the sea"]],
  bukpyeong_market: [["bukpyeong_market_2", "북평민속시장 문화광장 (3·8일 장날)", "Market culture plaza (market days end in 3 and 8)"]],
  mukho_park: [["mukho_park_2", "수변공원 표지석과 보행로", "Park sign stone and walkway"]],
  dokkaebi: [["dokkaebi_2", "스카이사이클과 자이언트 슬라이드", "Sky cycle and giant slide"]],
  mureung: [["mureung_lavender", "라벤더 정원과 무릉별열차", "Lavender garden and the park train"], ["mureung_dumir", "두미르 전망대", "Dumir Observatory"], ["mureung_night", "라벤더축제 야경", "Lavender festival at night"]],
  pencil_museum: [["pencil_museum_2", "천장 가득 매달린 연필과 입구 표지판", "Giant pencils on the ceiling and the entrance signs"]],
  mukho_lighthouse: [["mukho_lighthouse_2", "묵호등대 앞 계단", "Steps in front of Mukho Lighthouse"]],
  chuam_sculpture: [["chuam_sculpture_2", "'섬이 된 바다' 조각과 나무 데크 길", "Sculpture beside the wooden deck path"], ["chuam_sculpture_3", "언덕 위 조각 작품들", "Sculptures on the grassy hill"]],
  hohaejeong: [["hohaejeong_2", "소나무 숲속 정자 호해정 (가는 길은 흙길)", "Hohaejeong pavilion in the pines (dirt path)"]],
  gamchusa: [["gamchusa_2", "바닷가 바위 위 감추사와 계단", "Gamchusa temple and steps above the sea"]],
  gobulgae: [["gobulgae_2", "해변의 어린 왕자 조형물", "Little Prince statue on the beach"]],
  daejin: [["daejin_2", "서핑 대진 글자 조형물", "'Surfing Daejin' letters on the sand"]],
  eodal: [["eodal_2", "바다 옆 산책로", "Seaside walkway"]],
  bookvillage: [["bookvillage_2", "안쪽 책장과 계단식 좌석", "Bookshelves and tiered seating inside"]],
  betel: [["betel_2", "능선의 바위 봉우리", "Rock spires along the ridge"]],
  hapyeong: [["hapyeong_2", "나무 데크에서 본 해변과 방파제", "The beach from the wooden deck"]],
  kkamak: [["kkamak_2", "'정동' 까막바위 표지석", "Kkamak Rock 'true east' marker stone"]],
  little_prince: [["little_prince_2", "어린 왕자 벽화 옆 긴 계단", "Long stairway beside the Little Prince mural"], ["little_prince_3", "벽화가 그려진 언덕길", "Hillside lane with murals"]],
  cheongok_port: [["cheongok_port_2", "천곡항 물놀이 선착장", "Cheongok Port marina"]],
  donghae_rest: [["donghae_rest_2", "전망대로 이어지는 경사로와 점자 블록", "Ramp with tactile paving up to the lookout"]],
};
