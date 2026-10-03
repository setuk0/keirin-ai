const VENUE_NAMES = {
  hakodate:"函館", aomori:"青森", iwakitaira:"いわき平", yahiko:"弥彦", maebashi:"前橋", toride:"取手",
  utsunomiya:"宇都宮", omiya:"大宮", seibuen:"西武園", keiokaku:"京王閣", tachikawa:"立川",
  matsudo:"松戸", chiba:"千葉", kawasaki:"川崎", hiratsuka:"平塚", odawara:"小田原", ito:"伊東",
  shizuoka:"静岡", nagoya:"名古屋", gifu:"岐阜", ogaki:"大垣", toyohashi:"豊橋", toyama:"富山",
  matsusaka:"松阪", yokkaichi:"四日市", fukui:"福井", nara:"奈良", mukomachi:"向日町",
  wakayama:"和歌山", kishiwada:"岸和田", tamano:"玉野", hiroshima:"広島", hofu:"防府",
  takamatsu:"高松", komatsushima:"小松島", kochi:"高知", matsuyama:"松山", kokura:"小倉",
  kurume:"久留米", takeo:"武雄", sasebo:"佐世保", beppu:"別府", kumamoto:"熊本"
};

function cleanHtml(html) {
  return String(html)
    .replace(/<script[\\s\\S]*?<\\/script>/gi, " ")
    .replace(/<style[\\s\\S]*?<\\/style>/gi, " ")
    .replace(/<[^>]*>/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&#39;/gi, "'")
    .replace(/&quot;/gi, '"')
    .replace(/\\s+/g, " ")
    .trim();
}

async function fetchText(url) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 12000);
  try {
    const response = await fetch(url, {
      headers: {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/154.0 Safari/537.36",
        "Accept": "text/html,application/xhtml+xml",
        "Accept-Language": "ja,en;q=0.8"
      },
      cache: "no-store",
      signal: controller.signal
    });
    const body = await response.text();
    if (!response.ok) throw new Error("Kドリームス HTTP " + response.status);
    return body;
  } finally {
    clearTimeout(timer);
  }
}

function findRaceUrl(html, venue, race) {
  const source = String(html);
  const hrefRe = /href=["']([^"']+)["']/gi;
  const target = String(race) + "R";
  let match;

  while ((match = hrefRe.exec(source))) {
    const href = match[1];
    if (href.indexOf("/" + venue + "/") === -1) continue;
    if (href.indexOf("/racecard/") === -1 && href.indexOf("racedetail") === -1) continue;

    const end = source.indexOf(">", hrefRe.lastIndex);
    const close = source.indexOf("</a>", end);
    if (end < 0 || close < 0) continue;

    const anchorText = cleanHtml(source.slice(end + 1, close));
    if (anchorText.indexOf(target) !== -1) {
      return new URL(href, "https://keirin.kdreams.jp").href;
    }
  }

  return null;
}

function getRaceBlock(text, race) {
  const marker = String(race) + "R";
  const start = text.indexOf(marker);
  if (start < 0) return text;

  const nextMarkers = [];
  for (let n = race + 1; n <= 12; n++) {
    const pos = text.indexOf(String(n) + "R", start + marker.length);
    if (pos >= 0) nextMarkers.push(pos);
  }
  const end = nextMarkers.length ? Math.min(...nextMarkers) : text.length;
  return text.slice(start, end);
}

function parsePlayers(text) {
  const players = [];

  for (let n = 1; n <= 7; n++) {
    const patterns = [
      new RegExp("(?:^|\\s)" + n + "\\s+(?:[一-龥ぁ-んァ-ヶー]{2,12})\\s+[一-龥ぁ-んァ-ヶー]{2,6}\\s+\\d{2}\\s+\\d{2,3}\\s+[AS][12]", "m"),
      new RegExp("(?:^|\\s)" + n + "\\s+([一-龥ぁ-んァ-ヶー]{2,12})\\s+[一-龥ぁ-んァ-ヶー]{2,6}\\s+\\d{2}(?:\\s+\\d{2,3})?", "m")
    ];

    let found = null;

    for (const re of patterns) {
      const match = text.match(re);
      if (match) {
        const nameMatch = match[0].match(/\\s(\\S{2,12})\\s+[一-龥ぁ-んァ-ヶー]{2,6}\\s+\\d{2}/);
        if (nameMatch) found = nameMatch[1];
      }
      if (found) break;
    }

    if (found) players.push({ number:n, name:found });
  }

  return players;
}

function parseRace(html, venue, race, url) {
  const text = cleanHtml(html);
  const block = getRaceBlock(text, race);
  const players = parsePlayers(block);

  const lineMatch = block.match(/並び予想[\\s\\S]{0,300}/);
  const lineText = lineMatch ? lineMatch[0] : "";

  const odds = [];
  const oddsRe = /([1-7](?:-|=)[1-7](?:-|=)[1-7])\\s+([0-9,]+(?:\\.[0-9]+)?)/g;
  let om;
  while ((om = oddsRe.exec(block)) && odds.length < 30) {
    odds.push({ combination:om[1], odds:Number(om[2].replace(/,/g, "")) });
  }

  return {
    venue:venue,
    venueName:VENUE_NAMES[venue],
    race:race,
    url:url,
    players:players,
    lineText:lineText,
    odds:odds,
    source:"Kドリームス",
    fetchedAt:new Date().toISOString()
  };
}

module.exports = async function handler(req, res) {
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.setHeader("Cache-Control", "s-maxage=30, stale-while-revalidate=120");

  try {
    const query = req.query || {};
    const venue = String(query.venue || "").toLowerCase();
    const race = Math.max(1, Math.min(12, parseInt(query.race || "1", 10) || 1));

    if (!VENUE_NAMES[venue]) {
      return res.status(400).json({ ok:false, error:"開催場が不正です" });
    }

    const homeHtml = await fetchText("https://keirin.kdreams.jp/" + venue + "/");
    let raceUrl = findRaceUrl(homeHtml, venue, race);
    let cardHtml = null;

    if (!raceUrl) {
      cardHtml = await fetchText("https://keirin.kdreams.jp/" + venue + "/racecard/");
      raceUrl = findRaceUrl(cardHtml, venue, race);
    }

    if (!raceUrl) {
      return res.status(502).json({
        ok:false,
        error:VENUE_NAMES[venue] + " " + race + "Rの出走表URLを見つけられませんでした"
      });
    }

    let raceHtml = await fetchText(raceUrl);
    let data = parseRace(raceHtml, venue, race, raceUrl);

    // 詳細ページがJS等で選手情報を含まない場合は、
    // Kドリームスの出走表一覧ページを直接解析する。
    if (!data.players.length) {
      cardHtml = cardHtml || await fetchText("https://keirin.kdreams.jp/" + venue + "/racecard/");
      data = parseRace(cardHtml, venue, race, raceUrl);
    }

    if (!data.players.length) {
      return res.status(502).json({
        ok:false,
        error:VENUE_NAMES[venue] + " " + race + "Rの選手情報を解析できませんでした"
      });
    }

    return res.status(200).json({ ok:true, data:data });
  } catch (error) {
    console.error("api/race error:", error);
    return res.status(502).json({
      ok:false,
      error:error && error.message ? error.message : "サーバー側でデータ取得に失敗しました"
    });
  }
};
