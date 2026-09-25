// @ts-nocheck
/*
 * The rest of reference.html's script, being ported piece by piece.
 *
 * Already moved out: the demo data, lane bindings, time helpers, artwork and
 * icons (lib/wall/*), and the header tabs and tiles (React, via `bridge`).
 * Still here: opening tiles (panel and phone sheet), the Fivehundrd card,
 * saves, audio previews, the index strip, Create, sharing.
 */
import { BIND, LANE, LANES, LIFE, PRICE, TOTAL, esc, fmt, lum, pad, rng } from "../../lib/wall/model";
import { PAL, seedWall } from "../../lib/wall/demo";
import { genArt } from "../../lib/wall/art";
import { ICON, LICON } from "../../lib/wall/icons";
import { buildRack } from "../../lib/wall/rack";
import { savesOrder as savesOrderOf, skey } from "../../lib/wall/saves";
import { left, long, short, spotStyle, styleFor, until } from "../../lib/wall/time";

export function startWall(bridge){
const $=s=>document.querySelector(s);
const reduce=matchMedia("(prefers-reduced-motion: reduce)").matches;

let WALL=seedWall();
try{const mine=JSON.parse(localStorage.getItem("fh-claims")||"[]");mine.forEach(s=>{if(Date.now()-s.start<LIFE)WALL[s.no-1]=s})}catch(e){}
bridge.setWall(WALL);



/* ---------- lanes ---------- */
let lane="all";
/* the header tabs are React now; the footer's lane links never change */
function renderLanes(){bridge.setLane(lane)}
function setLane(k){
  lane=k;renderLanes();renderRack();window.scrollTo({top:0});
  requestAnimationFrame(()=>{const f=document.querySelector(".spot:not(.vacant):not(.filler)");f&&openSpot(f,{align:false,auto:true})});
}
document.addEventListener("click",e=>{
  const a=e.target.closest("[data-lane]");if(a&&(a.closest("#lanes")||a.closest("#footLanes"))){e.preventDefault();setLane(a.dataset.lane);return}
  if(e.target.closest("[data-claim]")){e.preventDefault();openClaim();return}
  if(e.target.closest("#brand")){e.preventDefault();$("#q").value="";query="";setLane("all")}
});
let query="",qT;
$("#q").addEventListener("input",e=>{clearTimeout(qT);qT=setTimeout(()=>{query=e.target.value.trim().toLowerCase();renderRack();window.scrollTo({top:0});
  const f=document.querySelector(".spot:not(.vacant):not(.filler)");if(query&&f)openSpot(f,{align:false,auto:true})},140)});

/* ---------- rack ---------- */
const rack=$("#rack");let open=null;
function logoHTML(s){const src=s.logo||s.img;if(src)return `<img src="${src}" alt="">`;return esc(String(s.name||"?").split(/\s+/).filter(w=>/\w/.test(w)).slice(0,2).map(w=>w[0]).join("").toUpperCase())}
/* one entry point per visitor per day, kept in the browser (a cookie in the real build) */
let ENTRY_R=Math.random(),entryNo=1;
try{const today=new Date().toISOString().slice(0,10),e=JSON.parse(localStorage.getItem("fh-entry")||"null");
  if(e&&e.day===today)ENTRY_R=e.r;else localStorage.setItem("fh-entry",JSON.stringify({day:today,r:ENTRY_R}))}catch(e){}
let COLS=5;
function colsNow(){const w=rack.clientWidth||rack.parentElement.clientWidth;return w<430?3:w<640?4:5}
addEventListener("resize",()=>{if(colsNow()!==COLS){const keep=open?.dataset.no;renderRack();if(keep){const el=document.getElementById("s-"+pad(keep));if(el)swapTo(el)}}});
/* the tiles are React now (app/wall/Rack.tsx); this decides what they show */
function renderRack(){
  open=null;
  const C=COLS=colsNow();
  const r=buildRack({wall:WALL,lane,query,cols:C,entryR:ENTRY_R});
  entryNo=r.entryNo;
  bridge.renderRack(r);
  drawCode();stats();
}
/* saves are kept per story (spot number + start), with a small snapshot so they survive the spot ending */
let SAVES=[];try{SAVES=JSON.parse(localStorage.getItem("fh-saves")||"[]")}catch(e){}
bridge.setSaved(SAVES.map(x=>x.k));
const isSaved=s=>SAVES.some(x=>x.k===skey(s));
/* React shows saved state and counters (Save buttons, tile pills) from the store */
function persistSaves(){try{localStorage.setItem("fh-saves",JSON.stringify(SAVES))}catch(e){}bridge.setSaved(SAVES.map(x=>x.k))}
let ACCOUNT=null;try{ACCOUNT=JSON.parse(localStorage.getItem("fh-account")||"null")}catch(e){}
let savesShown=12;
const OPENED=new Set();
const TODAY=new Date().toISOString().slice(0,10);
let SEEN=new Set();try{const d=JSON.parse(localStorage.getItem("fh-seen")||"null");if(d&&d.day===TODAY)SEEN=new Set(d.nos)}catch(e){}
function markSeen(no){if(SEEN.has(no))return;SEEN.add(no);try{localStorage.setItem("fh-seen",JSON.stringify({day:TODAY,nos:[...SEEN]}))}catch(e){}}
function toggleSave(li,s,btn){
  const on=!isSaved(s);
  if(on)SAVES.unshift({k:skey(s),no:s.no,name:s.name,lane:s.lane,start:s.start,link:s.links?.[0]||null,logo:s.logo||null,seed:s.seed,pal:s.pal,savedAt:Date.now()});
  else SAVES=SAVES.filter(x=>x.k!==skey(s));
  s.saves=Math.max(0,(s.saves||0)+(on?1:-1));persistSaves();
  const from=on&&!sheetOn?li.querySelector(".book").getBoundingClientRect():null;
  if(on&&!mobileCard()){const all=savesOrder(),idx=all.findIndex(x=>x.k===skey(s));if(idx>=savesShown)savesShown=Math.ceil((idx+1)/12)*12}
  renderCard();
  if(on){if(sheetOn){btn.classList.remove("pop");void btn.offsetWidth;btn.classList.add("pop");bumpTab()}else flyToCard(li,s,from);toast("Saved to your Fivehundrd card.")}
}
function coverClick(e,s,root){
  const a=e.target.closest("a[data-demo]");if(a){e.preventDefault();toast("Demo spot. Real makers link out to their own pages.");return true}
  const pl=e.target.closest("[data-play]");if(pl){togglePlay(pl.closest("[data-player]"),s);return true}
  const wv=e.target.closest("[data-wave]");if(wv){const r=wv.getBoundingClientRect();startPlay(wv.closest("[data-player]"),s,Math.max(0,Math.min(.98,(e.clientX-r.left)/r.width))*30);return true}
  return false;
}
const headY=()=>$("#top").getBoundingClientRect().bottom+12;
/* one continuous glide: scroll the book to the line first, then swap covers.
   Anything removed above the viewport is compensated in the same frame, so nothing jumps. */
let tween=0,tweenDone=null;
function cancelTween(finish){if(!tween)return;cancelAnimationFrame(tween);tween=0;const d=tweenDone;tweenDone=null;if(finish&&d)d()}
function glideTo(y,done){
  cancelTween(true);
  const max=document.documentElement.scrollHeight-innerHeight;y=Math.max(0,Math.min(max,y));
  const from=scrollY,dist=y-from;
  if(Math.abs(dist)<2||reduce){window.scrollTo(0,y);done&&done();return}
  const dur=Math.min(420,Math.max(180,Math.abs(dist)*.32));let t0=0;tweenDone=done;
  const f=now=>{if(!t0)t0=now-16;const t=Math.max(0,Math.min(1,(now-t0)/dur)),e=1-Math.pow(1-t,3);window.scrollTo(0,from+dist*e);
    if(t<1)tween=requestAnimationFrame(f);else{tween=0;const d=tweenDone;tweenDone=null;d&&d()}};
  tween=requestAnimationFrame(f);
}
["wheel","touchstart"].forEach(ev=>addEventListener(ev,()=>cancelTween(true),{passive:true}));
const rowOf=el=>el.closest(".shelf-row");
const alignY=el=>scrollY+(rowOf(el)||el).getBoundingClientRect().top-headY()+4;
function placeNotch(el,panel){const b=el.querySelector(".book").getBoundingClientRect(),p=panel.getBoundingClientRect();panel.style.setProperty("--nx",(b.left+b.width/2-p.left)+"px")}
function swapTo(el){
  const s=WALL[el.dataset.no-1];if(el===open)return;
  const before=el.getBoundingClientRect().top;
  stopAudio();
  if(!OPENED.has(s.no)){OPENED.add(s.no);s.opens=(s.opens||0)+1}
  markSeen(s.no);
  /* React renders the panel under the row (app/wall/Rack.tsx) */
  bridge.open(s.no,"panel");
  placeNotch(el,rack.querySelector(".panel"));
  const shift=el.getBoundingClientRect().top-before;if(shift)window.scrollTo(0,scrollY+shift);
  open=el;
  try{history.replaceState(null,"","#"+pad(s.no))}catch(e){}
  updateMarks();renderCard();
}
function openSpot(el,{align,auto}){
  if(!el||el.classList.contains("vacant")||el.classList.contains("filler"))return;
  if(phoneSheet()){if(auto)return;return showSheet(el)}
  if(el===open){if(align)glideTo(alignY(el));return}
  if(!align){swapTo(el);return}
  glideTo(alignY(el),()=>swapTo(el));
}
const spotFor=e=>{const pnl=e.target.closest(".panel");return pnl?document.getElementById("s-"+pad(+pnl.dataset.no)):e.target.closest(".spot")};
rack.addEventListener("click",e=>{
  const el=spotFor(e);if(!el||el.classList.contains("filler"))return;
  const s=WALL[el.dataset.no-1];
  if(e.target.closest(".panel")){
    if(coverClick(e,s,el))return;
    const sv=e.target.closest("[data-save]");if(sv)return toggleSave(el,s,sv);
    if(e.target.closest("[data-share]"))return shareSpot(s);
    if(e.target.closest("[data-next]"))return step(1);
    return;
  }
  if(el.classList.contains("vacant")){if(e.target.closest(".book,.cap"))openClaim(+el.dataset.no);return}
  if(e.target.closest(".book,.cap")){if(el===open)return closeSpot();openSpot(el,{align:true})}
});
function closeSpot(){
  if(sheetOn)return hideSheet();
  if(!open)return;stopAudio();const el=open;
  const before=el.getBoundingClientRect().top;
  bridge.close();open=null;
  const shift=el.getBoundingClientRect().top-before;if(shift)window.scrollTo(0,scrollY+shift);
  try{history.replaceState(null,"",location.pathname+location.search)}catch(e){}
  updateMarks();
}
function step(d){
  const list=[...rack.querySelectorAll(".spot:not(.vacant):not(.filler)")];if(!list.length)return;
  const i=open?list.indexOf(open):-1;const n=list[Math.max(0,Math.min(list.length-1,i+d))];openSpot(n,{align:true});
}
addEventListener("keydown",e=>{
  if($(".veil.on")){if(e.key==="Escape")closeVeils();return}
  if(e.target.matches("input,textarea"))return;
  if(e.key==="j"||e.key==="ArrowDown"&&e.altKey){e.preventDefault();step(1)}
  if(e.key==="k"||e.key==="ArrowUp"&&e.altKey){e.preventDefault();step(-1)}
});

let reading=null;

/* ---------- previews: synth for demo spots, real audio for uploads ---------- */
let AC=null,player=null,NOISE=null;
const mtof=m=>440*2**((m-69)/12);
function tone(out,f,at,dur,type,vol,att=.01){const o=AC.createOscillator(),g=AC.createGain();o.type=type;o.frequency.value=f;g.gain.setValueAtTime(.0001,at);g.gain.exponentialRampToValueAtTime(vol,at+att);g.gain.exponentialRampToValueAtTime(.0001,at+dur);o.connect(g).connect(out);o.start(at);o.stop(at+dur+.05)}
function noise(out,at,dur,vol,type,freq){const n=AC.createBufferSource();n.buffer=NOISE;const f=AC.createBiquadFilter();f.type=type;f.frequency.value=freq;const g=AC.createGain();g.gain.setValueAtTime(vol,at);g.gain.exponentialRampToValueAtTime(.0001,at+dur);n.connect(f).connect(g).connect(out);n.start(at);n.stop(at+dur+.02)}
function kick(out,at){const o=AC.createOscillator(),g=AC.createGain();o.frequency.setValueAtTime(120,at);o.frequency.exponentialRampToValueAtTime(42,at+.14);g.gain.setValueAtTime(.8,at);g.gain.exponentialRampToValueAtTime(.0001,at+.32);o.connect(g).connect(out);o.start(at);o.stop(at+.35)}
function scheduleSynth(s,out,now,off){
  if(!NOISE){NOISE=AC.createBuffer(1,AC.sampleRate*.5,AC.sampleRate);const d=NOISE.getChannelData(0);for(let i=0;i<d.length;i++)d[i]=Math.random()*2-1}
  const r=rng(s.seed),pod=s.lane==="podcasts",bpm=pod?84:68+Math.floor(r()*56),b=60/bpm,minor=r()<.6;
  const sc=minor?[0,2,3,5,7,8,10]:[0,2,4,5,7,9,11],root=45+Math.floor(r()*9);
  const prog=[[0,5,3,4],[0,3,4,4],[5,3,0,4],[0,4,5,3],[0,2,5,4]][Math.floor(r()*5)];
  const semi=d=>sc[((d%7)+7)%7]+12*Math.floor(d/7);
  const lp=AC.createBiquadFilter();lp.type="lowpass";lp.frequency.value=pod?900:1400;lp.connect(out);
  const lead=["triangle","sine","square"][Math.floor(r()*3)],drums=!pod&&r()<.85,swing=r()*.08;
  for(let beat=0;beat*b<30;beat++){
    const t=beat*b;if(t<off-.01)continue;const at=now+(t-off),br=rng(s.seed+beat*31),bar=Math.floor(beat/4),deg=prog[bar%4];
    if(beat%4===0||t-off<.01&&beat%4){const len=(4-beat%4)*b;[0,2,4].forEach(k=>tone(lp,mtof(root+12+semi(deg+k)),at,len,"triangle",pod?.05:.045,.25))}
    if(beat%2===0)tone(lp,mtof(root-12+semi(deg)),at,b*1.6,"sine",.22,.02);
    if(drums){if(beat%4===0||(beat%4===2&&br()<.5))kick(out,at);if(beat%4===1||beat%4===3)noise(out,at,.16,.22,"bandpass",1800);noise(out,at,.04,.05,"highpass",7000);noise(out,at+b/2+swing*b,.04,.035,"highpass",7000)}
    for(let k=0;k<2;k++)if(br()<(pod?.18:.34)&&bar>0){const d=deg+[0,2,4,5,7][Math.floor(br()*5)];tone(lp,mtof(root+24+semi(d)),at+k*b/2,b*(.4+br()*.6),lead,lead==="square"?.025:.06)}
  }
}
function togglePlay(root,s){if(player&&player.root===root){stopAudio();return}startPlay(root,s,0)}
function startPlay(root,s,off){
  stopAudio();root.classList.add("playing");
  if(s.audio){const a=new Audio(s.audio);a.currentTime=off;a.play().catch(()=>{});a.onended=stopAudio;player={root,a,pos:()=>a.currentTime,dur:()=>Math.min(30,a.duration||30)}}
  else{try{AC=AC||new (window.AudioContext||window.webkitAudioContext)();AC.resume()}catch(e){toast("Audio isn't available in this browser.");root.classList.remove("playing");return}
    const m=AC.createGain();m.gain.setValueAtTime(.0001,AC.currentTime);m.gain.exponentialRampToValueAtTime(.55,AC.currentTime+.3);m.connect(AC.destination);
    scheduleSynth(s,m,AC.currentTime+.05,off);const t0=AC.currentTime+.05-off;player={root,m,pos:()=>Math.max(off,AC.currentTime-t0),dur:()=>30}}
  const tick=()=>{if(!player||player.root!==root)return;const p=player.pos(),d=player.dur();
    if(p>=d-.05){stopAudio();return}
    root.style.setProperty("--p",(p/d*100)+"%");root.querySelector("[data-ptime]").textContent=mmss(p)+" / "+mmss(d);player.raf=requestAnimationFrame(tick)};
  tick();
}
const mmss=t=>Math.floor(t/60)+":"+String(Math.floor(t%60)).padStart(2,"0");
function stopAudio(){
  if(!player)return;const p=player;player=null;cancelAnimationFrame(p.raf);
  if(p.a)p.a.pause();
  if(p.m){try{p.m.gain.cancelScheduledValues(AC.currentTime);p.m.gain.setTargetAtTime(.0001,AC.currentTime,.04)}catch(e){}setTimeout(()=>p.m.disconnect(),300)}
  p.root.classList.remove("playing");p.root.style.setProperty("--p","0%");const t=p.root.querySelector("[data-ptime]");if(t)t.textContent="0:00 / "+mmss(p.a?Math.min(30,p.a.duration||30):30);
}
document.addEventListener("visibilitychange",()=>{if(document.hidden)stopAudio()});

/* ---------- the index strip: all 500 at a glance ---------- */
const cv=$("#codeCanvas"),ctx=cv.getContext("2d");
function cssv(n){return getComputedStyle(document.documentElement).getPropertyValue(n).trim()}
function drawCode(){
  const dpr=devicePixelRatio||1,w=cv.clientWidth,h=cv.clientHeight;if(!w||!h)return;
  if(cv.width!==Math.round(w*dpr)||cv.height!==Math.round(h*dpr)){cv.width=Math.round(w*dpr);cv.height=Math.round(h*dpr)}
  ctx.setTransform(dpr,0,0,dpr,0,0);ctx.clearRect(0,0,w,h);
  const ink=cssv("--ink"),line=cssv("--line"),row=h/TOTAL;
  WALL.forEach((s,i)=>{
    const y=i*row;const inLane=lane==="all"||(!s.vacant&&s.lane===lane);
    if(s.vacant){ctx.fillStyle=line;ctx.globalAlpha=lane==="all"?.9:.3;ctx.fillRect(w*.55,y,w*.45,Math.max(row*.8,.6))}
    else{ctx.fillStyle=ink;ctx.globalAlpha=inLane?.25+.75*(left(s)/LIFE):.12;ctx.fillRect(0,y,w,Math.max(row*.8,.6))}
  });
  ctx.globalAlpha=1;updateMarks();
}
const mkR=document.querySelector(".mk-r"),mkO=document.querySelector(".mk-o"),mkE=document.querySelector(".mk-e");
function updateMarks(){
  const h=cv.clientHeight,row=h/TOTAL;
  const put=(m,el)=>{if(!el){m.style.display="none";return}m.style.display="block";m.style.transform=`translateY(${(el.dataset.no-1)*row-2}px)`};
  put(mkR,reading);put(mkO,open);put(mkE,query?null:document.getElementById("s-"+pad(entryNo)));
}
let scrubbing=false;const code=$("#code"),scrub=$("#scrub");
function nearestVisible(no){for(let d=0;d<TOTAL;d++){for(const n of[no+d,no-d]){const el=document.getElementById("s-"+pad(n));if(el&&(!el.classList.contains("vacant")||lane==="all"))return el}}return null}
function scrubTo(e){
  const r=code.getBoundingClientRect();const no=Math.min(TOTAL,Math.max(1,Math.floor((e.clientY-r.top)/r.height*TOTAL)+1));
  const el=nearestVisible(no);if(!el)return;
  window.scrollTo({top:window.scrollY+el.getBoundingClientRect().top-headY()+2,behavior:"instant"});
  const s=WALL[el.dataset.no-1];scrub.textContent=s.vacant?`No. ${pad(s.no)}  open spot`:`No. ${pad(s.no)}  ${s.name}`;scrub.style.top=e.clientY+"px";scrub.classList.add("on");
  return el;
}
let lastScrub=null;
code.addEventListener("pointerdown",e=>{cancelTween(false);scrubbing=true;code.setPointerCapture(e.pointerId);lastScrub=scrubTo(e)});
code.addEventListener("pointermove",e=>{if(scrubbing)lastScrub=scrubTo(e)||lastScrub});
const endScrub=()=>{if(!scrubbing)return;scrubbing=false;scrub.classList.remove("on");if(lastScrub){if(lastScrub.classList.contains("vacant"))lastScrub=nearestVisible(+lastScrub.dataset.no+1);openSpot(lastScrub,{align:true})}};
code.addEventListener("pointerup",endScrub);code.addEventListener("pointercancel",endScrub);

/* ---------- live pulse ---------- */
function stats(){renderCard()}
const savesOrder=()=>savesOrderOf(SAVES,WALL);
/* the book leaves the shelf and flies into your card, shrinking to the card's width */
const mobileCard=()=>matchMedia("(max-width:979px)").matches;
let cardOpen=false;
/* the badge's count is React (TabBadge); this only pops it */
function bumpTab(){const n=$("#tbN");if(!n)return;n.classList.remove("pop");void n.offsetWidth;n.classList.add("pop")}
function ghostBook(li,from){
  const g=document.createElement("div");g.className="flyer";g.setAttribute("style",li.getAttribute("style")+`;left:${from.left}px;top:${from.top}px;width:${from.width}px;height:${from.height}px`);
  const b=li.querySelector(".book").cloneNode(true);b.style.cssText="width:100%;height:100%;transform:none;aspect-ratio:auto";g.appendChild(b);document.body.appendChild(g);return g;
}
function flyToTab(li,from){
  const tab=document.querySelector('[data-tab="card"] .tb-ic');if(!tab||reduce){bumpTab();return}
  const to=tab.getBoundingClientRect(),k=Math.max(.12,to.height*1.3/from.height);
  const g=ghostBook(li,from),dx=to.left+to.width/2-from.left-from.width*k/2,dy=to.top-from.top-4;
  const a=g.animate([
    {transform:"translate(0,0) scale(1) rotate(0)",opacity:1,transformOrigin:"0 0"},
    {transform:`translate(${dx*.4}px,${dy*.4-60}px) scale(${(1+k)/2}) rotate(-8deg)`,opacity:1,offset:.45,transformOrigin:"0 0"},
    {transform:`translate(${dx}px,${dy}px) scale(${k}) rotate(0)`,opacity:.3,transformOrigin:"0 0"}
  ],{duration:620,easing:"cubic-bezier(.3,.7,.2,1)"});
  const done=()=>{g.remove();bumpTab()};a.onfinish=done;a.oncancel=done;
}
function setCard(open){
  cardOpen=open;$("#card").classList.toggle("on",open);$("#cardVeil").classList.toggle("on",open);
  document.querySelectorAll(".tabbar [data-tab]").forEach(b=>{const on=(b.dataset.tab==="card")===open&&b.dataset.tab!=="create";b.classList.toggle("on",on);if(on)b.setAttribute("aria-current","page");else b.removeAttribute("aria-current")});
  document.querySelector('[data-tab="card"]').setAttribute("aria-expanded",open);
  if(open)$("#card").scrollTop=0;
}
document.querySelector(".tabbar").addEventListener("click",e=>{
  const b=e.target.closest("[data-tab]");if(!b)return;
  if(b.dataset.tab==="card")setCard(!cardOpen);
  if(b.dataset.tab==="wall"){if(cardOpen)setCard(false);else glideTo(0)}
  if(b.dataset.tab==="create"){setCard(false);openClaim()}
});
$("#cardVeil").addEventListener("click",()=>setCard(false));
addEventListener("keydown",e=>{if(e.key==="Escape"&&cardOpen)setCard(false)});

/* ---------- phones: the tile comes forward as a sheet ---------- */
const phoneSheet=()=>matchMedia("(max-width:699px)").matches;
const dsheet=$("#dsheet"),dveil=$("#dveil"),dscroll=dsheet.querySelector(".dsheet-scroll");
let sheetOn=false,sheetPushed=false,sheetAnim=null;
function fillSheet(s){
  const tr=dsheet.style.transform;dsheet.setAttribute("style",styleFor(s));if(tr)dsheet.style.transform=tr;dsheet.dataset.no=s.no;
  bridge.fillSheet(s.no);dscroll.scrollTop=0;
  dsheet.setAttribute("aria-label",`${s.name}, ${LANE[s.lane]}, spot ${s.no}`);
}
function markOpen(el){
  const s=WALL[el.dataset.no-1];stopAudio();
  if(!OPENED.has(s.no)){OPENED.add(s.no);s.opens=(s.opens||0)+1}
  markSeen(s.no);
  bridge.open(s.no,"sheet");open=el;
  updateMarks();renderCard();
  return s;
}
function showSheet(el){
  const s=WALL[el.dataset.no-1];
  if(sheetOn){ /* next spot: slide the new one in */
    if(el===open)return;
    markOpen(el);
    const out=dscroll.animate([{opacity:1,transform:"none"},{opacity:0,transform:"translateX(-28px)"}],{duration:reduce?0:150,easing:"ease-in"});
    out.onfinish=()=>{fillSheet(s);if(!reduce)dscroll.animate([{opacity:0,transform:"translateX(28px)"},{opacity:1,transform:"none"}],{duration:260,easing:"cubic-bezier(.2,.8,.2,1)"});
      try{history.replaceState(sheetPushed?{sheet:1}:null,"","#"+pad(s.no))}catch(e){}};
    return;
  }
  const from=el.querySelector(".bk-art").getBoundingClientRect();
  markOpen(el);fillSheet(s);
  sheetOn=true;dsheet.hidden=false;dveil.classList.add("on");document.documentElement.classList.add("sheet-lock");
  try{history.pushState({sheet:1},"","#"+pad(s.no));sheetPushed=true}catch(e){sheetPushed=false}
  if(reduce){dsheet.style.transform="none";return}
  /* the tile's artwork travels up into the sheet while the sheet rises */
  dsheet.style.transform="none";
  const art=dscroll.querySelector(".art"),to=art.getBoundingClientRect();
  const g=document.createElement("div");g.className="flyer art-ghost";g.style.cssText=`left:${to.left}px;top:${to.top}px;width:${to.width}px;height:${to.height}px;border-radius:12px;overflow:hidden`;
  g.innerHTML=el.querySelector(".bk-art").innerHTML;document.body.appendChild(g);
  art.style.visibility="hidden";
  const sx=from.width/to.width,sy=from.height/to.height;
  g.animate([{transform:`translate(${from.left-to.left}px,${from.top-to.top}px) scale(${sx},${sy})`,borderRadius:"6px"},{transform:"none",borderRadius:"12px"}],
    {duration:440,easing:"cubic-bezier(.2,.9,.25,1)",fill:"both"}).onfinish=()=>{art.style.visibility="";g.remove()};
  sheetAnim=dsheet.animate([{transform:"translateY(100%)"},{transform:"none"}],{duration:440,easing:"cubic-bezier(.2,.9,.25,1)"});
  setTimeout(()=>dsheet.querySelector(".dclose")?.focus({preventScroll:true}),460);
}
function hideSheet(fromPop){
  if(!sheetOn)return;
  sheetOn=false;stopAudio();
  const el=open;
  if(open){bridge.close();open=null}
  dveil.classList.remove("on");document.documentElement.classList.remove("sheet-lock");
  const done=()=>{dsheet.hidden=true;dsheet.style.transform="translateY(105%)";bridge.fillSheet(null)};
  if(reduce)done();else{const cur=getComputedStyle(dsheet).transform;dsheet.animate([{transform:cur==="none"?"none":cur},{transform:"translateY(105%)"}],{duration:280,easing:"cubic-bezier(.4,0,.6,1)"}).onfinish=done}
  if(sheetPushed&&!fromPop){sheetPushed=false;try{history.back()}catch(e){}}else{sheetPushed=false;try{history.replaceState(null,"",location.pathname+location.search)}catch(e){}}
  updateMarks();
  /* keep the tile you were on in view behind the sheet */
  if(el){const r=el.getBoundingClientRect();if(r.top<headY()||r.bottom>innerHeight-80)glideTo(alignY(el))}
  el?.querySelector(".book")?.focus({preventScroll:true});
}
addEventListener("popstate",()=>{if(sheetOn)hideSheet(true)});
dveil.addEventListener("click",()=>hideSheet());
addEventListener("keydown",e=>{if(e.key==="Escape"&&sheetOn)hideSheet()});
dsheet.addEventListener("click",e=>{
  if(e.target.closest(".dclose"))return hideSheet();
  const el=document.getElementById("s-"+pad(+dsheet.dataset.no));if(!el)return;const s=WALL[el.dataset.no-1];
  if(coverClick(e,s,el))return;
  const sv=e.target.closest("[data-save]");if(sv)return toggleSave(el,s,sv);
  if(e.target.closest("[data-share]"))return shareSpot(s);
  if(e.target.closest("[data-next]"))return step(1);
});
/* pull the sheet down to put it away */
(()=>{let y0=0,dy=0,drag=false,t0=0;
  const start=e=>{if(dscroll.scrollTop>0&&!e.target.closest(".grab"))return;drag=true;y0=e.touches[0].clientY;dy=0;t0=performance.now();dsheet.style.transition="none"};
  const move=e=>{if(!drag)return;dy=Math.max(0,e.touches[0].clientY-y0);if(dy>0&&dscroll.scrollTop<=0){e.preventDefault();dsheet.style.transform=`translateY(${dy}px)`;dveil.style.opacity=String(Math.max(0,1-dy/400))}};
  const end=()=>{if(!drag)return;drag=false;dveil.style.opacity="";const v=dy/Math.max(1,performance.now()-t0);
    if(dy>120||v>.6)hideSheet();else{dsheet.animate([{transform:`translateY(${dy}px)`},{transform:"none"}],{duration:220,easing:"cubic-bezier(.2,.9,.25,1)"});dsheet.style.transform="none"}};
  dsheet.addEventListener("touchstart",start,{passive:true});dsheet.addEventListener("touchmove",move,{passive:false});dsheet.addEventListener("touchend",end);dsheet.addEventListener("touchcancel",end);
})();
/* rotating to a wide screen: fall back to the inline panel */
addEventListener("resize",()=>{if(sheetOn&&!phoneSheet()){const el=open;hideSheet();if(el)swapTo(el)}});
function flyToCard(li,s,from){
  if(mobileCard()&&!cardOpen&&from){flyToTab(li,from);return}
  const target=document.querySelector(`#card .msp[data-k="${skey(s)}"]`);if(!target||!from)return;
  if(reduce){target.classList.add("landed");return}
  const to=target.querySelector(".sq").getBoundingClientRect();
  const visible=to.bottom>headY()&&to.top<innerHeight,k=Math.max(.15,to.height*1.25/from.height);
  const g=ghostBook(li,from),dx=to.left+10-from.left,dy=(visible?to.top-4:headY()-from.height*k)-from.top;
  target.classList.add("landing");
  const a=g.animate([
    {transform:"translate(0,0) scale(1) rotate(0)",opacity:1,transformOrigin:"0 0"},
    {transform:`translate(${dx*.45}px,${dy*.45-50}px) scale(${(1+k)/2}) rotate(-6deg)`,opacity:1,offset:.45,transformOrigin:"0 0"},
    {transform:`translate(${dx}px,${dy}px) scale(${k}) rotate(0)`,opacity:0,transformOrigin:"0 0"}
  ],{duration:640,easing:"cubic-bezier(.3,.7,.2,1)"});
  const done=()=>{g.remove();target.classList.remove("landing");target.classList.add("landed")};
  a.onfinish=done;a.oncancel=done;
}
/* the Keep my card sheet is React (app/wall/Sheets.tsx) */
function openKeep(){bridge.openShare({kind:"keep"});$("#shareVeil").classList.add("on")}
bridge.actions.keepCard=(via,remind,byEmail)=>{
  ACCOUNT={via,remind};try{localStorage.setItem("fh-account",JSON.stringify(ACCOUNT))}catch(e){}
  closeVeils();renderCard();toast(byEmail?"Check your inbox for the link. Your card is kept.":"Card kept.");
};
document.addEventListener("click",e=>{
  const card=e.target.closest("#card");
  if(card){
    const un=e.target.closest("[data-unsave]");if(un){e.preventDefault();const k=un.dataset.unsave,x=SAVES.find(y=>y.k===k);SAVES=SAVES.filter(y=>y.k!==k);persistSaves();
      const cur=x&&WALL[x.no-1];if(cur&&!cur.vacant&&skey(cur)===k){cur.saves=Math.max(0,(cur.saves||0)-1);bridge.refresh()}
      renderCard();return}
    if(e.target.closest("[data-more-saves]")){savesShown+=12;renderCard();return}
    if(e.target.closest("[data-less-saves]")){savesShown=12;renderCard();return}
    if(e.target.closest("[data-keep]")){openKeep();return}
  }
});
/* the card is React (app/wall/Card.tsx); this hands it the visitor's state */
function renderCard(){
  bridge.setCard({entryNo,seen:new Set(SEEN),saves:[...SAVES],savesShown,account:ACCOUNT});
}
document.addEventListener("click",e=>{
  const g=e.target.closest("#card [data-go]");if(!g)return;
  if(cardOpen)setCard(false);
  let el=document.getElementById("s-"+pad(+g.dataset.go));
  if(!el){lane="all";query="";const q=$("#q");if(q)q.value="";renderLanes();renderRack();el=document.getElementById("s-"+pad(+g.dataset.go))}
  if(el){if(el===open)glideTo(alignY(el));else openSpot(el,{align:true})}
});
/* the open view's countdown ticks in React (app/wall/Cover.tsx) */
setInterval(()=>{
  let changed=false;WALL.forEach((s,i)=>{if(!s.vacant&&left(s)<=0){WALL[i]={no:s.no,vacant:true};changed=true}});
  if(changed){const keep=open?.dataset.no;renderRack();if(keep)openSpot(document.getElementById("s-"+pad(keep)),{align:false})}
  else bridge.tickMinute();
  stats();drawCode();
},60e3);

/* ---------- sharing ---------- */
const spotURL=s=>location.href.split("#")[0]+"#"+pad(s.no);
async function shareSpot(s){
  const data={title:`${s.name} on fivehundrd.`,text:`${s.name} is on spot ${pad(s.no)} of 500. Gone in ${short(left(s))}.`,url:spotURL(s)};
  if(navigator.share){try{await navigator.share(data);return}catch(e){if(e.name==="AbortError")return}}
  shareSheet(data);
}
/* the share sheet is React (app/wall/Sheets.tsx) */
function shareSheet(d){bridge.openShare({kind:"share",data:d});$("#shareVeil").classList.add("on")}
function closeVeils(){stopAudio();document.querySelectorAll(".veil").forEach(v=>v.classList.remove("on"));document.body.style.overflow=""}
document.querySelectorAll(".veil").forEach(v=>v.addEventListener("click",e=>{if(e.target===v||e.target.closest("[data-close]"))closeVeils()}));
const toast=m=>bridge.toast(m);

/* ---------- claim a spot: the form and success screen are React (app/wall/Claim.tsx) ---------- */
function randomVacant(){const v=WALL.filter(s=>s.vacant);return v.length?v[Math.floor(Math.random()*v.length)].no:null}
function openClaim(no){
  const n=no||randomVacant();if(!n){toast("All 500 spots are taken. Check back soon.");return}
  bridge.openClaim({no:n,lane:lane==="all"?"music":lane,seed:Math.floor(Math.random()*1e9),pal:PAL[Math.floor(Math.random()*PAL.length)]});
  $("#claimVeil").classList.add("on");document.body.style.overflow="hidden";
}
bridge.actions.randomVacant=randomVacant;
bridge.actions.previewClick=(e,p)=>coverClick(e,p);
bridge.actions.share=s=>shareSpot(s);
bridge.actions.spotURL=s=>spotURL(s);
bridge.actions.seeOnWall=no=>{closeVeils();const li=document.getElementById("s-"+pad(no));openSpot(li,{align:true})};
bridge.actions.placeClaim=draft=>{
  if(!WALL[draft.no-1].vacant){const n=randomVacant();if(!n)return "Someone just took the last spot.";draft.no=n}
  setTimeout(()=>{
    const L=draft.lane,s={no:draft.no,lane:L,name:draft.name,snippet:draft.snippet||"New on the wall.",links:draft.links,img:draft.img,logo:draft.logo,seed:draft.seed,pal:draft.pal,start:Date.now(),mine:true,opens:0,saves:0,
      audio:(L==="music"||L==="podcasts")?draft.audio:null,excerpt:(L==="writers"||L==="letters")&&draft.excerpt?.x?draft.excerpt:null,trailer:(L==="art"||L==="games")?draft.trailer:null};
    WALL[s.no-1]=s;
    try{const mine=JSON.parse(localStorage.getItem("fh-claims")||"[]").filter(m=>m.no!==s.no);mine.push(s);localStorage.setItem("fh-claims",JSON.stringify(mine))}catch(e){}
    if(lane!=="all"&&lane!==s.lane){lane="all";renderLanes()}
    renderRack();bridge.claimDone(s);
  },900);
  return null;
};
$("#claimTop").onclick=()=>openClaim();

/* hide the index strip and reading line once the black footer comes up */
try{new IntersectionObserver(([en])=>{document.body.classList.toggle("at-foot",en.isIntersecting)}).observe(document.querySelector(".site-foot"))}catch(e){}
/* ---------- boot ---------- */
function setHead(){document.documentElement.style.setProperty("--headY",($("#top").getBoundingClientRect().bottom+12)+"px");drawCode()}
renderLanes();renderRack();setHead();
addEventListener("resize",setHead);
(document.fonts?document.fonts.ready:Promise.resolve()).then(setHead);
matchMedia("(prefers-color-scheme: dark)").addEventListener?.("change",drawCode);
const h=location.hash.replace("#","");
const start=(h&&document.getElementById("s-"+h.padStart(3,"0")))||rack.querySelector(".spot:not(.vacant):not(.filler)");
requestAnimationFrame(()=>{openSpot(start.classList.contains("vacant")?rack.querySelector(".spot:not(.vacant):not(.filler)"):start,{align:!!h,auto:!h})});
}
