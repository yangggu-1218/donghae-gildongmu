import { build } from "esbuild";
import fs from "fs";
const FE = "../frontend";
const SERVER = process.env.MODE === "server";   // server: 백엔드와 함께 배포 / 기본: GitHub Pages 정적 데모
const OUT = SERVER ? "dist_server" : "dist";
await build({
  entryPoints: [SERVER ? "entry_server.tsx" : "entry.tsx"], bundle: true, minify: true, format: "iife", target: "es2019", outfile: `${OUT}/app.js`,
  alias: { "@": FE }, nodePaths: [FE + "/node_modules"], jsx: "automatic", charset: "ascii",
  define: { "process.env.NEXT_PUBLIC_KAKAO_JS_KEY": JSON.stringify(process.env.KAKAO_JS_KEY || ""), "process.env.NODE_ENV": '"production"' }, loader: { ".json": "json" },
});
let js = fs.readFileSync(`${OUT}/app.js`, "utf8").replaceAll("/dongi/", "dongi/").replaceAll("/photos/", "photos/").replaceAll("/icons/", "icons/").replaceAll("/icons3d/", "icons3d/");
fs.writeFileSync(`${OUT}/app.js`, js);
let css = fs.readFileSync(FE + "/app/globals.css", "utf8");
fs.writeFileSync(`${OUT}/app.css`, css);
fs.mkdirSync(`${OUT}/dongi`, { recursive: true });
for (const f of fs.readdirSync(FE + "/public/dongi")) fs.copyFileSync(`${FE}/public/dongi/${f}`, `${OUT}/dongi/${f}`);
fs.mkdirSync(`${OUT}/photos`, { recursive: true });
for (const f of fs.readdirSync(FE + "/public/photos")) fs.copyFileSync(`${FE}/public/photos/${f}`, `${OUT}/photos/${f}`);
fs.mkdirSync(`${OUT}/icons`, { recursive: true });
for (const f of fs.readdirSync(FE + "/public/icons")) fs.copyFileSync(`${FE}/public/icons/${f}`, `${OUT}/icons/${f}`);
fs.mkdirSync(`${OUT}/icons3d`, { recursive: true });   // 바로가기 3D 그림 (Microsoft Fluent Emoji, MIT)
for (const f of fs.readdirSync(FE + "/public/icons3d")) fs.copyFileSync(`${FE}/public/icons3d/${f}`, `${OUT}/icons3d/${f}`);
console.log("app.js", (js.length / 1024).toFixed(0), "KB");
