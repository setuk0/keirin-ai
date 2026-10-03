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
    .replace(/<script[^>]*>[\\s\\S]*?<\\/script>/gi, " ")
    .replace(/<style[^>]*>[\\s\\S]*?<\\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&#39;/gi, "'")
    .replace(/&quot;/gi, '"')
    .replace(/[\\t\\r\\n]+/g, " ")
    .replace(/ +/g, " ")
    .trim();
}

async function fetchText(url) {
  const response = await fetch(url, {
    headers: {
      "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/154 Safari/537.36",
      "Accept": "text/html,application/xhtml+xml",
      "Accept-Language": "ja,en;q=0.8"
    },
    cache: "no-store"
  });
  const body = await response.text();
  if (!response.ok) throw new Error("Kドリームス HTTP " + response.status);
  return body;
}

function findRaceUrl(html, venue, race) {
  const source = String(html);
  const re = /href=["']([^"']+)["'][^>]*>[\\s\\S]*?<[^>]*>?[ \\t\\r\\n]*([0-9]{1,2})R[ \\t\\r\\n]*[\\s\\S]*?<\\/a>/gi;
  let m;
  while ((m = re.exec(source))) {
    const href = m[1];
    if (href.indexOf("/" + venue + "/") >= 0 &&
        (href.indexOf("/racecard/") >= 0 || href.indexOf("racedetail") >= 0) &&
        m[2] === String(race)) {
      return new URL(href, "https://keirin.kdreams.jp").href;
    }
  }

  const hrefs = source.match(/href=["'][^"']*(?:racecard|racedetail)[^"']*["']/gi) || [];
  for (const item of hrefs) {
    const href = item.replace(/^href=["']|["']$/gi, "");
    if (href.indexOf("/" + venue + "/") >= 0) {
      const compact = href.replace(/[^0-9]/g, "");
      if (compact.endsWith(String(race).padStart(2, "0"))) {
        return new URL(href, "https://keirin.kdreams.jp").href;
      }
    }
  }
  return null;
}

function parsePlayers(text) {
  const players = [];
  const lines = String(text).split(/ +/);

  for (let i = 0; i < lines.length; i++) {
    const token = lines[i];
    if (!/^[1-7]$/.test(token)) continue;

    const number = Number(token);
    const name = lines[i + 1];
    const prefecture = lines[i + 2];
    const age = lines[i + 3];

    if (!name || !prefecture || !age) continue;
    if (!/^[一-龥ぁ-んァ-ヶー]{2,12}$/.test(name)) continue;
    if (!/^[一-龥ぁ-んァ-ヶー]{2,6}$/.test(prefecture)) continue;
    if (!/^\\d{2}$/.test(age)) continue;

    if (!players.some(p => p.number === number)) {
      players.push({ number, name });
    }
  }

  return players.sort((a,b) => a.number - b.number);
}

function parseRace(html, venue, race, url) {
  const text = cleanHtml(html);
  const players = parsePlayers(text);

  const linePos = text.indexOf("並び予想");
  const lineText = linePos >= 0 ? text.slice(linePos, linePos + 300) : "";

  return {
    venue,
    venueName: VENUE_NAMES[venue],
    race,
    url,
    players,
    lineText,
    odds: [],
    source: "Kドリームス",
    fetchedAt: new Date().toISOString()
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

    const raceHtml = await fetchText(raceUrl);
    let data = parseRace(raceHtml, venue, race, raceUrl);

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

    return res.status(200).json({ ok:true, data });
  } catch (error) {
    console.error("api/race error:", error);
    return res.status(502).json({
      ok:false,
      error:error && error.message ? error.message : "サーバー側でデータ取得に失敗しました"
    });
  }
};
