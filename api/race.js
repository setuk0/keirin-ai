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
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&#39;/gi, "'")
    .replace(/&quot;/gi, '"')
    .replace(/[\\t\\r\\n]+/g, " ")
    .replace(/ +/g, " ")
    .trim();
}

async function fetchText(url) {
  const response = await fetch(url, {
    headers: {
      "User-Agent": "Mozilla/5.0",
      "Accept": "text/html,application/xhtml+xml",
      "Accept-Language": "ja"
    },
    cache: "no-store"
  });
  const text = await response.text();
  if (!response.ok) throw new Error("Kドリームス HTTP " + response.status);
  return text;
}

function parsePlayers(text) {
  const normalized = cleanHtml(text);
  const re = /([1-7])\\s+([一-龥ぁ-んァ-ヶー]{2,12})\\s+([一-龥ぁ-んァ-ヶー]{2,6})\\s+(\\d{2})\\s+(\\d{2,3})\\s+(A\\d|S\\d)\\s+(逃|追|両|自在)/g;
  const players = [];
  let m;

  while ((m = re.exec(normalized)) !== null) {
    const number = Number(m[1]);
    if (players.some(p => p.number === number)) continue;

    players.push({
      number,
      name: m[2],
      prefecture: m[3],
      age: Number(m[4]),
      grade: m[6],
      style: m[7]
    });
  }

  return players.sort((a,b) => a.number - b.number);
}

function parse(html, venue, race, url) {
  const text = cleanHtml(html);
  const players = parsePlayers(text);

  // 出走表ページは複数Rを含むため、対象R付近のライン情報を優先して取得
  const raceMarker = new RegExp("(?:^|\\s)" + race + "R");
  const markerMatch = raceMarker.exec(text);
  const start = markerMatch ? markerMatch.index : 0;
  const section = text.slice(start, start + 5000);
  const p = section.indexOf("並び予想");

  // Kドリームスの印を使って初期スコアを作る（後で独自モデルへ置換可能）
  const marks = {};
  const markRe = /([◎○▲△注×])\\s+[^ ]*\\s*([1-7])\\s+([1-7])\\s+([一-龥ぁ-んァ-ヶー]{2,12})/g;
  let mm;
  while ((mm = markRe.exec(section)) !== null) {
    const n = Number(mm[2]);
    if (!marks[n]) marks[n] = mm[1];
  }

  const base = { "◎":100, "○":94, "▲":88, "△":82, "注":76, "×":70 };
  const scoredPlayers = players.map((p, i) => {
    const markScore = base[marks[p.number]] || 62;
    const styleBonus = p.style === "逃" ? 4 : p.style === "両" ? 3 : p.style === "自在" ? 2 : 1;
    const aiScore = Math.min(100, markScore + styleBonus);
    return {
      ...p,
      mark: marks[p.number] || "",
      aiScore,
      top3Probability: Math.max(8, Math.min(72, Math.round(aiScore * 0.66 - i * 1.5)))
    };
  });

  return {
    venue,
    venueName: VENUE_NAMES[venue],
    race,
    url,
    players: scoredPlayers,
    lineText: p >= 0 ? text.slice(p, p + 250) : "",
    odds: [],
    source: "Kドリームス",
    fetchedAt: new Date().toISOString()
  };
}

function omiyaFallback(race) {
  if (race !== 1) return null;
  return {
    venue:"omiya",
    venueName:"大宮",
    race:1,
    url:"https://keirin.kdreams.jp/omiya/racecard/25202610010300/",
    players:[
      {number:1,name:"松田昂己"},
      {number:2,name:"富安保充"},
      {number:3,name:"黒田大介"},
      {number:4,name:"大橋直人"},
      {number:5,name:"岩原健馬"},
      {number:6,name:"清水邦章"},
      {number:7,name:"伊藤大理"}
    ],
    lineText:"1先行 7追込 4追込 5押え先 2追込 3追込 6追上",
    odds:[],
    source:"Kドリームス",
    fetchedAt:new Date().toISOString()
  };
}

module.exports = async function handler(req, res) {
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.setHeader("Cache-Control", "no-store");

  try {
    const query = req.query || {};
    const venue = String(query.venue || "").toLowerCase();
    const race = Math.max(1, Math.min(12, parseInt(query.race || "1", 10) || 1));

    if (!VENUE_NAMES[venue]) {
      return res.status(400).json({ok:false,error:"開催場が不正です"});
    }

        const home = await fetchText("https://keirin.kdreams.jp/" + venue + "/racecard/");
    const marker = "/" + venue + "/racecard/";
    const hrefs = home.match(/href=["'][^"']*\\/racecard\\/[^"']+["']/gi) || [];
    let url = null;

    // 現在の開催に紐づく出走表一覧URLを優先
    for (const item of hrefs) {
      const href = item.replace(/^href=["']|["']$/gi, "");
      if (href.indexOf(marker) >= 0 && /\\/racecard\\/\\d+\\//.test(href)) {
        url = new URL(href, "https://keirin.kdreams.jp").href;
        break;
      }
    }

    // 一覧ページ自身が開催ページの場合
    if (!url && /\\/racecard\\/\\d+\\//.test(home)) {
      const m = home.match(/https?:\\/\\/keirin\\.kdreams\\.jp\\/[^"'\\s]+\\/racecard\\/\\d+\\//);
      if (m) url = m[0];
    }

    if (!url) {
      return res.status(200).json({
        ok:false,
        error:VENUE_NAMES[venue] + " " + race + "Rの出走表URLを取得できませんでした"
      });
    }

    const data = parse(await fetchText(url), venue, race, url);

    if (!data.players.length) {
      return res.status(200).json({
        ok:false,
        error:VENUE_NAMES[venue] + " " + race + "Rの選手情報を解析できませんでした",
        data:{venue,venueName:VENUE_NAMES[venue],race,url}
      });
    }

    return res.status(200).json({ok:true,data});
  } catch (error) {
    console.error(error);
    return res.status(200).json({
      ok:false,
      error:error && error.message ? error.message : "データ取得に失敗しました"
    });
  }
};
