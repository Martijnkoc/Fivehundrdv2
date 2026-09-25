export const TOTAL = 500;
export const LIFE = 72 * 60 * 60 * 1000;
export const PRICE = "$9.95";
export const LANES = [["music","Music"],["art","Creators"],["writers","Books"],["podcasts","Podcasts"],["games","Games"],["letters","Newsletters"]] as const;
export type Lane = typeof LANES[number][0];
export type LaneFilter = Lane | "all";
export const LABEL = Object.fromEntries(LANES) as Record<Lane,string>;
export const NAV: readonly [LaneFilter,string][] = [["all","Wall"],["music","Music"],["writers","Books"],["games","Games"],["art","Creators"],["podcasts","Podcasts"],["letters","Newsletters"]];
export type LiveSpot={no:number;vacant:false;lane:Lane;name:string;snippet:string;start:number;seed:number;palette:readonly string[];opens:number;saves:number};
export type Spot=LiveSpot|{no:number;vacant:true;seed:number};
const NAMES:Record<Lane,string[]>={music:["Lowtide Club","Hollow Pines","Paper Engines"],art:["Mira Voss Studio","Juno Holloway","Ada Moreau"],writers:["Mira Achterberg","Ilan Moreau","Noor de Wit"],podcasts:["Small Rooms","The Long Shift","Second Draft"],games:["Lanternfall","Moss & Rust","Night Market"],letters:["Field Notes","The Sunday Sift","Margins"]};
const COPY:Record<Lane,string[]>={music:["Four-track bedroom pop about leaving a city you still love."],art:["Risograph posters of buildings that were demolished last year."],writers:["A debut novel about a lighthouse keeper who stops answering letters."],podcasts:["Every week we call a stranger and ask what they'd change."],games:["A cozy puzzle game about fixing the lights in a sleepy harbour."],letters:["One tool, one tip, every Tuesday. Read in three minutes."]};
const P=[["#1f3a5f","#f2c14e","#e9e2cf"],["#2d4a3e","#ff7bc3","#f1ead8"],["#3b2f4a","#d8ff45","#efe8da"],["#8c2f39","#f6d8ae","#1d1d1b"]] as const;
export function rng(seed:number){return()=>{seed|=0;seed=seed+0x6d2b79f5|0;let t=Math.imul(seed^seed>>>15,1|seed);t=t+Math.imul(t^t>>>7,61|t)^t;return((t^t>>>14)>>>0)/4294967296}}
export function seedWall(now:number):Spot[]{const r=rng(500),pick=<T,>(a:readonly T[])=>a[Math.floor(r()*a.length)];return Array.from({length:TOTAL},(_,i)=>{const no=i+1;if(r()<.3)return{no,vacant:true,seed:no*7919};const lane=pick(LANES)[0],start=now-r()*LIFE*.97,opens=Math.floor(20+(now-start)/LIFE*(300+r()*2600));return{no,vacant:false,lane,name:pick(NAMES[lane]),snippet:pick(COPY[lane]),start,seed:Math.floor(r()*1e9),palette:pick(P),opens,saves:Math.floor(opens*(.03+r()*.12))}})}
export const pad=(n:number)=>String(n).padStart(3,"0");
export const short=(ms:number)=>{const h=Math.floor(ms/3600000);return h?`${h}h`:`${Math.max(1,Math.floor(ms/60000))}m`};
export const count=(n:number)=>n>=1000?`${(n/1000).toFixed(1).replace(".0","")}k`:String(n);
export function artwork(seed:number,p:readonly string[]){const r=rng(seed),[a,b,c]=p;const x=70+r()*150,y=50+r()*100;return`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 400 300"><rect width="400" height="300" fill="${c}"/><circle cx="${x}" cy="${y}" r="80" fill="${a}"/><rect x="${x+45}" y="${y+35}" width="150" height="140" fill="${b}"/></svg>`}
