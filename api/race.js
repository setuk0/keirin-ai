const VENUE_NAMES = {
  omiya:"大宮", matsudo:"松戸", kawasaki:"川崎", hiratsuka:"平塚",
  matsusaka:"松阪", komatsushima:"小松島", kurume:"久留米", takeo:"武雄"
};

function cleanHtml(html) {
  return String(html)
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
    headers: {
      "User-Agent": "Mozilla/5.0",
      "Accept": "text/html,application/xhtml+xml"
    }
  });
  const text = await r.text();
  if (!r.ok) throw new Error("Kドリームス HTTP " + r.status);
  return text;
}

function parsePlayers(block) {
  const s = cleanHtml(block);
  const re = /([1-7])\s+([一-龥ぁ-んァ-ヶー]{2,12})/g;
  const out = [];
  let m;

  while ((m = re.exec(s)) !== null) {
    const number = Number(m[1]);
    const name = m[2];

    if (out.some(p => p.number === number)) continue;
    if (!name || name.length < 2) continue;

    out.push({
      number,
      name,
      style: "",
      mark: "",
      aiScore: 70,
      top3Probability: 46
    });
  }

  return out.sort((a,b) => a.number - b.number);
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
    const venue = String(req.query?.venue || "").toLowerCase();
    const race = Math.max(1, Math.min(12, Number(req.query?.race || 1)));

    if (!VENUE_NAMES[venue]) {
      return res.status(200).json({
        ok: false,
        error: "開催場が不正です"
      });
    }

    const url = "https://keirin.kdreams.jp/" + venue + "/racecard/";
    const html = await fetchText(url);
    const block = extractRaceBlock(html, race);
    const players = parsePlayers(block);

    if (!players.length) {
      return res.status(200).json({
        ok: false,
        error: VENUE_NAMES[venue] + " " + race + "Rの選手情報を取得できませんでした",
        data: {
          venue,
          venueName: VENUE_NAMES[venue],
          race,
          players: [],
          odds: [],
          source: "Kドリームス"
        }
      });
    }

    return res.status(200).json({
      ok: true,
      data: {
        venue,
        venueName: VENUE_NAMES[venue],
        race,
        url,
        players,
        lineText: "",
        odds: [],
        source: "Kドリームス",
        fetchedAt: new Date().toISOString()
      }
    });
  } catch (e) {
    console.error("race api error:", e);

    return res.status(200).json({
      ok: false,
      error: "競輪データの取得に失敗しました: " + (e?.message || "unknown error")
    });
  }
};
