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
  }
};
