/** 웹 화면의 /api/* 요청을 FastAPI 서버로 넘긴다. 배포 때는 BACKEND_URL 을 서버 주소로 바꾼다. */
const BACKEND = process.env.BACKEND_URL || "http://localhost:8000";
export default {
  async rewrites() {
    return [{ source: "/api/:path*", destination: `${BACKEND}/api/:path*` }];
  },
};
