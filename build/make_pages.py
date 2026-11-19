import sys, shutil, os
SERVER = len(sys.argv) > 1 and sys.argv[1] == "server"   # server: web/ (백엔드가 같이 서빙) / 기본: GitHub Pages
SRC = "build/dist_server" if SERVER else "build/dist"
js=open(f"{SRC}/app.js").read().replace("</script","<\\/script")
css=open(f"{SRC}/app.css").read()
html=f'''<!doctype html>
<html lang="ko">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<meta name="description" content="가보기 전에 갈 수 있는 길인지 알려 주는 동해 무장애 여행 코스 웹서비스">
<title>동해 길동무</title>
<meta name="theme-color" content="#12355E">
<link rel="icon" type="image/webp" href="dongi/neutral.webp">
<link rel="apple-touch-icon" href="dongi/neutral.webp">
<meta property="og:type" content="website">
<meta property="og:locale" content="ko_KR">
<meta property="og:site_name" content="동해 길동무">
<meta property="og:title" content="동해 길동무 — 가기 전에, 갈 수 있는 길인지 먼저 알려 드려요">
<meta property="og:description" content="휠체어·유모차·무릎이 불편한 가족과도 갈 수 있는 동해 여행 코스를 짜 드려요. 영업시간·붐빔·길 상태까지 확인해요.">
<meta property="og:image" content="https://upload.wikimedia.org/wikipedia/commons/thumb/e/e8/%EC%B6%94%EC%95%94%EC%B4%9B%EB%8C%80%EB%B0%94%EC%9C%84_2.jpg/960px-%EC%B6%94%EC%95%94%EC%B4%9B%EB%8C%80%EB%B0%94%EC%9C%84_2.jpg">
<meta property="og:image:alt" content="해 뜰 무렵의 추암 촛대바위">
<meta name="twitter:card" content="summary_large_image">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=IBM+Plex+Sans+KR:wght@400;600;700&family=Jua&display=swap">
<style>
{css}
.demo-note {{ background: var(--glow); color: var(--ink); border-bottom: 1px solid var(--line); font-size: 14px; line-height: 1.5; }}
.demo-note .in {{ max-width: 1160px; margin: 0 auto; padding-block: 8px; padding-left: max(20px, env(safe-area-inset-left, 0px)); padding-right: max(20px, env(safe-area-inset-right, 0px)); display: flex; flex-wrap: wrap; gap: 4px 14px; align-items: center; }}
.demo-note b {{ font-family: var(--f-display); font-weight: 400; color: var(--sun-deep); }}
.demo-note a {{ color: var(--sea); font-weight: 600; }}
</style>
</head>
<body>
<div id="root"></div>
<script>{js}</script>
</body>
</html>
'''
OUT = "web" if SERVER else "docs"
os.makedirs(OUT, exist_ok=True)
open(f"{OUT}/index.html","w").write(html)
shutil.copytree(f"{SRC}/dongi", f"{OUT}/dongi", dirs_exist_ok=True)   # 시연(docs)에도 새 마스코트 (전엔 서버만 복사해서 docs에 옛 그림이 남았음)
shutil.copytree(f"{SRC}/photos", f"{OUT}/photos", dirs_exist_ok=True)
shutil.copytree(f"{SRC}/icons", f"{OUT}/icons", dirs_exist_ok=True)   # 무장애 픽토그램 (모양 틀)
print(OUT, len(html)//1024,"KB")
