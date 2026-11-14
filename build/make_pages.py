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
if SERVER:
    shutil.copytree(f"{SRC}/dongi", f"{OUT}/dongi", dirs_exist_ok=True)
print(OUT, len(html)//1024,"KB")
