// 지도·목록에 쓰는 편의시설 픽토그램: 모두 같은 틀(색 원 + 흰 그림, 24×24)로 그린다. 한국관광공사 열린관광 픽토그램 모양을 참고해 단순하게.
// 글자(충·약·숙·화)를 대신한다. 그림 문자열은 코드에 고정된 값이라 innerHTML 로 넣어도 안전하다.
export const PICTO: Record<string, string> = {
  // 공영주차장: P
  parking: '<path fill-rule="evenodd" d="M7.5 4h5.6a4.6 4.6 0 0 1 0 9.2h-2.6V20h-3zM10.5 6.8v3.6h2.5a1.8 1.8 0 0 0 0-3.6z"/>',
  // 관광안내소: i
  info_centers: '<circle cx="12" cy="6" r="2"/><path d="M9.5 9.5H14v7.5h1.6V20H8.4v-3h1.6v-4.5h-.5z"/>',
  // 숙소: 건물 + 창문 + 문
  lodging: '<path fill-rule="evenodd" d="M5.5 21V5.5L8 3.5h8l2.5 2V21h-5v-4h-3v4zM8 8h2.2v2.2H8zM13.8 8H16v2.2h-2.2zM8 12.5h2.2v2.2H8zM13.8 12.5H16v2.2h-2.2z"/>',
  // 약국·병원: 십자
  medical: '<path d="M9.6 3.5h4.8v6.1h6.1v4.8h-6.1v6.1H9.6v-6.1H3.5V9.6h6.1z"/>',
  // 장애인 화장실: 서 있는 사람 + 휠체어 사용자 (열린관광 '화장실' 그림 단순화)
  toilets: '<circle cx="6" cy="4.6" r="1.8"/><path d="M4.4 7.4h3.2l.8 6H7.3V20.5H5.4V13.4H3.6z"/>'
    + '<circle cx="14.6" cy="4.8" r="1.9"/><path d="M13.6 7.6h2.2v4.2h3.6l2 5.6-1.7.6-1.5-4.2h-4.6z"/>'
    + '<path d="M12.3 10.6a4.7 4.7 0 1 0 6.4 6.6l-1.4-.9a3.1 3.1 0 1 1-4.2-4.4z"/>',
  // 전동휠체어 충전기: 휠체어 사용자 + 배터리
  chargers: '<circle cx="7.4" cy="4.2" r="1.8"/><path d="M6.4 6.8h2v3.9h3.3l1.8 5-1.6.6-1.3-3.7H6.4z"/>'
    + '<path d="M5.2 9.6a4.4 4.4 0 1 0 6 6.2l-1.3-.8a2.9 2.9 0 1 1-3.9-4.1z"/>'
    + '<path fill-rule="evenodd" d="M14.5 6.5h6.5v7h-6.5zM15.9 7.9v4.2h3.7V7.9zM21 8.8h1.2v2.4H21z"/><path d="M16.6 8.5h.8v3h-.8zM18.1 8.5h.8v3h-.8z"/>',
  // 알려진 불편(제보): 느낌표
  barriers: '<path d="M10.4 4h3.2l-.5 10.5h-2.2z"/><circle cx="12" cy="18.3" r="1.9"/>',
  // 이 장소: 별
  place: '<path d="M12 3.2l2.6 5.6 6.1.7-4.5 4.2 1.2 6.1L12 16.8l-5.4 3 1.2-6.1-4.5-4.2 6.1-.7z"/>',
};

export const pictoSvg = (k: string, size = 18) =>
  PICTO[k] ? `<svg viewBox="0 0 24 24" width="${size}" height="${size}" fill="#fff" aria-hidden="true" focusable="false">${PICTO[k]}</svg>` : "";
