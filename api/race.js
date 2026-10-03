const VENUE_NAMES = {
  hakodate:"函館", aomori:"青森", iwakitaira:"いわき平", yahiko:"弥彦", maebashi:"前橋",
  toride:"取手", utsunomiya:"宇都宮", omiya:"大宮", seibuen:"西武園", keiokaku:"京王閣",
  tachikawa:"立川", matsudo:"松戸", chiba:"千葉", kawasaki:"川崎", hiratsuka:"平塚",
  odawara:"小田原", ito:"伊東", shizuoka:"静岡", nagoya:"名古屋", gifu:"岐阜",
  ogaki:"大垣", toyohashi:"豊橋", toyama:"富山", matsusaka:"松阪", yokkaichi:"四日市",
  fukui:"福井", nara:"奈良", mukomachi:"向日町", wakayama:"和歌山", kishiwada:"岸和田",
  tamano:"玉野", hiroshima:"広島", hofu:"防府", takamatsu:"高松", komatsushima:"小松島",
  kochi:"高知", matsuyama:"松山", kokura:"小倉", kurume:"久留米", takeo:"武雄",
  sasebo:"佐世保", beppu:"別府", kumamoto:"熊本"
};

function cleanHtml(html) {
  return String(html)
    .replace(/<script[^>]*>[\s\S]*?<\\/script>/gi, " ")
    .replace(/<style[^>]*>[\s\S]*?<\\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&#39;/gi, "'")
    .replace(/&quot;/gi, '"')
    .replace(/[\t\r\n]+/g, " ")
    .replace(/ +/g, " ")
    .trim();
}

async function fetchText(url) {
  const r = await fetch(url, {
    headers: { "User-Agent": "Mozilla/5.0", "Accept": "text/html,application/xhtml+xml" },
    cache: "no-store"
  });
  const text = await r.text();
  if (!r.ok) throw new Error("Kドリームス HTTP " + r.status);
  return text;
}

function parsePlayers(block) {
  const s = cleanHtml(block);
  const re = /([1-7])\s+([一-龥ぁ-んァ-ヶー]{2,12})\s+([一-龥ぁ-んァ-ヶー]{2,6})\s+(\d{2})\s+(\d{2,3})\s+(A\d|S\d)\s+(逃|追|両|自在)/g;
  const out = [];
  let m;
  while ((m = re.exec(s)) !== null) {
    const n = Number(m[1]);
    if (out.some(x => x.number === n)) continue;
    out.push({
      number:n, name:m[2], prefecture:m[3], age:Number(m[4]),
      period:m[5], grade:m[6], style:m[7]
    });
  }
  return out.sort((a,b) => a.number - b.number);
}

function scorePlayers(players) {
  return players.map((p, i) => {
    const bonus = p.style === "逃" ? 8 : p.style === "両" ? 5 : p.style === "自在" ? 4 : 2;
    const score = Math.max(50, Math.min(95, 72 + bonus - i * 2));
    return {...p, mark:"", aiScore:score, top3Probability:Math.round(score * 0.65)};
  });
}

function extractRaceBlock(html, race) {
  const text = cleanHtml(html);
  const start = text.indexOf(race + "R");
  if (start < 0) return "";
  const next = text.indexOf((race + 1) + "R", start + 2);
  return text.slice(start, next < 0 ? text.length : next);
}

module.exports = async function handler(req, res) {
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.setHeader("Cache-Control", "no-store");

  try {
    const venue = String((req.query && req.query.venue) || "").toLowerCase();
    const race = Math.max(1, Math.min(12, Number((req.query && req.query.race) || 1)));

    if (!VENUE_NAMES[venue]) {
      return res.status(400).json({ok:false,error:"開催場が不正です"});
    }

    const url = "https://keirin.kdreams.jp/" + venue + "/racecard/";
    const html = await fetchText(url);
    const block = extractRaceBlock(html, race);
    const players = scorePlayers(parsePlayers(block));

    if (!players.length) {
      return res.status(200).json({
        ok:false,
        error:VENUE_NAMES[venue] + " " + race + "Rの選手情報を解析できませんでした"
      });
    }

    const linePos = block.indexOf("並び予想");
    return res.status(200).json({
      ok:true,
      data:{
        venue, venueName:VENUE_NAMES[venue], race, url,
        players,
        lineText:linePos >= 0 ? block.slice(linePos, linePos + 300) : "",
        odds:[],
        source:"Kドリームス",
        fetchedAt:new Date().toISOString()
      }
    });
  } catch (e) {
    console.error("race api:", e);
    return res.status(200).json({
      ok:false,
      error:e && e.message ? e.message : "データ取得に失敗しました"
    });
  }
};
