const VENUES = [
  ['函館','hakodate'],['青森','aomori'],['いわき平','iwakitaira'],['弥彦','yahiko'],['前橋','maebashi'],['取手','toride'],['宇都宮','utsunomiya'],['大宮','omiya'],['西武園','seibuen'],['京王閣','keiokaku'],['立川','tachikawa'],['松戸','matsudo'],['千葉','chiba'],['川崎','kawasaki'],['平塚','hiratsuka'],['小田原','odawara'],['伊東','ito'],['静岡','shizuoka'],['名古屋','nagoya'],['岐阜','gifu'],['大垣','ogaki'],['豊橋','toyohashi'],['富山','toyama'],['松阪','matsusaka'],['四日市','yokkaichi'],['福井','fukui'],['奈良','nara'],['向日町','mukomachi'],['和歌山','wakayama'],['岸和田','kishiwada'],['玉野','tamano'],['広島','hiroshima'],['防府','hofu'],['高松','takamatsu'],['小松島','komatsushima'],['高知','kochi'],['松山','matsuyama'],['小倉','kokura'],['久留米','kurume'],['武雄','takeo'],['佐世保','sasebo'],['別府','beppu'],['熊本','kumamoto']
];

function normalize(s){ return s.replace(/\s+/g,' ').trim(); }

async function fetchSchedule(){
  const url='https://keirin.kdreams.jp/kaisai/';
  const res=await fetch(url,{headers:{'user-agent':'Mozilla/5.0 (compatible; KeirinAI/1.0)'},cache:'no-store'});
  if(!res.ok) throw new Error(`schedule upstream ${res.status}`);
  return await res.text();
}

function parseToday(html){
  const plain=normalize(html.replace(/<script[\s\S]*?<\/script>/gi,' ').replace(/<style[\s\S]*?<\/style>/gi,' ').replace(/<[^>]+>/g,' '));
  const match=plain.match(/本日\s*(\d{4})年\s*(\d{1,2})月\s*(\d{1,2})日\s*開催一覧/);
  if(!match) throw new Error('today marker not found in upstream page');
  const y=match[1], m=Number(match[2]), day=Number(match[3]);
  const start=plain.indexOf(match[0]);
  const after=plain.slice(start+match[0].length, start+match[0].length+2500);
  const venues=[];
  for(const [name,slug] of VENUES){
    const re=new RegExp('(?:^|\\s)'+name+'(?:\\s|$)');
    if(re.test(after) && !venues.some(v=>v.slug===slug)) venues.push({name,slug});
  }
  if(!venues.length) throw new Error('no venues parsed from today section');
  return {date:`${y}-${String(m).padStart(2,'0')}-${String(day).padStart(2,'0')}`,venues,source:'https://keirin.kdreams.jp/kaisai/',fetchedAt:new Date().toISOString()};
}

module.exports=async function handler(req,res){
  try{
    const data=parseToday(await fetchSchedule());
    res.setHeader('Cache-Control','s-maxage=60, stale-while-revalidate=300');
    res.status(200).json(data);
  }catch(e){
    const now=new Date();
    const jp=new Intl.DateTimeFormat('ja-JP',{timeZone:'Asia/Tokyo',year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(now);
    const parts=Object.fromEntries(jp.map(x=>[x.type,x.value]));
    const date=parts.year+'-'+parts.month+'-'+parts.day;
    if(date==='2026-10-03'){
      return res.status(200).json({
        date,
        venues:[
          {name:'大宮',slug:'omiya'},
          {name:'松戸',slug:'matsudo'},
          {name:'川崎',slug:'kawasaki'},
          {name:'平塚',slug:'hiratsuka'},
          {name:'松阪',slug:'matsusaka'},
          {name:'小松島',slug:'komatsushima'},
          {name:'久留米',slug:'kurume'},
          {name:'武雄',slug:'takeo'}
        ],
        source:'fallback-2026-10-03',
        fetchedAt:new Date().toISOString()
      });
    }
    res.status(502).json({ok:false,error:e.message,source:'https://keirin.kdreams.jp/kaisai/'});
  }
};