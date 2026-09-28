/*
 * The seeded demo wall from reference.html: rng(500), the same name, snippet
 * and palette lists, 30% vacant. Prototype and fixture data only; production
 * reads real stories from the database (BUILD_BRIEF §14).
 *
 * Copied verbatim so the draw order, and with it every spot, is unchanged.
 */
/* eslint-disable */
import { LANES, LIFE, TOTAL, rng, type Excerpt, type FilledSpot, type LaneId, type Palette, type Spot } from "./model";

let R=rng(500);const pick=<T,>(a: T[]): T=>a[Math.floor(R()*a.length)];
const FN: string[]=["Mira","Juno","Ada","Tess","Noor","Sem","Lotte","Ravi","Iris","Bram","Yara","Otis","Femke","Kai","Lina","Milo","Zora","Daan","Esme","Joris","Nia","Teun","Sol","Vera","Ilan","Maud","Rocco","Saar","Hugo","Wren"];
const LN: string[]=["Voss","Achterberg","Kerr","de Wit","Okafor","Lindqvist","Brandt","Moreau","Haddad","Visser","Calloway","Janssen","Sato","Ferreira","Bakker","Quist","Duval","Mertens","Holloway","Rahimi"];
const ADJ: string[]=["Lowtide","Hollow","Paper","Quiet","Velvet","Concrete","Tender","Static","Late","Soft","Rust","Blue Hour","Small","Neon","Glass"];
const NOUN: string[]=["Club","Pines","Engines","Harbour","Rooms","Satellites","Choir","Weather","Tapes","Horses","Motel","Gardens","Signals","Company","Ferries"];
const GAME: string[]=["Lanternfall","Moss & Rust","Tiny Lighthouse","Undertow","Paper Knights","Night Market","Sprout Protocol","Last Tram Home","Kiln","Orbit Bakery","Driftwood","Dust Choir"];
const POD: string[]=["Small Rooms","Talking to Strangers","The Long Shift","Second Draft","Kitchen Table Radio","Off the Map","Slow Money","The Back Row","Night Owls","Growing Pains"];
const LET: string[]=["Field Notes","The Sunday Sift","Margins","Good Tools","Low Budget Cinema","Plot Twist Weekly","The Maker Letter","Quiet Numbers","City Walks","Late Bloomers"];
const SNIP: Record<LaneId, string[]>={
 music:["Four-track bedroom pop about leaving a city you still love.","Brass, tape hiss and a drum machine that almost keeps time.","Our debut EP was recorded in a church in Zwolle over one weekend.","Slow songs for the last train home. New single out Friday.","Two sisters, one cello, too many synths.","Dub-soaked jazz from a basement in Antwerp."],
 art:["Risograph posters of buildings that were demolished last year.","I paint the same street every morning. 212 days so far.","Ceramics that look like they were found on a beach.","Collages cut from 1970s travel brochures.","Tiny linocuts of birds I meet on my commute."],
 writers:["A debut novel about a lighthouse keeper who stops answering letters.","Short stories set in one apartment block, one floor each.","Poems written on receipts, published as a zine.","A fantasy trilogy with a very tired dragon.","Essays on growing up between two languages."],
 podcasts:["Every week we call a stranger and ask what they'd change.","Night-shift workers tell us what the city sounds like at 4am.","Two friends reading one bad self-help book per episode.","Honest conversations with people who quit something big."],
 games:["A cozy puzzle game about fixing the lights in a sleepy harbour.","Roguelike where your deck is made of recipes.","Hand-drawn metroidvania. Demo on Steam now.","A two-player game you can only win by trusting each other."],
 letters:["One tool, one tip, every Tuesday. Read in three minutes.","Weekly map of the best free events in Rotterdam.","Numbers behind indie films, explained without jargon.","Letters from a bakery that opens at 5am."]
};
const LINKS: Record<LaneId, string[]>={music:["Spotify","Apple Music","Instagram"],art:["YouTube","Instagram","Website"],writers:["Substack","Goodreads","Website"],podcasts:["Spotify","Apple Podcasts","YouTube"],games:["Steam","YouTube","Discord"],letters:["Substack","Archive","Instagram"]};
const BOOKS: Required<Excerpt>[]=[
 {t:"Chapter one",s:"A debut novel about a lighthouse keeper who stops getting letters.",x:`The letters stopped on a Tuesday. Mara noticed because Tuesday was the day the boat came, and the boat always carried something for the lighthouse: tinned peaches, a newspaper three days old, and a letter from her brother in a hand that leaned so far right it seemed to be running.

That Tuesday there were peaches and there was a newspaper. She turned the sack inside out on the jetty and shook it, as if a letter might be hiding in the seams.

"Weather held him up," said the boatman, who had not been asked. Mara looked at the sky, which was the flat blue of a thing that has never held anything up in its life.

She walked back up the hill with the peaches under one arm and counted the steps, the way she did when she didn't want to think. There were two hundred and twelve. There had always been two hundred and twelve.`},
 {t:"Fourth floor",s:"Short stories set in one apartment block, one floor each.",x:`On the fourth floor lived a man who owned nine clocks and trusted none of them. Every evening at what he believed was seven, he opened his window and asked the street what time it was.

The street always answered. Usually it was the girl from the bakery, sometimes a bus driver on his break, once, memorably, a parrot. The man would nod, adjust one clock, and close the window again.

Nobody in the building knew his name. Everybody in the building knew his question.

The night nobody answered, the whole block heard the silence, and one by one the windows opened.`},
 {t:"Prologue",s:"A fantasy trilogy with a very tired dragon.",x:`The dragon was tired in the particular way of someone who has been important for too long. Its hoard had become paperwork. Its lair had a leak.

When the knight arrived, sword raised and speech prepared, the dragon did not rise. It opened one eye, the colour of a very old coin, and said: "If you are here about the gold, take a number."

The knight lowered his sword. Behind the dragon, stacked to the ceiling of the cave, were thousands of little paper tickets.

"How long is the wait?" he asked, because he had been raised to be polite. The dragon sighed a small, apologetic plume of smoke. "Longer than you'd like. Shorter than mine."`},
 {t:"Introduction",s:"Essays on growing up between two languages.",x:`My mother counted in Dutch and dreamed in Turkish, and I grew up somewhere in the gap between the two, a narrow room where words went when they didn't fit anywhere else.

At school I learned that a sentence has a subject, a verb and an object. At home I learned that a sentence also has a mood, a temperature, and a person it is secretly addressed to.

This is a book about that second kind of grammar, and about the years it took me to stop translating myself.`}
];
const ISSUES: Required<Excerpt>[]=[
 {t:"Issue 48: the two-minute rule",s:"One tool, one tip, every Tuesday. Read in three minutes.",x:`Hi, and welcome to the forty-eighth letter.

This week's tool costs nothing: a kitchen timer. Set it for two minutes before you start the task you've been avoiding. You're allowed to quit when it rings. You will almost never quit when it rings.

Below, three readers on how they use it, one who hates it, and the cheapest timer I could find.`},
 {t:"This week: 11 free things to do",s:"A weekly map of the best free things to do in Rotterdam.",x:`It's going to rain on Saturday, so this week's map leans indoors.

There's a free listening session in a record shop, a library evening where you can borrow a sewing machine, and a rooftop that is technically closed but whose door, I'm told, is technically open.

As always: go early, bring a friend, report back.`},
 {t:"Letter 19: the bakery at 5am",s:"Letters from a bakery that opens at 5am.",x:`The oven takes forty minutes to wake up, which is exactly how long it takes me.

By the time the first loaves go in, the street is still dark and the only other light is the laundromat across the road, where a man folds the same blue shirt every morning. I've never seen him wear it.

This letter is about him, a little, and mostly about rye.`}
];
export const PAL: Palette[]=[["#1f3a5f","#f2c14e","#e9e2cf"],["#2d4a3e","#ff7bc3","#f1ead8"],["#3b2f4a","#d8ff45","#efe8da"],["#8c2f39","#f6d8ae","#1d1d1b"],["#0f4c5c","#e36414","#f2e9e4"],["#4a4e69","#c9ada7","#f2e9e4"],["#1b1b1b","#ff7bc3","#d8ff45"],["#6b705c","#ffe8d6","#cb997e"],["#22333b","#eae0d5","#c6ac8f"],["#355070","#eaac8b","#e56b6f"],["#264653","#e9c46a","#f4a261"],["#2b2d42","#edf2f4","#ef233c"]];
function nameFor(l: LaneId){
  if(l==="games")return pick(GAME)+(R()<.4?" "+pick(["II","Deluxe","Tales","Online"]):"");
  if(l==="podcasts")return pick(POD);
  if(l==="letters")return pick(LET)+(R()<.3?" by "+pick(FN):"");
  if(l==="music")return R()<.5?pick(ADJ)+" "+pick(NOUN):pick(FN)+" "+pick(LN);
  if(l==="art")return pick(FN)+" "+pick(LN)+(R()<.25?" Studio":"");
  return pick(FN)+" "+pick(LN);
}
function handle(n: string){return n.toLowerCase().replace(/[^a-z0-9]+/g,"")}

export function seedWall(): Spot[] {
  R=rng(500);
  const now=Date.now(),spots: Spot[]=[];
  for(let i=1;i<=TOTAL;i++){
    if(R()<.3){spots.push({no:i,vacant:true});continue}
    const lane: LaneId=pick(LANES)[0],name=nameFor(lane),h=handle(name);
    const start=now-R()*LIFE*.97,age=(now-start)/LIFE,opens=Math.floor(20+age*(300+R()*2600));
    const sp: FilledSpot={no:i,lane,name,snippet:pick(SNIP[lane]),start,seed:Math.floor(R()*1e9),pal:pick(PAL),demo:true,opens,saves:Math.floor(opens*(.03+R()*.12)),
      links:LINKS[lane].map(p=>({label:p,url:"https://"+p.toLowerCase().replace(/\s/g,"")+".example/"+h}))};
    if(lane==="writers"){sp.excerpt=pick(BOOKS);sp.snippet=sp.excerpt.s!}
    if(lane==="letters"){sp.excerpt=pick(ISSUES);sp.snippet=sp.excerpt.s!}
    if(lane==="art"||lane==="games")sp.trailer={url:"https://youtube.example/"+h,len:(1+Math.floor(R()*3))+":"+String(Math.floor(R()*60)).padStart(2,"0")};
    spots.push(sp);
  }
  return spots;
}
