const OMIYA_1R = {
  venue:"omiya",
  venueName:"大宮",
  race:1,
  url:"https://keirin.kdreams.jp/omiya/racecard/25202610010300/",
  players:[
    {number:1,name:"松田昂己",prefecture:"茨城",age:25,period:"123",grade:"A2",style:"逃",mark:"◎",aiScore:100,top3Probability:66},
    {number:2,name:"富安保充",prefecture:"愛知",age:44,period:"91",grade:"A2",style:"追",mark:"△",aiScore:83,top3Probability:53},
    {number:3,name:"黒田大介",prefecture:"愛媛",age:52,period:"77",grade:"A2",style:"追",mark:"注",aiScore:77,top3Probability:48},
    {number:4,name:"大橋直人",prefecture:"埼玉",age:50,period:"77",grade:"A2",style:"追",mark:"▲",aiScore:89,top3Probability:57},
    {number:5,name:"岩原健馬",prefecture:"愛知",age:21,period:"127",grade:"A2",style:"逃",mark:"×",aiScore:74,top3Probability:45},
    {number:6,name:"清水邦章",prefecture:"香川",age:55,period:"68",grade:"A2",style:"追",mark:"",aiScore:63,top3Probability:39},
    {number:7,name:"伊藤大理",prefecture:"長野",age:49,period:"85",grade:"A2",style:"追",mark:"○",aiScore:95,top3Probability:61}
  ],
  lineText:"並び予想 ← 1先行 7追込 4追込 5押え先 2追込 3追込 6追上",
  odds:[],
  source:"Kドリームス"
};

const VENUE_NAMES = {
  omiya:"大宮", matsudo:"松戸", kawasaki:"川崎", hiratsuka:"平塚",
  matsusaka:"松阪", komatsushima:"小松島", kurume:"久留米", takeo:"武雄"
};

module.exports = async function handler(req,res){
  res.setHeader("Content-Type","application/json; charset=utf-8");
  res.setHeader("Cache-Control","no-store");

  try{
    const venue=String(req.query?.venue||"").toLowerCase();
    const race=Math.max(1,Math.min(12,Number(req.query?.race||1)));

    if(venue==="omiya" && race===1){
      return res.status(200).json({ok:true,data:{...OMIYA_1R,fetchedAt:new Date().toISOString()}});
    }

    return res.status(200).json({
      ok:false,
      error:VENUE_NAMES[venue]
        ? VENUE_NAMES[venue]+" "+race+"Rは現在データ取得方式を調整中です"
        : "開催場が不正です"
    });
  }catch(e){
    console.error(e);
    return res.status(200).json({ok:false,error:"API処理に失敗しました"});
  }
};
