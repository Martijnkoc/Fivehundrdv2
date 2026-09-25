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

const artHTML=s=>s.img?`<img src="${s.img}" alt="Artwork for ${esc(s.name)}">`:genArt(s.seed,s.pal);


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
function extraHTML(s){
  if((s.lane==="music"||s.lane==="podcasts")&&(s.audio||s.demo)){
    const r=rng(s.seed^77),bars=Array.from({length:52},()=>`<span style="height:${22+r()*78}%"></span>`).join("");
    const src=s.links?.[0]?.label||"";
    return `<div class="player" data-player><button class="pp" data-play aria-label="Play preview">${ICON.play.replace("<svg","<svg class=\"pl\"")}${ICON.pause.replace("<svg","<svg class=\"pa\"")}</button><div class="wave" data-wave><div class="bars">${bars}</div><div class="bars on">${bars}</div></div><span class="ptime" data-ptime>0:00 / 0:30</span></div><p class="pcap">${s.lane==="podcasts"?"Episode trailer":"30-second preview"}${src?". Full version on "+esc(src)+".":""}</p>`;
  }
  if((s.lane==="writers"||s.lane==="letters")&&s.excerpt&&s.excerpt.x){
    return `<div class="read"><h3><b>${esc(s.excerpt.t||(s.lane==="writers"?"First pages":"Latest issue"))}</b><span>${s.lane==="writers"?"Read the first pages":"Read the latest issue"}</span></h3><div class="page">${s.excerpt.x.split(/\n\s*\n/).map(p=>`<p>${esc(p.trim())}</p>`).join("")}</div><button class="more" data-more>Keep reading</button></div>`;
  }
  return "";
}
function trailerHTML(s){
  if(!((s.lane==="art"||s.lane==="games")&&s.trailer&&s.trailer.url))return "";
  return `<a class="trailer" href="${esc(s.trailer.url)}" target="_blank" rel="noopener"${s.demo?" data-demo":""} aria-label="Watch the ${s.lane==="games"?"trailer":"video"} on YouTube"><span class="play">${ICON.play}</span><span class="len">${s.lane==="games"?"Trailer":"Watch"} ${esc(s.trailer.len||"")}</span></a>`;
}
function coverHTML(s,preview){
  return `<div class="cover">
    <div class="art">${artHTML(s)}${trailerHTML(s)}${LIFE-left(s)<3*3600e3?'<span class="stamp">Just arrived</span>':""}</div>
    <div class="body">
      <div class="issue"><strong>No. ${pad(s.no)}</strong><span class="lane">${LICON[s.lane]||""}${LANE[s.lane]}</span><span class="live" data-live>${long(left(s))} left</span></div>
      <h2 class="title">${esc(s.name)}</h2>
      <p class="snip">${esc(s.snippet)}</p>
      ${extraHTML(s)}
      <div class="links">${s.links.map(k=>`<a href="${esc(k.url)}" target="_blank" rel="noopener"${s.demo?" data-demo":""}>${esc(k.label)}<span>${esc(k.url.replace(/^https?:\/\//,""))}</span></a>`).join("")}</div>
      ${preview?"":`<div class="acts"><button class="act solid" data-share>Share</button><button class="act" data-save aria-pressed="${isSaved(s)}">${isSaved(s)?"Saved":"Save"}</button><button class="act" data-next>Next spot</button></div>`}
    </div></div>`;
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
  /* the open view's "Keep reading" is React now; the Create preview's is still here */
  const mo=e.target.closest("#fPrev [data-more]");if(mo){const rd=mo.closest(".read");const f=rd.classList.toggle("full");mo.textContent=f?"Show less":"Keep reading";return true}
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

/* ---------- claim a spot ---------- */
let draft,lastP;
function randomVacant(){const v=WALL.filter(s=>s.vacant);return v.length?v[Math.floor(Math.random()*v.length)].no:null}
function openClaim(no){
  const n=no||randomVacant();if(!n){toast("All 500 spots are taken. Check back soon.");return}
  draft={no:n,lane:lane==="all"?"music":lane,name:"",snippet:"",links:[{},{},{}],img:null,seed:Math.floor(Math.random()*1e9),pal:PAL[Math.floor(Math.random()*PAL.length)]};
  $("#claimSheet").innerHTML=`<button class="x" aria-label="Close" data-close>&times;</button>
  <h2 id="claimH">Create your story</h2>
  <p class="sub">Spot <b id="claimNo">${pad(n)}</b>. ${PRICE}, live straight away for three days. <button class="chip" id="reroll" style="padding:3px 10px">Pick another number</button></p>
  <p class="promise">There's no front row. Every visitor starts somewhere else on the wall, so every spot gets its turn at the top.</p>
  <div class="claim-grid">
   <form id="cf" novalidate>
    <div class="f"><label for="fName">Name</label><input type="text" id="fName" maxlength="40" placeholder="Your name, band or project" autocomplete="off"></div>
    <div class="f"><span class="lbl">Lane</span><div class="lanepick" id="fLane">${LANES.map(([k,v])=>`<button type="button" class="chip" data-l="${k}" aria-pressed="${k===draft.lane}">${v}</button>`).join("")}</div></div>
    <div class="f"><span class="lbl">Artwork or logo</span>
      <label class="drop-art"><span class="th" id="fTh">${genArt(draft.seed,draft.pal)}</span><span><input type="file" id="fArt" accept="image/*"><br><span class="hint">Square or landscape works best. No image yet? We'll print a pattern for you.</span></span></label></div>
    <div class="f"><span class="lbl">Logo <span class="hint">(optional)</span></span>
      <label class="drop-art"><span class="th" id="fLogoTh" style="width:40px;height:40px"></span><span><input type="file" id="fLogo" accept="image/*"><br><span class="hint">Shown small on your spine in the rack. Without one we use your artwork.</span></span></label></div>
    <div id="fExtra"></div>
    <div class="f"><span class="lbl">Where people find you</span><span class="hint">Up to three links. Spotify, Steam, Substack, your site, anything.</span>
      ${[0,1,2].map(i=>`<input type="url" data-link="${i}" placeholder="${["open.spotify.com/artist/…","instagram.com/yourname","yourwebsite.com"][i]}" inputmode="url" autocapitalize="off">`).join("")}</div>
    <div class="f"><label for="fSnip">Preview line</label><textarea id="fSnip" maxlength="140" placeholder="One line that makes someone click. What should they hear, read or play first?"></textarea><span class="hint" id="fCount">140 left</span></div>
    <p class="err" id="fErr" role="alert"></p>
    <button class="pay" id="fPay" type="submit">Pay ${PRICE} and go live</button>
    <p class="fine">Prototype. No payment is taken.</p>
   </form>
   <div class="preview"><p class="cap">How it slides out on the wall</p><div id="fPrev"></div></div>
  </div>`;
  const sh=$("#claimSheet");
  const upd=()=>{
    draft.name=$("#fName").value.trim();draft.snippet=$("#fSnip").value.trim();
    $("#fCount").textContent=(140-$("#fSnip").value.length)+" left";
    draft.links=[...sh.querySelectorAll("[data-link]")].map(i=>parseLink(i.value)).filter(Boolean);
    if($("#fEx")){draft.excerpt={t:$("#fExT").value.trim(),x:$("#fEx").value.trim()}}
    if($("#fTrailer")){const t=parseLink($("#fTrailer").value);draft.trailer=t?{url:t.url,len:""}:null}
    if(player&&$("#fPrev").contains(player.root))stopAudio();
    const p=lastP={...draft,name:draft.name||"Your name here",snippet:draft.snippet||"Your preview line shows up here.",links:draft.links.length?draft.links:[{label:"Your link",url:"yourpage.com"}],start:Date.now()};
    $("#fPrev").innerHTML=coverHTML(p,true);
  };
  const extra=()=>{
    const l=draft.lane;let h="";
    if(l==="music"||l==="podcasts")h=`<div class="f"><span class="lbl">${l==="music"?"Song preview":"Episode trailer"} <span class="hint">(optional)</span></span><label class="drop-art"><span class="th" style="display:grid;place-items:center;font-weight:900">${draft.audio?"♪":"+"}</span><span><input type="file" id="fAudio" accept="audio/*"><br><span class="hint">A clip of up to 30 seconds, max 4 MB. Visitors hear it right on the wall.</span></span></label></div>`;
    if(l==="writers"||l==="letters")h=`<div class="f"><label for="fEx">${l==="writers"?"First pages":"Latest issue"} <span class="hint">(optional)</span></label><input type="text" id="fExT" maxlength="60" placeholder="${l==="writers"?"Chapter one":"Issue 12: what I learned this week"}" value="${esc(draft.excerpt?.t||"")}"><textarea id="fEx" maxlength="2500" style="min-height:130px" placeholder="Paste the opening. Leave an empty line between paragraphs.">${esc(draft.excerpt?.x||"")}</textarea></div>`;
    if(l==="art"||l==="games")h=`<div class="f"><label for="fTrailer">${l==="games"?"Trailer":"Video"} link <span class="hint">(optional)</span></label><input type="url" id="fTrailer" placeholder="youtube.com/watch?v=…" inputmode="url" autocapitalize="off" value="${esc(draft.trailer?.url||"")}"><span class="hint">A play button appears on your artwork and opens the video.</span></div>`;
    $("#fExtra").innerHTML=h;
  };
  $("#fPrev").onclick=e=>{if(lastP)coverClick(e,lastP)};
  sh.addEventListener("change",async e=>{
    if(e.target.id==="fLogo"){const f=e.target.files[0];if(!f)return;try{draft.logo=await shrink(f,160);$("#fLogoTh").innerHTML=`<img src="${draft.logo}" alt="">`}catch(err){$("#fErr").textContent="That logo couldn't be read. Try a JPG or PNG."}}
    if(e.target.id==="fAudio"){const f=e.target.files[0];if(!f)return;if(f.size>4e6){$("#fErr").textContent="That audio file is over 4 MB. Trim it to about 30 seconds.";return}
      draft.audio=await new Promise(r=>{const fr=new FileReader();fr.onload=()=>r(fr.result);fr.readAsDataURL(f)});$("#fErr").textContent="";extra();upd()}
  });
  extra();
  sh.addEventListener("input",upd);
  $("#fLane").addEventListener("click",e=>{const b=e.target.closest("[data-l]");if(!b)return;draft.lane=b.dataset.l;extra();$("#fLane").querySelectorAll("button").forEach(x=>x.setAttribute("aria-pressed",x===b));upd()});
  $("#reroll").onclick=()=>{const n2=randomVacant();if(n2){draft.no=n2;$("#claimNo").textContent=pad(n2);upd()}};
  $("#fArt").addEventListener("change",async e=>{const f=e.target.files[0];if(!f)return;try{draft.img=await shrink(f);$("#fTh").innerHTML=`<img src="${draft.img}" alt="">`;upd()}catch(err){$("#fErr").textContent="That file couldn't be read. Try a JPG or PNG."}});
  $("#cf").addEventListener("submit",e=>{e.preventDefault();submitClaim()});
  upd();$("#claimVeil").classList.add("on");document.body.style.overflow="hidden";setTimeout(()=>$("#fName").focus(),50);
}
function parseLink(v){
  v=(v||"").trim();if(!v)return null;
  try{const u=new URL(/^https?:\/\//i.test(v)?v:"https://"+v);if(!u.hostname.includes("."))return null;
    const h=u.hostname.replace(/^www\./,"");
    const map=[["spotify","Spotify"],["bandcamp","Bandcamp"],["soundcloud","SoundCloud"],["music.apple","Apple Music"],["podcasts.apple","Apple Podcasts"],["youtube","YouTube"],["youtu.be","YouTube"],["instagram","Instagram"],["tiktok","TikTok"],["substack","Substack"],["steampowered","Steam"],["itch.io","itch.io"],["goodreads","Goodreads"],["x.com","X"],["twitter","X"],["discord","Discord"],["patreon","Patreon"],["behance","Behance"],["webtoons","Webtoon"]];
    const hit=map.find(([k])=>h.includes(k));return{label:hit?hit[1]:h,url:u.href};
  }catch(e){return null}
}
function shrink(file,m=900){return new Promise((res,rej)=>{const fr=new FileReader();fr.onerror=rej;fr.onload=()=>{const im=new Image();im.onerror=rej;im.onload=()=>{sc=Math.min(1,m/Math.max(im.width,im.height)),c=document.createElement("canvas");c.width=im.width*sc;c.height=im.height*sc;c.getContext("2d").drawImage(im,0,0,c.width,c.height);res(c.toDataURL("image/jpeg",.85))};im.src=fr.result};fr.readAsDataURL(file)})}
function submitClaim(){
  const err=$("#fErr");
  if(!draft.name){err.textContent="Add your name so people know who they're looking at.";$("#fName").focus();return}
  const raw=[...document.querySelectorAll("[data-link]")].filter(i=>i.value.trim());
  if(!draft.links.length){err.textContent=raw.length?"That link doesn't look like a web address. Try something like instagram.com/yourname.":"Add at least one link, so visitors can go and find you.";document.querySelector("[data-link]").focus();return}
  if(!WALL[draft.no-1].vacant){const n=randomVacant();if(!n){err.textContent="Someone just took the last spot.";return}draft.no=n}
  err.textContent="";const b=$("#fPay");b.disabled=true;b.textContent="Placing you on the wall…";
  setTimeout(()=>{
    const L=draft.lane,s={no:draft.no,lane:L,name:draft.name,snippet:draft.snippet||"New on the wall.",links:draft.links,img:draft.img,logo:draft.logo,seed:draft.seed,pal:draft.pal,start:Date.now(),mine:true,opens:0,saves:0,
      audio:(L==="music"||L==="podcasts")?draft.audio:null,excerpt:(L==="writers"||L==="letters")&&draft.excerpt?.x?draft.excerpt:null,trailer:(L==="art"||L==="games")?draft.trailer:null};
    WALL[s.no-1]=s;
    try{const mine=JSON.parse(localStorage.getItem("fh-claims")||"[]").filter(m=>m.no!==s.no);mine.push(s);localStorage.setItem("fh-claims",JSON.stringify(mine))}catch(e){}
    if(lane!=="all"&&lane!==s.lane){lane="all";renderLanes()}
    renderRack();showDone(s);
  },900);
}
async function showDone(s){
  $("#claimSheet").innerHTML=`<button class="x" aria-label="Close" data-close>&times;</button>
   <div class="done"><div>
    <h2 id="claimH">You're on the wall.</h2>
    <p class="sub">Spot ${pad(s.no)} is yours until ${until(s)}. Here's your card to tell people where to find you.</p>
    <div class="sharerow"><button class="act solid" id="dShare">Share my card</button><button class="act" id="dLink">Share link</button><button class="act" id="dSee">See it on the wall</button></div>
    <p class="sub" id="dHint" style="font-size:13px">On your phone, press and hold the card to save it to your photos.</p>
   </div><div id="dCard"><p class="sub">Printing your card…</p></div></div>`;
  $("#dSee").onclick=()=>{closeVeils();const li=document.getElementById("s-"+pad(s.no));openSpot(li,{align:true})};
  $("#dLink").onclick=()=>shareSpot(s);
  let blob=null;
  try{const c=await drawCard(s);const url=c.toDataURL("image/png");$("#dCard").innerHTML=`<img class="card-img" src="${url}" alt="Social card for ${esc(s.name)}, spot ${pad(s.no)}">`;blob=await new Promise(r=>c.toBlob(r,"image/png"))}
  catch(e){$("#dCard").innerHTML=`<p class="sub">The card couldn't be drawn in this browser. Share the link instead.</p>`}
  $("#dShare").onclick=async()=>{
    const f=blob&&new File([blob],`fivehundrd-${pad(s.no)}.png`,{type:"image/png"});
    if(f&&navigator.canShare&&navigator.canShare({files:[f]})){try{await navigator.share({files:[f],text:`I'm on spot ${pad(s.no)} of fivehundrd. ${spotURL(s)}`});return}catch(e){if(e.name==="AbortError")return}}
    toast("Press and hold the card to save it, then post it anywhere.");
  };
}
function loadImg(src){return new Promise((r,j)=>{const i=new Image();i.onload=()=>r(i);i.onerror=j;i.src=src})}
async function drawCard(s){
  try{await document.fonts.ready}catch(e){}
  const W=1080,H=1350,c=document.createElement("canvas");c.width=W;c.height=H;const x=c.getContext("2d");
  x.fillStyle="#ebe5d8";x.fillRect(0,0,W,H);
  // wordmark sticker
  x.save();x.translate(80,70);x.transform(1,0,-.1405,1,0,0);x.fillStyle="#0d0d0d";x.fillRect(0,0,330,84);
  x.font="900 60px Inter, Arial, sans-serif";x.textBaseline="alphabetic";let cx=22;
  for(const [t,col] of [["f","#ff7bc3"],["ive","#fffdf8"],["h","#ff7bc3"],["undrd","#fffdf8"],[".","#d8ff45"]]){x.fillStyle=col;x.letterSpacing="-3px";x.fillText(t,cx,62);cx+=x.measureText(t).width}
  x.restore();
  x.fillStyle="#0d0d0d";x.textAlign="right";x.font="700 34px Inter, Arial, sans-serif";x.fillText(`No. ${pad(s.no)} / 500`,W-80,126);x.textAlign="left";
  // artwork
  const ax=80,ay=200,aw=920,ah=700;
  const img=await loadImg(s.img||"data:image/svg+xml;charset=utf-8,"+encodeURIComponent(genArt(s.seed,s.pal)));
  const sc=Math.max(aw/img.width,ah/img.height),iw=img.width*sc,ih=img.height*sc;
  x.save();x.beginPath();x.rect(ax,ay,aw,ah);x.clip();x.drawImage(img,ax+(aw-iw)/2,ay+(ah-ih)/2,iw,ih);
  x.globalAlpha=.16;x.fillStyle="#000";for(let yy=ay;yy<ay+ah;yy+=8)for(let xx=ax;xx<ax+aw;xx+=8){x.beginPath();x.arc(xx+4,yy+4,1.5,0,7);x.fill()}x.restore();
  x.fillStyle="#d8ff45";x.save();x.translate(ax+24,ay+ah-70);x.rotate(-.035);x.fillRect(0,0,300,52);x.fillStyle="#0d0d0d";x.font="800 28px Inter, Arial, sans-serif";x.fillText("Live for 3 days",20,36);x.restore();
  // name
  x.fillStyle="#0d0d0d";let fs=120;x.font=`900 ${fs}px Inter, Arial, sans-serif`;x.letterSpacing="-6px";
  while(x.measureText(s.name).width>920&&fs>54){fs-=4;x.font=`900 ${fs}px Inter, Arial, sans-serif`}
  x.fillText(s.name,76,ay+ah+40+fs*.82);x.letterSpacing="0px";
  x.fillStyle="#ff7bc3";x.fillRect(80,ay+ah+80+fs*.82,60,8);
  x.fillStyle="#0d0d0d";x.font="600 32px Inter, Arial, sans-serif";x.fillText(`${LANE[s.lane]}. On the wall until ${until(s)}.`,160,ay+ah+92+fs*.82);
  // footer band
  x.fillStyle="#0d0d0d";x.fillRect(0,H-120,W,120);x.fillStyle="#fffdf8";x.font="700 36px Inter, Arial, sans-serif";x.fillText("Find me on the wall at fivehundrd.",80,H-48);
  x.fillStyle="#d8ff45";x.beginPath();x.arc(W-110,H-60,22,0,7);x.fill();
  return c;
}
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
