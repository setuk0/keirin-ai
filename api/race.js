const OMIYA_1R = {
  venue: "omiya",
  venueName: "大宮",
  race: 1,
  url: "https://keirin.kdreams.jp/omiya/racecard/25202610010300/",
  players: [
    { number: 1, name: "松田昂己", style: "逃", mark: "◎", aiScore: 100, top3Probability: 66 },
    { number: 2, name: "富安保充", style: "追", mark: "△", aiScore: 83, top3Probability: 53 },
    { number: 3, name: "黒田大介", style: "追", mark: "注", aiScore: 77, top3Probability: 48 },
    { number: 4, name: "大橋直人", style: "追", mark: "▲", aiScore: 89, top3Probability: 57 },
    { number: 5, name: "岩原健馬", style: "逃", mark: "×", aiScore: 74, top3Probability: 45 },
    { number: 6, name: "清水邦章", style: "追", mark: "", aiScore: 63, top3Probability: 39 },
    { number: 7, name: "伊藤大理", style: "追", mark: "○", aiScore: 95, top3Probability: 61 }
  ],
  lineText: "並び予想 ← 1先行 7追込 4追込 5押え先 2追込 3追込 6追上",
  odds: [],
  source: "Kドリームス",
  fetchedAt: new Date().toISOString()
};

module.exports = async function handler(req, res) {
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.setHeader("Cache-Control", "no-store");

  const venue = String((req.query && req.query.venue) || "").toLowerCase();
  const race = Number((req.query && req.query.race) || 1);

  if (venue === "omiya" && race === 1) {
    return res.status(200).json({ ok: true, data: OMIYA_1R });
  }

  return res.status(200).json({
    ok: false,
    error: "現在は大宮1Rの接続確認中です"
  });
};
