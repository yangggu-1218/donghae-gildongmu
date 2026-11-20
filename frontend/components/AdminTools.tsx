"use client";
import { useEffect, useRef, useState } from "react";

const labels: Record<string,string> = {name:"행사 이름",start:"시작일",end:"끝일",venue:"장소",tel:"문의 전화",url:"안내 링크",access:"접근성 메모",open:"여는 시각",close:"닫는 시각",last_entry:"마지막 입장",b0:"쉬는 시간 시작",b1:"쉬는 시간 끝",phone:"전화",fee:"요금"};
export function SourceImport({tok,target,context,values,apply}: {
  tok:string; target:"event"|"hours"; context:string; values:Record<string,string>; apply:(fields:Record<string,string>)=>void;
}) {
  const [mode,setMode]=useState("url"), [url,setUrl]=useState(""), [file,setFile]=useState<File|null>(null);
  const [busy,setBusy]=useState(false), [error,setError]=useState(""), [filled,setFilled]=useState<string[]|null>(null);
  const active=useRef<AbortController|null>(null);
  useEffect(()=>()=>active.current?.abort(),[]);
  const required=target==="event"?["name","start"]:["open","close"];
  const missing=required.filter(k=>!values[k]);
  const optional=(target==="event"?["end","venue","tel","url","access"]:["last_entry","b0","b1","phone","fee"]).filter(k=>!values[k]);
  async function read() {
    if(active.current) return;
    setError(""); setFilled(null);
    if(mode==="file" && file && file.size>6*1024*1024){setError("6MB 이하 파일을 선택해 주세요.");return;}
    const controller=new AbortController(); active.current=controller; setBusy(true);
    try {
      const body=new FormData();body.set("target",target);body.set("context",context);
      if(mode==="url")body.set("url",url.trim());else if(file)body.set("file",file);
      const r=await fetch("/api/admin/import",{method:"POST",headers:{"x-admin-token":tok},body,signal:controller.signal});
      const data=await r.json();
      if(!r.ok)throw Error(data.detail || "자료를 읽지 못했어요.");
      apply(data.fields);setFilled(Object.keys(data.fields));
    } catch(e:any){if(!controller.signal.aborted)setError(e.message);}
    finally {active.current=null;if(!controller.signal.aborted)setBusy(false);}
  }
  return <section className="source-box wide">
    <h3>안내 자료로 채우기</h3><p>공고에서 확인한 내용을 아래 양식에 채워요. 검토 후 저장해 주세요.</p>
    <div className="source-options">{[["url","사이트 링크"],["file","파일 첨부"]].map(([k,t])=><button key={k} type="button" disabled={busy} aria-pressed={mode===k} onClick={()=>{setMode(k);setFile(null);setError("");}}>{t}</button>)}</div>
    <div className="source-input">{mode==="url"?<input aria-label="안내 페이지 주소" placeholder="https:// 안내 페이지 주소" value={url} onChange={e=>setUrl(e.target.value)}/>:<label>PDF · HWP · HWPX (최대 6MB)<input type="file" accept=".pdf,.hwp,.hwpx" onChange={e=>setFile(e.target.files?.[0]||null)}/></label>}
      <button type="button" className="chip go" disabled={busy || !(mode==="url"?url.trim():file)} onClick={read}>{busy?"자료 읽는 중…":"AI로 채우기"}</button></div>
    {mode==="url" && /^https?:\/\/[^\s]+$/i.test(url.trim()) && <a href={url.trim()} target="_blank" rel="noopener noreferrer">원문 사이트 열기 ↗</a>}
    <div role="status">{error || (filled && <><strong>{filled.length?"채운 항목 · "+filled.map(k=>labels[k]).join(", "):"원문에서 확인한 항목이 없어요."}</strong><p>{missing.length?"직접 입력해 주세요 · "+missing.map(k=>labels[k]).join(", "):"필수 항목이 채워졌어요. 아래 내용을 확인해 주세요."}</p>{optional.length>0 && <details><summary>비어 있는 선택 항목</summary><p>{optional.map(k=>labels[k]).join(", ")}</p></details>}</>)}</div>
  </section>;
}

type Snapshot={checked_at:string;rows:[string,string,string][]};
export function Probe({tok}:{tok:string}) {
  const [result,setResult]=useState<Snapshot|null>(null), [busy,setBusy]=useState(true), [cycle,setCycle]=useState(0);
  useEffect(()=>{
    const controller=new AbortController(); let timer:ReturnType<typeof setTimeout>;
    async function run(){
      setBusy(true);
      try{
        const r=await fetch("/api/admin/health",{headers:{"x-admin-token":tok},signal:controller.signal,cache:"no-store"});
        if(!r.ok)throw Error(r.status===401?"다시 로그인해 주세요.":"서버 응답을 확인해 주세요.");
        const data=await r.json();setResult(data);
      } catch(e:any){if(!controller.signal.aborted)setResult({checked_at:new Date().toISOString(),rows:[["관리자 점검 연결","bad",e.message]]});}
      finally{if(!controller.signal.aborted){setBusy(false);timer=setTimeout(run,60000);}}
    }
    run();return ()=>{controller.abort();clearTimeout(timer);};
  },[tok,cycle]);
  const states:Record<string,string>={ok:"정상",warn:"확인 필요",bad:"장애"};
  return <section className="panel health-panel"><header><div><h2>서비스 상태</h2><p>화면을 열어 두면 1분마다 확인해요.</p></div><button className="chip" disabled={busy} onClick={()=>setCycle(x=>x+1)}>{busy?"점검 중…":"지금 점검하기"}</button></header>
  <div role="status">{result && <><p>최근 점검 · {new Date(result.checked_at).toLocaleTimeString("ko-KR")}</p><ul>{result.rows.map(([name,state,detail])=><li key={name}><strong>{name}</strong><span className={"signal "+state}>{states[state]}</span><small>{detail}</small></li>)}</ul></>}</div></section>;
}
