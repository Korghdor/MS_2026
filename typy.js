(() => {
  "use strict";

  const data = window.BALTICWOOD_PREDICTIONS_DATA;
  const head = document.getElementById("predictions-head");
  const body = document.getElementById("predictions-body");
  const summary = document.getElementById("predictions-summary");
  const playerSearch = document.getElementById("prediction-player-search");
  const clearFilter = document.getElementById("prediction-clear-filter");
  const filterCount = document.getElementById("prediction-filter-count");
  const compareInputA = document.getElementById("prediction-compare-a");
  const compareInputB = document.getElementById("prediction-compare-b");
  const clearCompare = document.getElementById("prediction-clear-compare");
  const compareSummary = document.getElementById("prediction-compare-summary");
  const playerOptions = document.getElementById("prediction-player-options");
  const matchDetailCard = document.getElementById("match-detail-card");
  const matchDetailClose = document.getElementById("match-detail-close");
  const matchDetailTitle = document.getElementById("match-detail-title");
  const matchDetailMeta = document.getElementById("match-detail-meta");
  const matchDetailGrid = document.getElementById("match-detail-grid");

  if (!data || !Array.isArray(data.players) || !Array.isArray(data.matches)) {
    summary.textContent = "Brak danych z arkusza Typy.";
    return;
  }

  let visiblePlayers = data.players;
  let comparisonPlayers = [];
  const matchesByNumber = new Map(
    data.matches.map((match) => [String(match.number), match]),
  );

  playerOptions.innerHTML = data.players
    .map((player) => `<option value="${escapeHtml(player)}"></option>`)
    .join("");

  const renderPredictions = () => {
    head.innerHTML = `
      <tr>
        <th scope="col">Mecz</th>
        <th scope="col">Wynik</th>
        ${visiblePlayers
          .map((player) => `<th scope="col">${escapeHtml(player)}</th>`)
          .join("")}
      </tr>
    `;

    body.innerHTML = data.matches
      .map((match) => {
        const popularPrediction = getPopularPrediction(match);

        return `
          <tr class="${match.completed ? "match-completed" : "match-upcoming"}">
            <th scope="row">
              <button
                class="match-detail-trigger"
                type="button"
                data-match-number="${match.number}"
              >
                ${renderTeams(match.match)}
              </button>
            </th>
            <td>
              <span class="result-badge">${escapeHtml(match.result)}</span>
              ${
                popularPrediction
                  ? `<span class="popular-prediction">Najczęściej: <strong>${escapeHtml(popularPrediction.label)}</strong></span>`
                  : ""
              }
            </td>
            ${visiblePlayers
              .map((player) => {
                const prediction = getPrediction(match, player);
                const compareDifferent =
                  comparisonPlayers.length === 2 &&
                  getPrediction(match, comparisonPlayers[0]) !==
                    getPrediction(match, comparisonPlayers[1]);
                const compareSame =
                  comparisonPlayers.length === 2 && !compareDifferent;
                const exact =
                  match.completed && prediction === match.result;
                const correctOutcome =
                  match.completed &&
                  !exact &&
                  getOutcome(prediction) !== null &&
                  getOutcome(prediction) === getOutcome(match.result);
                const classes = [
                  prediction === "X-X" ? "prediction-missing" : "",
                  exact ? "prediction-exact" : "",
                  correctOutcome ? "prediction-outcome" : "",
                  compareSame ? "prediction-compare-same" : "",
                  compareDifferent ? "prediction-compare-different" : "",
                ]
                  .filter(Boolean)
                  .join(" ");
                return `<td class="${classes}">${escapeHtml(prediction)}</td>`;
              })
              .join("")}
          </tr>
        `;
      })
      .join("");
  };

  const updatePlayerFilter = (query = "") => {
    const selectedPlayers = getComparisonPlayers();
    comparisonPlayers = selectedPlayers;

    if (hasComparisonQuery()) {
      visiblePlayers = selectedPlayers;
      playerSearch.disabled = true;
      clearFilter.hidden = true;
      clearCompare.hidden = false;
      updateComparisonSummary(selectedPlayers);
      filterCount.textContent =
        selectedPlayers.length > 0
          ? `Tryb porównania: ${selectedPlayers.length} zawodników.`
          : "Tryb porównania: nie znaleziono zawodnika.";
      renderPredictions();
      return;
    }

    playerSearch.disabled = false;
    clearCompare.hidden = true;
    comparisonPlayers = [];
    const normalizedQuery = normalizeSearch(query);
    visiblePlayers = normalizedQuery
      ? data.players.filter((player) =>
          normalizeSearch(player).includes(normalizedQuery),
        )
      : data.players;

    clearFilter.hidden = normalizedQuery.length === 0;
    filterCount.textContent =
      visiblePlayers.length === data.players.length
        ? `Pokazuję wszystkich zawodników (${data.players.length}).`
        : `Pokazuję ${visiblePlayers.length} z ${data.players.length} zawodników.`;
    compareSummary.textContent =
      "Wpisz dwóch zawodników, aby porównać ich typy mecz po meczu.";
    renderPredictions();
  };

  summary.textContent =
    `${data.completedCount} rozegranych meczów + ` +
    `${data.upcomingCount} najbliższe z wynikiem X-X`;

  playerSearch.addEventListener("input", (event) => {
    updatePlayerFilter(event.target.value);
  });

  compareInputA.addEventListener("input", () => {
    updatePlayerFilter(playerSearch.value);
  });

  compareInputB.addEventListener("input", () => {
    updatePlayerFilter(playerSearch.value);
  });

  clearFilter.addEventListener("click", () => {
    playerSearch.value = "";
    updatePlayerFilter();
    playerSearch.focus();
  });

  clearCompare.addEventListener("click", () => {
    compareInputA.value = "";
    compareInputB.value = "";
    updatePlayerFilter(playerSearch.value);
    compareInputA.focus();
  });

  body.addEventListener("click", (event) => {
    const trigger = event.target.closest(".match-detail-trigger");
    if (!trigger) return;

    const match = matchesByNumber.get(trigger.dataset.matchNumber);
    if (match) renderMatchDetail(match);
  });

  matchDetailClose.addEventListener("click", () => {
    matchDetailCard.hidden = true;
  });

  updatePlayerFilter();

  function renderTeams(matchName) {
    const teams = String(matchName).split(/\s+[–—-]\s+/, 2);
    if (teams.length !== 2) {
      return `<span class="match-teams">${escapeHtml(matchName)}</span>`;
    }

    return `
      <span class="match-teams">
        <span class="match-team">${escapeHtml(teams[0])}</span>
        <span class="match-team-divider" aria-hidden="true"> – </span>
        <span class="match-team">${escapeHtml(teams[1])}</span>
      </span>
    `;
  }

  function getOutcome(score) {
    const match = String(score).trim().match(/^(\d+)\s*[-:]\s*(\d+)$/);
    if (!match) return null;

    const home = Number(match[1]);
    const away = Number(match[2]);
    if (home === away) return "draw";
    return home > away ? "home" : "away";
  }

  function getPrediction(match, player) {
    return match.predictions[player] || "X-X";
  }

  function getPopularPrediction(match) {
    const counts = new Map();
    data.players.forEach((player) => {
      const prediction = getPrediction(match, player);
      if (!prediction || prediction === "X-X") return;
      counts.set(prediction, (counts.get(prediction) || 0) + 1);
    });

    const sorted = [...counts.entries()].sort(
      (a, b) => b[1] - a[1] || a[0].localeCompare(b[0], "pl"),
    );
    if (sorted.length === 0) return null;

    const topCount = sorted[0][1];
    const topPredictions = sorted
      .filter(([, count]) => count === topCount)
      .map(([prediction]) => prediction);
    const label =
      topPredictions.length === 1
        ? `${topPredictions[0]} (${topCount})`
        : `${topPredictions.slice(0, 2).join(", ")} (po ${topCount})`;

    return { label, count: topCount };
  }

  function renderMatchDetail(match) {
    const popularPrediction = getPopularPrediction(match);
    const stats = getMatchStats(match);

    matchDetailTitle.textContent = match.match;
    matchDetailMeta.innerHTML = `
      <span>Wynik: <strong>${escapeHtml(match.result)}</strong></span>
      ${
        popularPrediction
          ? `<span>Najczęściej typowano: <strong>${escapeHtml(popularPrediction.label)}</strong></span>`
          : "<span>Brak typów do podsumowania</span>"
      }
    `;

    if (!match.completed) {
      matchDetailGrid.innerHTML = `
        ${renderDetailBox("Status", "Mecz przed nami", "Po rozegraniu meczu pojawią się trafienia i punkty.")}
        ${renderDetailBox("Najpopularniejszy typ", popularPrediction?.label || "Brak", "Na podstawie wpisanych typów.")}
      `;
    } else {
      const scorers = [
        ...stats.exactNames.map((name) => `${name} (+3)`),
        ...stats.outcomeNames.map((name) => `${name} (+1)`),
      ];

      matchDetailGrid.innerHTML = `
        ${renderDetailBox("Dokładny wynik", String(stats.exactNames.length), renderNameList(stats.exactNames))}
        ${renderDetailBox("Dobry zwycięzca/remis", String(stats.outcomeNames.length), renderNameList(stats.outcomeNames))}
        ${renderDetailBox("Kto zdobył punkty", String(scorers.length), renderNameList(scorers))}
        ${renderDetailBox("Bez punktów", String(stats.missedNames.length), renderNameList(stats.missedNames))}
      `;
    }

    matchDetailCard.hidden = false;
    matchDetailCard.scrollIntoView({ behavior: "smooth", block: "nearest" });
  }

  function getMatchStats(match) {
    const exactNames = [];
    const outcomeNames = [];
    const missedNames = [];

    data.players.forEach((player) => {
      const prediction = getPrediction(match, player);
      if (prediction === match.result) {
        exactNames.push(player);
        return;
      }

      const predictedOutcome = getOutcome(prediction);
      if (
        predictedOutcome !== null &&
        predictedOutcome === getOutcome(match.result)
      ) {
        outcomeNames.push(player);
        return;
      }

      missedNames.push(player);
    });

    return { exactNames, outcomeNames, missedNames };
  }

  function renderDetailBox(label, value, bodyText) {
    return `
      <article>
        <span>${escapeHtml(label)}</span>
        <strong>${escapeHtml(value)}</strong>
        <p>${bodyText}</p>
      </article>
    `;
  }

  function renderNameList(names) {
    if (names.length === 0) return "Brak";
    return escapeHtml(names.join(", "));
  }

  function hasComparisonQuery() {
    return (
      normalizeSearch(compareInputA.value).length > 0 ||
      normalizeSearch(compareInputB.value).length > 0
    );
  }

  function getComparisonPlayers() {
    return [resolvePlayer(compareInputA.value), resolvePlayer(compareInputB.value)]
      .filter(Boolean)
      .filter((player, index, players) => players.indexOf(player) === index);
  }

  function resolvePlayer(query) {
    const normalizedQuery = normalizeSearch(query);
    if (!normalizedQuery) return null;

    return (
      data.players.find((player) => normalizeSearch(player) === normalizedQuery) ||
      data.players.find((player) =>
        normalizeSearch(player).startsWith(normalizedQuery),
      ) ||
      data.players.find((player) =>
        normalizeSearch(player).includes(normalizedQuery),
      ) ||
      null
    );
  }

  function updateComparisonSummary(selectedPlayers) {
    if (selectedPlayers.length === 0) {
      compareSummary.textContent =
        "Nie znalazłem takiego zawodnika. Wybierz nazwisko z podpowiedzi.";
      return;
    }

    if (selectedPlayers.length === 1) {
      compareSummary.textContent =
        `Wybrano: ${selectedPlayers[0]}. Dobierz drugiego zawodnika do porównania.`;
      return;
    }

    const [firstPlayer, secondPlayer] = selectedPlayers;
    const stats = data.matches.reduce(
      (totals, match) => {
        if (getPrediction(match, firstPlayer) === getPrediction(match, secondPlayer)) {
          totals.same += 1;
        } else {
          totals.different += 1;
        }
        return totals;
      },
      { same: 0, different: 0 },
    );

    compareSummary.textContent =
      `${firstPlayer} vs ${secondPlayer}: ` +
      `${stats.same} takich samych typów, ${stats.different} różnych.`;
  }

  function normalizeSearch(value) {
    return String(value)
      .trim()
      .toLocaleLowerCase("pl")
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .replaceAll("ł", "l");
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
