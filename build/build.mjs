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
let js = fs.readFileSync(`${OUT}/app.js`, "utf8").replaceAll("/dongi/", "dongi/");
fs.writeFileSync(`${OUT}/app.js`, js);
let css = fs.readFileSync(FE + "/app/globals.css", "utf8");
fs.writeFileSync(`${OUT}/app.css`, css);
fs.mkdirSync(`${OUT}/dongi`, { recursive: true });
for (const f of fs.readdirSync(FE + "/public/dongi")) fs.copyFileSync(`${FE}/public/dongi/${f}`, `${OUT}/dongi/${f}`);
console.log("app.js", (js.length / 1024).toFixed(0), "KB");
