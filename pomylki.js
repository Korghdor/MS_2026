(() => {
  const data = window.BALTICWOOD_PREDICTIONS_DATA || {};
  const players = Array.isArray(data.players) ? data.players : [];
  const matches = Array.isArray(data.matches) ? data.matches : [];
  const completedMatches = matches.filter((match) => match.completed);
  const summary = document.getElementById("mistakes-summary");
  const search = document.getElementById("mistakes-search");
  const ranking = document.getElementById("mistakes-ranking");
  const list = document.getElementById("mistakes-list");
  const listNote = document.getElementById("mistakes-list-note");
  const surpriseMatches = new Set([
    "Hiszpania – Republika Zielonego Przylądka",
    "Portugalia – DR Konga",
  ]);

  const records = getMistakeRecords();

  render(records);
  search?.addEventListener("input", () => {
    const query = normalize(search.value);
    const filtered = records.filter((record) =>
      normalize(
        `${record.player} ${record.match} ${record.prediction} ${record.result}`,
      ).includes(query),
    );
    render(filtered, query);
  });

  function getMistakeRecords() {
    const items = [];

    completedMatches.forEach((match) => {
      if (surpriseMatches.has(match.match)) return;

      const result = parseScore(match.result);
      if (!result) return;

      players.forEach((player) => {
        const prediction = getPrediction(match, player);
        const predicted = parseScore(prediction);
        if (!predicted) return;

        const distance =
          Math.abs(predicted.home - result.home) +
          Math.abs(predicted.away - result.away);

        items.push({
          player,
          match: match.match,
          matchNumber: Number(match.number || 0),
          prediction,
          result: match.result,
          distance,
          wrongOutcome: getOutcome(prediction) !== getOutcome(match.result),
        });
      });
    });

    return items;
  }

  function render(items, query = "") {
    const mistakeItems = items
      .filter((item) => item.distance > 0)
      .sort(sortMistakes);
    const biggest = mistakeItems[0]?.distance || 0;

    summary.textContent = query
      ? `Pokazuję ${items.length} ${pluralPredictions(items.length)} dla filtra.`
      : `${records.length} ${pluralPredictions(records.length)} sprawdzonych. Największa pomyłka: ${biggest} ${pluralGoals(biggest)}.`;

    renderRanking(buildRanking(items));
    renderMistakeCards(mistakeItems.slice(0, query ? 60 : 24), query, mistakeItems.length);
  }

  function buildRanking(items) {
    const byPlayer = new Map();

    items.forEach((item) => {
      const current =
        byPlayer.get(item.player) ||
        {
          player: item.player,
          typed: 0,
          totalDistance: 0,
          maxDistance: 0,
          wrongOutcomes: 0,
        };

      current.typed += 1;
      current.totalDistance += item.distance;
      current.maxDistance = Math.max(current.maxDistance, item.distance);
      current.wrongOutcomes += item.wrongOutcome ? 1 : 0;
      byPlayer.set(item.player, current);
    });

    return [...byPlayer.values()]
      .map((item) => ({
        ...item,
        average: item.typed ? item.totalDistance / item.typed : 0,
      }))
      .sort(
        (a, b) =>
          b.totalDistance - a.totalDistance ||
          b.average - a.average ||
          b.maxDistance - a.maxDistance ||
          a.player.localeCompare(b.player, "pl", { sensitivity: "base" }),
      );
  }

  function renderRanking(rows) {
    if (!rows.length) {
      ranking.innerHTML = `
        <article class="lone-empty">
          <strong>Brak danych do rankingu.</strong>
          <span>Spróbuj zmienić filtr.</span>
        </article>
      `;
      return;
    }

    let place = 0;
    let previousDistance = null;

    ranking.innerHTML = rows
      .map((row, index) => {
        if (row.totalDistance !== previousDistance) {
          place = index + 1;
          previousDistance = row.totalDistance;
        }

        return `
          <article class="mistake-row">
            <span class="analytics-rank">${place}</span>
            <strong>${escapeHtml(row.player)}</strong>
            <b>${row.totalDistance} ${pluralGoals(row.totalDistance)}</b>
            <em>
              średnio ${row.average.toFixed(1)} · max ${row.maxDistance} · zły kierunek ${row.wrongOutcomes}x
            </em>
          </article>
        `;
      })
      .join("");
  }

  function renderMistakeCards(items, query, totalCount) {
    const limit = query ? 60 : 24;
    listNote.textContent = query
      ? `Pokazuję ${items.length} z ${totalCount} pasujących pomyłek.`
      : `Pokazuję TOP ${Math.min(limit, totalCount)} pojedynczych pomyłek.`;

    if (!items.length) {
      list.innerHTML = `
        <article class="lone-empty">
          <strong>Brak pomyłek dla tego filtra.</strong>
          <span>Tu albo filtr jest zbyt wąski, albo ktoś typował podejrzanie dobrze.</span>
        </article>
      `;
      return;
    }

    list.innerHTML = items.map(renderMistakeCard).join("");
  }

  function renderMistakeCard(item) {
    return `
      <article class="lone-card mistake-card">
        <header>
          <span class="lone-badge mistake-badge">${item.distance} ${pluralGoals(item.distance)}</span>
          <strong>Mecz ${item.matchNumber}</strong>
        </header>
        <h2>${escapeHtml(item.player)}</h2>
        <p>${escapeHtml(item.match)}</p>
        <dl>
          <div>
            <dt>Typ</dt>
            <dd>${escapeHtml(item.prediction)}</dd>
          </div>
          <div>
            <dt>Wynik</dt>
            <dd>${escapeHtml(item.result)}</dd>
          </div>
          <div>
            <dt>Kierunek</dt>
            <dd>${item.wrongOutcome ? "Nie" : "Tak"}</dd>
          </div>
        </dl>
      </article>
    `;
  }

  function sortMistakes(a, b) {
    return (
      b.distance - a.distance ||
      b.matchNumber - a.matchNumber ||
      a.player.localeCompare(b.player, "pl", { sensitivity: "base" })
    );
  }

  function getPrediction(match, player) {
    return match.predictions?.[player] || "X-X";
  }

  function parseScore(score) {
    const match = String(score).trim().match(/^(\d+)\s*[-:]\s*(\d+)$/);
    if (!match) return null;
    return {
      home: Number(match[1]),
      away: Number(match[2]),
    };
  }

  function getOutcome(score) {
    const parsed = parseScore(score);
    if (!parsed) return null;
    if (parsed.home === parsed.away) return "draw";
    return parsed.home > parsed.away ? "home" : "away";
  }

  function pluralGoals(value) {
    if (value === 1) return "bramka";
    const lastTwo = value % 100;
    const last = value % 10;
    if (last >= 2 && last <= 4 && !(lastTwo >= 12 && lastTwo <= 14)) {
      return "bramki";
    }
    return "bramek";
  }

  function pluralPredictions(value) {
    if (value === 1) return "typ";
    const lastTwo = value % 100;
    const last = value % 10;
    if (last >= 2 && last <= 4 && !(lastTwo >= 12 && lastTwo <= 14)) {
      return "typy";
    }
    return "typów";
  }

  function normalize(value) {
    return String(value)
      .toLocaleLowerCase("pl")
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "");
  }

  function escapeHtml(value) {
    return String(value)
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#039;");
  }
})();
