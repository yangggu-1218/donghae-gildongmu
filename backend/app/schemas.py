"""데이터 모양 정의. 장소(place) 안에 구간(segment)이 있고, 구간마다 측정값과 판정이 있다."""
from typing import Literal, Optional
from pydantic import BaseModel, Field

Grade = Literal["G", "Y", "R"]          # G 가능 / Y 주의 / R 불가
Mode = Literal["none", "wheel", "stroller", "walk"]


class Segment(BaseModel):
    name: str                            # 예: "주차장 → 방문자센터"
    grade: Optional[Grade] = None        # 측정값이 없을 때 쓰는 휠체어 기준 판정
    distance_m: Optional[float] = None
    steps: Optional[int] = None          # 계단 수
    curb_cm: Optional[float] = None      # 가장 높은 턱
    slope_deg: Optional[float] = None    # 가장 가파른 기울기(도)
    width_m: Optional[float] = None      # 가장 좁은 폭
    surface: Optional[str] = None        # 포장, 데크, 자갈, 모래, 흙길 ...
    alt_route: Optional[str] = None      # 엘리베이터 등 대체 경로가 있으면 설명
    note: str = ""
    source: str = "공공데이터"           # 공공데이터 / 현장 답사 / 이용자 제보
    checked_at: Optional[str] = None     # 확인일 YYYY-MM-DD


class Place(BaseModel):
    id: str
    name_ko: str
    name_en: str = ""
    zone: str                            # chuam / mureung / cheongok / mukho / mangsang
    type: str                            # 관광지, 식당, 카페, 숙박, 실내 ...
    indoor: bool = False
    lat: Optional[float] = None
    lon: Optional[float] = None
    stay_min: int = 60
    styles: list[str] = Field(default_factory=list)   # 바다 보기, 자연·산책, 카페, 맛집, 역사·문화
    facilities: list[str] = Field(default_factory=list)
    intro_ko: str = ""
    intro_en: str = ""
    tip_ko: str = ""
    tip_en: str = ""
    phone: str = ""
    segments: list[Segment] = Field(default_factory=list)
    sample: bool = False                 # 예시 데이터 표시
    # 공공데이터(파일데이터)에서 채우는 값 — backend/app/public_data.py
    address: str = ""
    coord_source: str = ""               # 좌표 출처 (비어 있으면 추정 좌표)
    intro_source: str = ""
    parking: Optional[int] = None        # 주차 가능 대수
    public_facilities: list[str] = Field(default_factory=list)
    trails: list[str] = Field(default_factory=list)   # 지나는 걷기길 이름
    hours: str = ""                      # 관람·운영 시간
    closed_days: str = ""                # 휴관일
    fee: str = ""

    @property
    def verified(self) -> bool:
        """구간 정보(접근성)가 하나라도 있으면 True. 없으면 좌표·소개만 있는 '확인 전' 장소."""
        return bool(self.segments)


class Conditions(BaseModel):
    who: str = "혼자"
    move: list[str] = Field(default_factory=list)   # 휠체어, 오래 걷기 어려움, 계단 어려움, 유모차
    style: list[str] = Field(default_factory=list)
    days: Literal["당일", "1박 2일"] = "당일"
    start: Literal["동해역", "묵호역", "자가용"] = "동해역"
    memo: str = ""
    rain: Optional[bool] = None          # None이면 기상청 예보로 판단
    wish: list[str] = Field(default_factory=list)   # 사용자가 담아 둔 장소 id
    must: list[str] = Field(default_factory=list)   # 대화로 "넣어 줘"라고 한 장소 (반드시 포함)
    lang: Literal["ko", "en"] = "ko"


class Stop(BaseModel):
    id: str
    arrive: str                          # "10:23"
    drive_min: int                       # 이전 지점에서 오는 데 걸린 시간
    grade: Optional[Grade]
    why: str = ""


class Course(BaseModel):
    mode: Mode
    stops: list[Stop]
    overall: Optional[Grade]
    back_at: str
    notes: list[str] = Field(default_factory=list)


class ChatEdit(BaseModel):
    action: Literal["rain", "less_walk", "add", "remove", "none"]
    place_id: Optional[str] = None
    reply: str = ""
