import fs from "fs"; import { makeApi } from "./api.js";
const api=makeApi(JSON.parse(fs.readFileSync("data.json","utf8"))); const C=JSON.parse(fs.readFileSync("cases.json","utf8")); const out={course:[],talk:[],edit:[]};
const H=(p,b)=>api.handle("POST",p,{},b);
const sm=(r)=>{const cs=r.course, ex=r.extras||{};
 return {ids:cs.stops.map(s=>s.id),arr:cs.stops.map(s=>s.arrive+"-"+s.depart+s.kind+s.open_state+s.wait_min+s.hours_text),grades:cs.stops.map(s=>s.grade),notes:cs.notes,back:cs.back_at,
  date:cs.date+cs.weekday+cs.start_time,skip:cs.skipped,stay:(r.stay||{}).count??null,move:!!r.move,ev:(r.events||[]).map(e=>e.name),onday:r.events_on_day,
  near:Object.keys(ex).map(i=>[...["parking","charger","info_center"].map(k=>(ex[i].nearby[k]||{}).name??null),...Object.values(ex[i].nearby.medical||{}).map(v=>(v||{}).name??null)]),
  acc:Object.keys(ex).map(i=>["walk_load","table","wheelchair","carer_tip"].map(k=>ex[i][k]??null))};};
for(const c of C.course) out.course.push(sm(H("/api/course",c)));
for(const e of C.edit){let r=H("/api/course",e.base);const log=[];
 for(const st of e.steps){const ids=r.course.stops.map(s=>s.id);let body;
  if(st.startsWith("@")){const [a,...rest]=st.slice(1).split(":");let tg=rest.join(":");tg=/^\d+$/.test(tg)?ids[+tg]:(tg||null);body={conditions:r.conditions,course_ids:ids,action:a,target:tg};}
  else body={conditions:r.conditions,course_ids:ids,text:st};
  r=H("/api/edit",body);const cc={};for(const k of ["must","exclude","cap","rest","lunch","flat_only","date","start_time","skip_lunch","rain"])cc[k]=r.conditions[k]??null;
  log.push({...sm(r),reply:r.reply,act:r.action,ch:r.changed,cond:cc});}
 out.edit.push(log);}
for(const [seq,lang] of [...C.talk.map(s=>[s,"ko"]),...C.talk_en.map(s=>[s,"en"])]){let st={conditions:{lang,date:"2026-11-14"},state:{},course_ids:[]};const log=[];
 for(const m of seq){const r=H("/api/talk",{...st,message:m});st={conditions:r.conditions,state:r.state,course_ids:r.course?r.course.stops.map(s=>s.id):st.course_ids};
  log.push({reply:r.reply,pose:r.pose,ids:st.course_ids,cards:r.cards.map(c=>c.kind),move:r.conditions.move,who:r.conditions.who,arr:r.course?r.course.stops.map(s=>s.arrive):null});}
 out.talk.push(log);}
console.log(JSON.stringify(out));
