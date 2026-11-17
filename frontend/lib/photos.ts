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
  }
};

// 큰 화면용: 위키미디어 표준 썸네일 폭(500·960·1920)만 쓴다.
export const photoAt = (id: string, w: 500 | 960 | 1920) => (PHOTOS[id] ? PHOTOS[id].src.replace("/500px-", `/${w}px-`) : "");

// 장소 상세에 더 보여 줄 사진과 설명
export const GALLERY: Record<string, [string, string, string][]> = {
  dokkaebi: [["dokkaebi_2", "스카이사이클과 자이언트 슬라이드", "Sky cycle and giant slide"]],
  mureung: [["mureung_lavender", "라벤더 정원과 무릉별열차", "Lavender garden and the park train"], ["mureung_dumir", "두미르 전망대", "Dumir Observatory"], ["mureung_night", "라벤더축제 야경", "Lavender festival at night"]],
  pencil_museum: [["pencil_museum_2", "천장 가득 매달린 연필과 입구 표지판", "Giant pencils on the ceiling and the entrance signs"]],
  mukho_lighthouse: [["mukho_lighthouse_2", "묵호등대 앞 계단", "Steps in front of Mukho Lighthouse"]],
};
