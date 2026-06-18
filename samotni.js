(() => {
  const data = window.BALTICWOOD_PREDICTIONS_DATA || {};
  const players = Array.isArray(data.players) ? data.players : [];
  const matches = Array.isArray(data.matches) ? data.matches : [];
  const completedMatches = matches.filter((match) => match.completed);
  const list = document.getElementById("lone-list");
  const summary = document.getElementById("lone-summary");
  const search = document.getElementById("lone-search");

  const loneScorers = getLoneScorers();

  render(loneScorers);
  search?.addEventListener("input", () => {
    const query = normalize(search.value);
    const filtered = loneScorers.filter((scorer) =>
      normalize(
        `${scorer.player} ${scorer.match} ${scorer.prediction} ${scorer.result} ${scorer.typeLabel}`,
      ).includes(query),
    );
    render(filtered, query);
  });

  function getLoneScorers() {
    const candidates = [];

    completedMatches.forEach((match) => {
      const counts = new Map();

      players.forEach((name) => {
        const prediction = getPrediction(match, name);
        if (!isRealPrediction(prediction)) return;
        counts.set(prediction, (counts.get(prediction) || 0) + 1);
      });

      players.forEach((name) => {
        const prediction = getPrediction(match, name);
        if (!isRealPrediction(prediction) || counts.get(prediction) !== 1) return;

        if (prediction !== match.result) return;

        candidates.push({
          player: name,
          match: match.match,
          matchNumber: Number(match.number || 0),
          prediction,
          result: match.result || "X-X",
          type: "exact",
          typeLabel: "Dokładny wynik",
        });
      });
    });

    return candidates.sort(
      (a, b) =>
        b.matchNumber - a.matchNumber ||
        a.player.localeCompare(b.player, "pl", { sensitivity: "base" }),
    );
  }

  function render(items, query = "") {
    const totalText =
      loneScorers.length === 1
        ? "1 samotny dokładny wynik"
        : `${loneScorers.length} samotnych dokładnych wyników`;

    summary.textContent = query
      ? `Pokazuję ${items.length} z ${totalText}.`
      : `${totalText} w meczach, które już się odbyły.`;

    if (!items.length) {
      list.innerHTML = `
        <article class="lone-empty">
          <strong>Brak wyników dla tego filtra.</strong>
          <span>Spróbuj wpisać inne nazwisko, drużynę albo typ.</span>
        </article>
      `;
      return;
    }

    list.innerHTML = items.map(renderCard).join("");
  }

  function renderCard(scorer) {
    return `
      <article class="lone-card lone-card-${scorer.type}">
        <header>
          <span class="lone-badge">${escapeHtml(scorer.typeLabel)}</span>
          <strong>Mecz ${scorer.matchNumber}</strong>
        </header>
        <h2>${escapeHtml(scorer.player)}</h2>
        <p>${escapeHtml(scorer.match)}</p>
        <dl>
          <div>
            <dt>Typ</dt>
            <dd>${escapeHtml(scorer.prediction)}</dd>
          </div>
          <div>
            <dt>Wynik</dt>
            <dd>${escapeHtml(scorer.result)}</dd>
          </div>
        </dl>
      </article>
    `;
  }

  function getPrediction(match, player) {
    return match.predictions?.[player] || "X-X";
  }

  function isRealPrediction(prediction) {
    return Boolean(prediction && prediction !== "X-X");
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
