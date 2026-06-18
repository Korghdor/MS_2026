(() => {
  "use strict";

  const data = window.BALTICWOOD_TOURNAMENT_DATA;

  if (!data || !Array.isArray(data.players)) {
    document.body.innerHTML =
      '<main class="shell section"><h1>Brak danych</h1><p>Uruchom generator danych z pliku XLSM.</p></main>';
    return;
  }

  const predictionsData = window.BALTICWOOD_PREDICTIONS_DATA;
  const predictionMatches =
    predictionsData && Array.isArray(predictionsData.matches)
      ? predictionsData.matches
      : [];
  const completedPredictionMatches = predictionMatches.filter(
    (match) => match.completed,
  );

  const pluralPoints = (value) => {
    if (value === 1) return "punkt";
    const lastTwo = value % 100;
    const last = value % 10;
    if (last >= 2 && last <= 4 && !(lastTwo >= 12 && lastTwo <= 14)) {
      return "punkty";
    }
    return "punktów";
  };

  const rankStandings = (players) => {
    const ranked = [...players].sort(
      (a, b) =>
        b.points - a.points ||
        a.name.localeCompare(b.name, "pl", { sensitivity: "base" }),
    );
    let currentRank = 0;
    let previousPoints = null;

    ranked.forEach((player) => {
      if (previousPoints === null || player.points < previousPoints) {
        currentRank += 1;
      }
      player.rank = currentRank;
      previousPoints = player.points;
    });

    return ranked;
  };

  const standings = rankStandings(
    data.players.map((name) => ({
      name,
      points: Number(data.currentTotals[name] || 0),
      lastPoints: Number(data.lastMatchPoints?.[name] || 0),
    })),
  );

  const byId = (id) => document.getElementById(id);
  const playerStats = buildPlayerStats(standings);

  byId("played-count").textContent = data.completedMatches.length;
  byId("matches-count").textContent = data.matches.length;
  byId("players-count").textContent = data.players.length;

  const podium = byId("podium-list");
  [1, 2, 3].forEach((rank) => {
    const playersAtRank = standings.filter((player) => player.rank === rank);
    const card = document.createElement("article");
    card.className = `podium-card rank-${rank}`;
    card.dataset.rank = String(rank);

    if (playersAtRank.length === 0) {
      card.classList.add("podium-card-empty");
      card.innerHTML = `
        <span class="place-badge" aria-label="${rank}. miejsce">${rank}</span>
        <h3>${rank}. miejsce</h3>
        <p class="podium-empty">Na razie wolne</p>
      `;
    } else {
      const points = playersAtRank[0].points;
      card.innerHTML = `
        <span class="place-badge" aria-label="${rank}. miejsce">${rank}</span>
        <h3>${rank}. miejsce</h3>
        <ul class="podium-names">
          ${playersAtRank
            .map((player) => `<li>${escapeHtml(player.name)}</li>`)
            .join("")}
        </ul>
        <p class="podium-score">
          <strong>${points}</strong>
          <span>${pluralPoints(points)}</span>
        </p>
      `;
    }
    podium.appendChild(card);
  });

  const openingSnapshot = {
    matchNumber: 0,
    match: "Przed pierwszym gwizdkiem",
    result: "",
    date: "",
    time: "",
    totals: Object.fromEntries(data.players.map((name) => [name, 0])),
  };
  const snapshots = [openingSnapshot, ...data.raceSnapshots];
  const dailySnapshots = buildDailySnapshots(snapshots);
  const dayControls = {
    triviaPrev: byId("trivia-prev"),
    triviaNext: byId("trivia-next"),
  };
  let analyticsDayIndex = Math.max(0, dailySnapshots.length - 1);

  dayControls.triviaPrev.addEventListener("click", () => {
    analyticsDayIndex = Math.max(1, analyticsDayIndex - 1);
    renderAnalyticsDay();
  });

  dayControls.triviaNext.addEventListener("click", () => {
    analyticsDayIndex = Math.min(dailySnapshots.length - 1, analyticsDayIndex + 1);
    renderAnalyticsDay();
  });

  renderAnalyticsDay();
  renderOverallTrivia(playerStats);

  const standingsBody = byId("standings-body");
  const emptyState = byId("empty-state");
  const playerStatsPanel = byId("player-stats-panel");
  const playerStatsName = byId("player-stats-name");
  const playerStatsGrid = byId("player-stats-grid");
  const playerStatsForm = byId("player-stats-form");
  const playerStatsNote = byId("player-stats-note");
  const playerStatsClose = byId("player-stats-close");
  let tableStandings = standings;
  let tableQuery = "";

  const renderTable = (query = "") => {
    const normalized = normalizeSearch(query);
    const filtered = tableStandings.filter((player) =>
      normalizeSearch(player.name).includes(normalized),
    );

    standingsBody.innerHTML = filtered
      .map(
        (player) => `
          <tr>
            <td class="rank-cell"><span class="rank-number">${player.rank}</span></td>
            <td class="table-player">
              <button
                class="player-stat-trigger"
                type="button"
                data-player="${escapeHtml(player.name)}"
              >
                ${escapeHtml(player.name)}
              </button>
            </td>
            <td>
              <span class="last-points ${player.lastPoints > 0 ? "positive" : ""}">
                ${
                  player.lastPoints > 0
                    ? `+${player.lastPoints} pkt`
                    : tableMode === "day"
                      ? "bez punktów w dniu"
                      : "bez punktów"
                }
              </span>
            </td>
            <td class="points-column">${player.points}</td>
          </tr>
        `,
      )
      .join("");

    standingsBody.classList.remove("table-updated");
    window.requestAnimationFrame(() =>
      standingsBody.classList.add("table-updated"),
    );
    emptyState.hidden = filtered.length > 0;
  };

  byId("player-search").addEventListener("input", (event) => {
    tableQuery = event.target.value;
    renderTable(tableQuery);
  });

  standingsBody.addEventListener("click", (event) => {
    const trigger = event.target.closest(".player-stat-trigger");
    if (!trigger) return;
    renderPlayerStats(trigger.dataset.player);
  });

  playerStatsClose.addEventListener("click", () => {
    playerStatsPanel.hidden = true;
  });

  const playbackIntervalMs = 1000;
  const tableRange = byId("table-range");
  const tablePlayButton = byId("table-play");
  const tablePrevButton = byId("table-prev");
  const tableNextButton = byId("table-next");
  const tableModeButtons = document.querySelectorAll("[data-table-mode]");
  const tableRangeStart = byId("table-range-start");
  const tableRangeEnd = byId("table-range-end");
  const gainColumnLabel = byId("gain-column-label");
  const tableHistories = {
    match: snapshots,
    day: dailySnapshots,
  };
  let tableMode = "match";
  let activeTableSnapshots = tableHistories[tableMode];
  let tableIndex = activeTableSnapshots.length - 1;
  let tableTimer = null;

  tableRange.max = String(activeTableSnapshots.length - 1);
  tableRange.value = String(tableIndex);

  const renderTableHistory = () => {
    activeTableSnapshots = tableHistories[tableMode];
    tableIndex = Math.min(tableIndex, activeTableSnapshots.length - 1);
    const isDayMode = tableMode === "day";
    const snapshot = activeTableSnapshots[tableIndex];
    const previousSnapshot = activeTableSnapshots[Math.max(0, tableIndex - 1)];

    tableStandings = rankStandings(
      data.players.map((name) => {
        const points = Number(snapshot.totals[name] || 0);
        const previousPoints = Number(previousSnapshot.totals[name] || 0);
        return {
          name,
          points,
          lastPoints: tableIndex === 0 ? 0 : points - previousPoints,
        };
      }),
    );

    if (tableIndex === 0) {
      byId("table-kicker").textContent = "Przed turniejem";
      byId("table-match-title").textContent = snapshot.match;
      byId("table-match-meta").textContent = "";
    } else if (isDayMode) {
      byId("table-kicker").textContent = "Klasyfikacja dzień po dniu";
      byId("table-match-title").textContent = formatDateLabel(snapshot.date);
      byId("table-match-meta").textContent = [
        `${snapshot.dayMatchCount} ${pluralMatches(snapshot.dayMatchCount)} tego dnia`,
        `ostatni: ${snapshot.match}`,
        snapshot.result,
      ]
        .filter(Boolean)
        .join("  |  ");
    } else {
      byId("table-kicker").textContent =
        `Klasyfikacja po meczu nr ${snapshot.matchNumber}`;
      byId("table-match-title").textContent = snapshot.match;
      byId("table-match-meta").textContent = [
        snapshot.date,
        snapshot.time,
        snapshot.result,
      ]
        .filter(Boolean)
        .join("  |  ");
    }

    byId("table-progress").textContent =
      isDayMode
        ? `${tableIndex} / ${activeTableSnapshots.length - 1} dni`
        : `${tableIndex} / ${activeTableSnapshots.length - 1}`;

    tableRange.max = String(activeTableSnapshots.length - 1);
    tableRange.value = String(tableIndex);
    tablePrevButton.disabled = tableIndex === 0;
    tableNextButton.disabled = tableIndex === activeTableSnapshots.length - 1;
    tablePlayButton.disabled = activeTableSnapshots.length <= 1;
    gainColumnLabel.textContent = isDayMode ? "Punkty dnia" : "Ostatni mecz";
    tableRangeStart.textContent = "Przed turniejem";
    tableRangeEnd.textContent = isDayMode ? "Ostatni dzień" : "Aktualnie";
    tableRange.setAttribute(
      "aria-label",
      isDayMode
        ? "Wybierz dzień w tabeli klasyfikacyjnej"
        : "Wybierz mecz w tabeli klasyfikacyjnej",
    );
    renderMovementSummary(snapshot, previousSnapshot, isDayMode, tableIndex);
    renderTable(tableQuery);
  };

  const stopTablePlayback = () => {
    if (tableTimer) {
      window.clearInterval(tableTimer);
      tableTimer = null;
    }
    tablePlayButton.textContent = "Odtwórz";
    tablePlayButton.setAttribute(
      "aria-label",
      "Odtwórz historię klasyfikacji",
    );
  };

  const startTablePlayback = () => {
    if (activeTableSnapshots.length <= 1) return;
    if (tableIndex >= activeTableSnapshots.length - 1) tableIndex = 0;
    renderTableHistory();
    tablePlayButton.textContent = "Pauza";
    tablePlayButton.setAttribute(
      "aria-label",
      "Wstrzymaj historię klasyfikacji",
    );
    tableTimer = window.setInterval(() => {
      if (tableIndex >= activeTableSnapshots.length - 1) {
        stopTablePlayback();
        return;
      }
      tableIndex += 1;
      renderTableHistory();
    }, playbackIntervalMs);
  };

  tablePlayButton.addEventListener("click", () => {
    if (tableTimer) stopTablePlayback();
    else startTablePlayback();
  });

  tablePrevButton.addEventListener("click", () => {
    stopTablePlayback();
    tableIndex = Math.max(0, tableIndex - 1);
    renderTableHistory();
  });

  tableNextButton.addEventListener("click", () => {
    stopTablePlayback();
    tableIndex = Math.min(activeTableSnapshots.length - 1, tableIndex + 1);
    renderTableHistory();
  });

  tableRange.addEventListener("input", (event) => {
    stopTablePlayback();
    tableIndex = Number(event.target.value);
    renderTableHistory();
  });

  tableModeButtons.forEach((button) => {
    button.addEventListener("click", () => {
      const nextMode = button.dataset.tableMode;
      if (!tableHistories[nextMode] || nextMode === tableMode) return;

      const currentMatchNumber =
        activeTableSnapshots[tableIndex]?.matchNumber || 0;
      stopTablePlayback();
      tableMode = nextMode;
      activeTableSnapshots = tableHistories[tableMode];
      tableIndex = findClosestSnapshotIndex(
        activeTableSnapshots,
        currentMatchNumber,
      );

      tableModeButtons.forEach((modeButton) => {
        const isActive = modeButton.dataset.tableMode === tableMode;
        modeButton.classList.toggle("is-active", isActive);
        modeButton.setAttribute("aria-pressed", String(isActive));
      });

      renderTableHistory();
    });
  });

  renderTableHistory();

  const raceBars = byId("race-bars");
  const range = byId("race-range");
  const playButton = byId("race-play");
  const prevButton = byId("race-prev");
  const nextButton = byId("race-next");
  let raceIndex = snapshots.length - 1;
  let timer = null;
  const raceRows = new Map();
  const rowStep = 59;

  range.max = String(snapshots.length - 1);
  range.value = String(raceIndex);

  data.players.forEach((name, playerIndex) => {
    const row = document.createElement("div");
    row.className = "race-row";
    row.dataset.points = "0";
    row.style.setProperty("--player-color", getPlayerColor(playerIndex));
    row.innerHTML = `
      <span class="race-position">-</span>
      <span class="race-name" title="${escapeHtml(name)}">${escapeHtml(name)}</span>
      <div class="race-track" aria-hidden="true">
        <div class="race-fill"></div>
      </div>
      <strong class="race-points">0</strong>
    `;
    raceBars.appendChild(row);
    raceRows.set(name, row);
  });
  raceBars.style.height = `${Math.max(290, data.players.length * rowStep)}px`;

  const renderRace = () => {
    const snapshot = snapshots[raceIndex];
    const rows = data.players
      .map((name) => ({ name, points: Number(snapshot.totals[name] || 0) }))
      .sort(
        (a, b) =>
          b.points - a.points || a.name.localeCompare(b.name, "pl", { sensitivity: "base" }),
      );
    const maxPoints = Math.max(1, ...rows.map((row) => row.points));

    byId("race-kicker").textContent =
      snapshot.matchNumber > 0 ? `Po meczu nr ${snapshot.matchNumber}` : "Przed turniejem";
    byId("race-title").textContent = snapshot.match;
    byId("race-meta").textContent = [snapshot.date, snapshot.time, snapshot.result]
      .filter(Boolean)
      .join("  |  ");
    byId("race-progress").textContent =
      raceIndex === 0
        ? `0 / ${snapshots.length - 1}`
        : `${raceIndex} / ${snapshots.length - 1}`;

    let displayRank = 0;
    let previousRacePoints = null;

    rows.forEach((player, position) => {
      const row = raceRows.get(player.name);
      const oldPoints = Number(row.dataset.points || 0);
      const gainedPoints = player.points - oldPoints;
      const oldPosition =
        row.dataset.position === undefined ? null : Number(row.dataset.position);

      if (previousRacePoints === null || player.points < previousRacePoints) {
        displayRank += 1;
      }
      previousRacePoints = player.points;

      row.style.transform = `translateY(${position * rowStep}px)`;
      row.style.zIndex = String(rows.length - position);
      row.querySelector(".race-position").textContent = String(displayRank);
      row.classList.toggle("race-leader", displayRank === 1);
      row.querySelector(".race-fill").style.width =
        `${(player.points / maxPoints) * 100}%`;
      animateNumber(row.querySelector(".race-points"), oldPoints, player.points);
      row.dataset.points = String(player.points);
      row.dataset.position = String(position);

      row.classList.remove("race-moving-up", "race-moving-down");
      if (oldPosition !== null && oldPosition !== position) {
        const movementClass =
          position < oldPosition ? "race-moving-up" : "race-moving-down";
        const movementToken = String(Date.now() + position);
        row.dataset.movementToken = movementToken;
        row.classList.add(movementClass);
        window.setTimeout(() => {
          if (row.dataset.movementToken !== movementToken) return;
          row.classList.remove(movementClass);
        }, 950);
      }

      row.classList.remove("race-gained");
      const oldGain = row.querySelector(".race-gain");
      if (oldGain) oldGain.remove();

      if (gainedPoints > 0) {
        const gainToken = String(Date.now() + position);
        row.dataset.gainToken = gainToken;
        const gain = document.createElement("span");
        gain.className = "race-gain";
        gain.textContent = `+${gainedPoints}`;
        row.appendChild(gain);
        window.requestAnimationFrame(() => row.classList.add("race-gained"));
        window.setTimeout(() => {
          if (row.dataset.gainToken !== gainToken) return;
          row.classList.remove("race-gained");
          gain.remove();
        }, 1200);
      }
    });

    range.value = String(raceIndex);
    prevButton.disabled = raceIndex === 0;
    nextButton.disabled = raceIndex === snapshots.length - 1;
    playButton.disabled = snapshots.length <= 1;
  };

  const stopPlayback = () => {
    if (timer) {
      window.clearInterval(timer);
      timer = null;
    }
    playButton.textContent = "Odtwórz";
    playButton.setAttribute("aria-label", "Odtwórz wyścig");
  };

  const startPlayback = () => {
    if (snapshots.length <= 1) return;
    if (raceIndex >= snapshots.length - 1) raceIndex = 0;
    renderRace();
    playButton.textContent = "Pauza";
    playButton.setAttribute("aria-label", "Wstrzymaj wyścig");
    timer = window.setInterval(() => {
      if (raceIndex >= snapshots.length - 1) {
        stopPlayback();
        return;
      }
      raceIndex += 1;
      renderRace();
    }, playbackIntervalMs);
  };

  playButton.addEventListener("click", () => {
    if (timer) stopPlayback();
    else startPlayback();
  });

  prevButton.addEventListener("click", () => {
    stopPlayback();
    raceIndex = Math.max(0, raceIndex - 1);
    renderRace();
  });

  nextButton.addEventListener("click", () => {
    stopPlayback();
    raceIndex = Math.min(snapshots.length - 1, raceIndex + 1);
    renderRace();
  });

  range.addEventListener("input", (event) => {
    stopPlayback();
    raceIndex = Number(event.target.value);
    renderRace();
  });

  renderRace();

  function renderAnalyticsDay() {
    renderDailyRanking(dailySnapshots, analyticsDayIndex);
    renderTrivia(analyticsDayIndex);

    dayControls.triviaPrev.disabled = analyticsDayIndex <= 1;
    dayControls.triviaNext.disabled =
      analyticsDayIndex >= dailySnapshots.length - 1;
  }

  function renderDailyRanking(snapshotList, dayIndex) {
    const title = byId("daily-ranking-title");
    const meta = byId("daily-ranking-meta");
    const list = byId("daily-ranking-list");

    if (snapshotList.length <= 1 || dayIndex === 0) {
      title.textContent = "Jeszcze przed pierwszym gwizdkiem";
      meta.textContent = "Ranking dnia pojawi się po pierwszych wynikach.";
      list.innerHTML = "";
      return;
    }

    const latest = snapshotList[dayIndex];
    const previous = snapshotList[dayIndex - 1];
    const dailyRows = rankStandings(
      data.players.map((name) => ({
        name,
        points: Number(latest.totals[name] || 0) - Number(previous.totals[name] || 0),
      })),
    ).slice(0, 6);

    title.textContent = formatDateLabel(latest.date);
    meta.textContent =
      `${latest.dayMatchCount} ${pluralMatches(latest.dayMatchCount)} tego dnia`;
    list.innerHTML = dailyRows
      .map(
        (player) => `
          <li>
            <span class="analytics-rank">${player.rank}</span>
            <strong>${escapeHtml(player.name)}</strong>
            <em>+${player.points} ${pluralPoints(player.points)}</em>
          </li>
        `,
      )
      .join("");
  }

  function renderTrivia(dayIndex) {
    const triviaList = byId("trivia-list");
    const triviaTitle = byId("trivia-title");
    const triviaMeta = byId("trivia-meta");

    if (dailySnapshots.length <= 1 || dayIndex === 0) {
      triviaTitle.textContent = "Czekamy na pierwszy dzień";
      triviaMeta.textContent = "Ciekawostki pojawią się po rozegranych meczach.";
      triviaList.innerHTML = "";
      return;
    }

    const daySnapshot = dailySnapshots[dayIndex];
    const previousDaySnapshot = dailySnapshots[dayIndex - 1];
    const dayMatches = completedPredictionMatches.filter((match) => {
      const matchNumber = Number(match.number || 0);
      return (
        matchNumber > Number(previousDaySnapshot.matchNumber || 0) &&
        matchNumber <= Number(daySnapshot.matchNumber || 0)
      );
    });
    const dayStats = [...buildHitStats(dayMatches).values()];
    const dayExactLeaders = findMaxRows(dayStats, "exact");
    const dayOutcomeLeaders = findMaxRows(dayStats, "outcome");
    const lastMatchLeaders = getLastMatchLeaders(daySnapshot.matchNumber);
    const consensus = getStrongestConsensus(dayMatches);
    const difficulty = getMatchDifficultyExtremes(dayMatches);

    triviaTitle.textContent = formatDateLabel(daySnapshot.date);
    triviaMeta.textContent =
      `${daySnapshot.dayMatchCount} ${pluralMatches(daySnapshot.dayMatchCount)} tego dnia`;

    const items = [
      {
        label: "Król dokładnych wyników",
        value: dayExactLeaders.max > 0
          ? `${formatNames(dayExactLeaders.names, Infinity)} (${dayExactLeaders.max})`
          : "Tego dnia bez bezbłędnego trafienia",
      },
      {
        label: "Najwięcej trafionych zwycięzców",
        value: dayOutcomeLeaders.max > 0
          ? `${formatNames(dayOutcomeLeaders.names, Infinity)} (${dayOutcomeLeaders.max})`
          : "Tego dnia bez trafionego kierunku",
      },
      {
        label: "Najlepszy ostatni mecz",
        value: lastMatchLeaders.max > 0
          ? `${formatNames(lastMatchLeaders.names, Infinity)} (+${lastMatchLeaders.max})`
          : "Ostatni mecz nikogo nie rozpieścił",
      },
      {
        label: "Najbardziej popularny typ",
        value: consensus
          ? `${consensus.match}: ${consensus.prediction} wybrało ${consensus.count} osób`
          : "Brak typów do porównania",
      },
      {
        label: "Najtrudniejszy mecz do typowania",
        value: difficulty.hardest.length
          ? `${formatMatchNames(difficulty.hardest)}: punkty zdobyło ${difficulty.hardest[0].scoredCount} osób`
          : "Jeszcze brak rozegranych meczów",
      },
      {
        label: "Najłatwiejszy mecz do typowania",
        value: difficulty.easiest.length
          ? `${formatMatchNames(difficulty.easiest)}: punkty zdobyło ${difficulty.easiest[0].scoredCount} osób`
          : "Jeszcze brak rozegranych meczów",
      },
    ];

    renderTriviaItems(triviaList, items);
  }

  function renderOverallTrivia(statsMap) {
    const triviaList = byId("overall-trivia-list");
    const stats = [...statsMap.values()];
    const exactLeaders = findMaxRows(stats, "exact");
    const outcomeLeaders = findMaxRows(stats, "outcome");
    const consensus = getStrongestConsensus();
    const difficulty = getMatchDifficultyExtremes();

    const items = [
      {
        label: "Król dokładnych wyników",
        value: exactLeaders.max > 0
          ? `${formatNames(exactLeaders.names, Infinity)} (${exactLeaders.max})`
          : "Jeszcze bez bezbłędnego trafienia",
      },
      {
        label: "Najwięcej trafionych zwycięzców",
        value: outcomeLeaders.max > 0
          ? `${formatNames(outcomeLeaders.names, Infinity)} (${outcomeLeaders.max})`
          : "Jeszcze czekamy na serię",
      },
      {
        label: "Najbardziej popularny typ",
        value: consensus
          ? `${consensus.match}: ${consensus.prediction} wybrało ${consensus.count} osób`
          : "Brak typów do porównania",
      },
      {
        label: "Najtrudniejszy mecz do typowania",
        value: difficulty.hardest.length
          ? `${formatMatchNames(difficulty.hardest)}: punkty zdobyło ${difficulty.hardest[0].scoredCount} osób`
          : "Jeszcze brak rozegranych meczów",
      },
      {
        label: "Najłatwiejszy mecz do typowania",
        value: difficulty.easiest.length
          ? `${formatMatchNames(difficulty.easiest)}: punkty zdobyło ${difficulty.easiest[0].scoredCount} osób`
          : "Jeszcze brak rozegranych meczów",
      },
    ];

    renderTriviaItems(triviaList, items);
  }

  function renderTriviaItems(list, items) {
    list.innerHTML = items
      .map(
        (item) => `
          <li>
            <span>${escapeHtml(item.label)}</span>
            <strong>${escapeHtml(item.value)}</strong>
          </li>
        `,
      )
      .join("");
  }

  function renderPlayerStats(playerName) {
    const stats = playerStats.get(playerName);
    if (!stats) return;

    playerStatsName.textContent = playerName;
    playerStatsGrid.innerHTML = [
      ["Miejsce", `${stats.rank}.`],
      ["Punkty", String(stats.points)],
      ["Dokładne wyniki", String(stats.exact)],
      ["Dobry zwycięzca/remis", String(stats.outcome)],
      ["Nietrafione", String(stats.missed)],
      ["Średnio na mecz", stats.average],
    ]
      .map(
        ([label, value]) => `
          <div>
            <span>${escapeHtml(label)}</span>
            <strong>${escapeHtml(value)}</strong>
          </div>
        `,
      )
      .join("");

    playerStatsForm.innerHTML = renderFormChart(playerName);

    const hitRate = stats.played
      ? Math.round(((stats.exact + stats.outcome) / stats.played) * 100)
      : 0;
    playerStatsNote.textContent =
      stats.played > 0
        ? `Na podstawie ${stats.played} rozegranych meczów: skuteczność kierunku ${hitRate}%.`
        : "Statystyki pojawią się po pierwszych rozegranych meczach.";
    playerStatsPanel.hidden = false;
    playerStatsPanel.scrollIntoView({ behavior: "smooth", block: "nearest" });
  }

  function renderMovementSummary(snapshot, previousSnapshot, isDayMode, index) {
    const upTitle = byId("movement-up-title");
    const upList = byId("movement-up-list");
    const downTitle = byId("movement-down-title");
    const downList = byId("movement-down-list");

    if (index === 0) {
      upTitle.textContent = "Przed startem";
      upList.textContent = "Jeszcze nikt nie ruszył z miejsca.";
      downTitle.textContent = "Przed startem";
      downList.textContent = "Tabela stoi w blokach startowych.";
      return;
    }

    const movements = calculateMovements(snapshot, previousSnapshot);
    const rises = movements.filter((item) => item.change > 0);
    const falls = movements.filter((item) => item.change < 0);
    const label = isDayMode ? "dzień" : "mecz";
    const labelLocative = isDayMode ? "dniu" : "meczu";

    if (rises.length > 0) {
      const maxRise = Math.max(...rises.map((item) => item.change));
      const names = rises
        .filter((item) => item.change === maxRise)
        .map((item) => item.name);
      upTitle.textContent =
        `+${maxRise} ${pluralPlaces(maxRise)} po tym ${labelLocative}`;
      upList.textContent = formatNames(names, Infinity);
    } else {
      upTitle.textContent = "Bez awansu";
      upList.textContent = `Ten ${label} nie zrobił windy w tabeli.`;
    }

    if (falls.length > 0) {
      const maxFall = Math.max(...falls.map((item) => Math.abs(item.change)));
      const names = falls
        .filter((item) => Math.abs(item.change) === maxFall)
        .map((item) => item.name);
      downTitle.textContent =
        `-${maxFall} ${pluralPlaces(maxFall)} po tym ${labelLocative}`;
      downList.textContent = formatNames(names, Infinity);
    } else {
      downTitle.textContent = "Bez spadku";
      downList.textContent = `Ten ${label} był łaskawy dla wszystkich.`;
    }
  }

  function buildPlayerStats(currentStandings) {
    const rankMap = new Map(currentStandings.map((player) => [player.name, player.rank]));
    const stats = new Map(
      data.players.map((name) => [
        name,
        {
          name,
          rank: rankMap.get(name) || 0,
          points: Number(data.currentTotals[name] || 0),
          exact: 0,
          outcome: 0,
          missed: 0,
          played: completedPredictionMatches.length,
          average: "0.00",
        },
      ]),
    );

    completedPredictionMatches.forEach((match) => {
      data.players.forEach((name) => {
        const playerStatsRow = stats.get(name);
        const prediction = getPrediction(match, name);
        if (prediction === match.result) {
          playerStatsRow.exact += 1;
          return;
        }

        const predictedOutcome = getOutcome(prediction);
        if (
          predictedOutcome !== null &&
          predictedOutcome === getOutcome(match.result)
        ) {
          playerStatsRow.outcome += 1;
          return;
        }

        playerStatsRow.missed += 1;
      });
    });

    stats.forEach((playerStatsRow) => {
      playerStatsRow.average = playerStatsRow.played
        ? (playerStatsRow.points / playerStatsRow.played).toFixed(2)
        : "0.00";
    });

    return stats;
  }

  function calculateMovements(snapshot, previousSnapshot) {
    const currentRanks = getRankMap(snapshot);
    const previousRanks = getRankMap(previousSnapshot);

    return data.players.map((name) => ({
      name,
      change: (previousRanks.get(name) || 0) - (currentRanks.get(name) || 0),
    }));
  }

  function getRankMap(snapshot) {
    return new Map(
      rankStandings(
        data.players.map((name) => ({
          name,
          points: Number(snapshot.totals[name] || 0),
        })),
      ).map((player) => [player.name, player.rank]),
    );
  }

  function findMaxRows(rows, key) {
    const max = Math.max(0, ...rows.map((row) => Number(row[key] || 0)));
    return {
      max,
      names: rows
        .filter((row) => Number(row[key] || 0) === max)
        .map((row) => row.name),
    };
  }

  function buildHitStats(matches) {
    const stats = new Map(
      data.players.map((name) => [name, { name, exact: 0, outcome: 0 }]),
    );

    matches.forEach((match) => {
      data.players.forEach((name) => {
        const prediction = getPrediction(match, name);
        const row = stats.get(name);
        if (prediction === match.result) {
          row.exact += 1;
          return;
        }

        const predictedOutcome = getOutcome(prediction);
        if (
          predictedOutcome !== null &&
          predictedOutcome === getOutcome(match.result)
        ) {
          row.outcome += 1;
        }
      });
    });

    return stats;
  }

  function getLastMatchLeaders(matchNumber) {
    const snapshotIndex = snapshots.findIndex(
      (snapshot) => Number(snapshot.matchNumber || 0) === Number(matchNumber || 0),
    );

    if (snapshotIndex <= 0) {
      return { max: 0, names: [] };
    }

    const current = snapshots[snapshotIndex];
    const previous = snapshots[snapshotIndex - 1];
    return findMaxRows(
      data.players.map((name) => ({
        name,
        points:
          Number(current.totals[name] || 0) -
          Number(previous.totals[name] || 0),
      })),
      "points",
    );
  }

  function getStrongestConsensus(matches = completedPredictionMatches) {
    let strongest = null;

    matches.forEach((match) => {
      const popular = getPopularPrediction(match);
      if (!popular) return;
      if (!strongest || popular.count > strongest.count) {
        strongest = {
          ...popular,
          match: match.match,
        };
      }
    });

    return strongest;
  }

  function getPopularPrediction(match) {
    const counts = new Map();
    data.players.forEach((name) => {
      const prediction = getPrediction(match, name);
      if (!prediction || prediction === "X-X") return;
      counts.set(prediction, (counts.get(prediction) || 0) + 1);
    });

    const [prediction, count] = [...counts.entries()].sort(
      (a, b) => b[1] - a[1] || a[0].localeCompare(b[0], "pl"),
    )[0] || [null, 0];

    if (!prediction) return null;
    return { prediction, count };
  }

  function getMatchDifficultyExtremes(matches = completedPredictionMatches) {
    const scoredMatches = matches.map((match) => ({
      ...getMatchScoreStats(match),
      match: match.match,
      matchNumber: Number(match.number || 0),
    }));

    if (scoredMatches.length === 0) {
      return { hardest: [], easiest: [] };
    }

    const minScored = Math.min(...scoredMatches.map((match) => match.scoredCount));
    const maxScored = Math.max(...scoredMatches.map((match) => match.scoredCount));

    return {
      hardest: scoredMatches.filter((match) => match.scoredCount === minScored),
      easiest: scoredMatches.filter((match) => match.scoredCount === maxScored),
    };
  }

  function getMatchScoreStats(match) {
    const exactNames = [];
    const outcomeNames = [];

    data.players.forEach((name) => {
      const prediction = getPrediction(match, name);
      if (prediction === match.result) {
        exactNames.push(name);
        return;
      }

      const predictedOutcome = getOutcome(prediction);
      if (
        predictedOutcome !== null &&
        predictedOutcome === getOutcome(match.result)
      ) {
        outcomeNames.push(name);
      }
    });

    return {
      exactNames,
      outcomeNames,
      scoredNames: [...exactNames, ...outcomeNames],
      exactCount: exactNames.length,
      outcomeCount: outcomeNames.length,
      scoredCount: exactNames.length + outcomeNames.length,
    };
  }

  function renderFormChart(playerName) {
    const values = snapshots.map((snapshot) =>
      Number(snapshot.totals[playerName] || 0),
    );
    const maxValue = Math.max(1, ...values);
    const width = 240;
    const height = 72;
    const points = values
      .map((value, index) => {
        const x = values.length <= 1 ? 0 : (index / (values.length - 1)) * width;
        const y = height - 10 - (value / maxValue) * (height - 20);
        return `${x.toFixed(1)},${y.toFixed(1)}`;
      })
      .join(" ");
    const recent = getRecentGains(playerName, 5);
    const recentText =
      recent.length > 0
        ? recent.map((gain) => (gain > 0 ? `+${gain}` : "0")).join("  ")
        : "brak danych";

    return `
      <div class="player-form-heading">
        <span>Forma punktowa</span>
        <strong>${values.at(-1) || 0} pkt</strong>
      </div>
      <svg
        class="player-form-svg"
        viewBox="0 0 ${width} ${height}"
        role="img"
        aria-label="Wykres formy punktowej zawodnika"
      >
        <polyline points="${points}" />
      </svg>
      <p>Ostatnie ${recent.length || 0} meczów: ${recentText}</p>
    `;
  }

  function getRecentGains(playerName, limit) {
    const start = Math.max(1, snapshots.length - limit);
    const gains = [];

    for (let index = start; index < snapshots.length; index += 1) {
      const current = Number(snapshots[index].totals[playerName] || 0);
      const previous = Number(snapshots[index - 1].totals[playerName] || 0);
      gains.push(current - previous);
    }

    return gains;
  }

  function getPrediction(match, player) {
    return match.predictions?.[player] || "X-X";
  }

  function getOutcome(score) {
    const match = String(score).trim().match(/^(\d+)\s*[-:]\s*(\d+)$/);
    if (!match) return null;

    const home = Number(match[1]);
    const away = Number(match[2]);
    if (home === away) return "draw";
    return home > away ? "home" : "away";
  }

  function formatNames(names, limit = 3) {
    if (names.length <= limit) return names.join(", ");
    return `${names.slice(0, limit).join(", ")} i ${names.length - limit} os.`;
  }

  function formatMatchNames(matches, limit = 2) {
    const names = matches.map((match) => match.match);
    if (names.length <= limit) return names.join(", ");
    return `${names.slice(0, limit).join(", ")} i ${names.length - limit} mecze`;
  }

  function pluralPlaces(value) {
    if (value === 1) return "miejsce";
    const lastTwo = value % 100;
    const last = value % 10;
    if (last >= 2 && last <= 4 && !(lastTwo >= 12 && lastTwo <= 14)) {
      return "miejsca";
    }
    return "miejsc";
  }

  function animateNumber(element, from, to) {
    const animationToken = String(performance.now());
    element.dataset.animationToken = animationToken;

    if (from === to || window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      element.textContent = String(to);
      return;
    }

    const startedAt = performance.now();
    const duration = 650;

    const tick = (now) => {
      if (element.dataset.animationToken !== animationToken) return;
      const progress = Math.min(1, (now - startedAt) / duration);
      const eased = 1 - Math.pow(1 - progress, 3);
      element.textContent = String(Math.round(from + (to - from) * eased));
      if (progress < 1) window.requestAnimationFrame(tick);
    };

    window.requestAnimationFrame(tick);
  }

  function getPlayerColor(index) {
    const colors = [
      "#32c877",
      "#38a8d0",
      "#f0b84b",
      "#9a7de0",
      "#e97575",
      "#4fc3ad",
      "#ef8f49",
      "#6f98c9",
    ];
    return colors[index % colors.length];
  }

  function buildDailySnapshots(sourceSnapshots) {
    const [opening, ...completedSnapshots] = sourceSnapshots;
    const daily = [
      {
        ...opening,
        dayKey: "",
        dayMatchCount: 0,
        firstMatchNumber: 0,
      },
    ];

    completedSnapshots.forEach((snapshot) => {
      const dayKey = snapshot.date || "Bez daty";
      const previousDay = daily[daily.length - 1];

      if (previousDay.dayKey === dayKey) {
        daily[daily.length - 1] = {
          ...snapshot,
          dayKey,
          dayMatchCount: previousDay.dayMatchCount + 1,
          firstMatchNumber: previousDay.firstMatchNumber,
        };
        return;
      }

      daily.push({
        ...snapshot,
        dayKey,
        dayMatchCount: 1,
        firstMatchNumber: snapshot.matchNumber,
      });
    });

    return daily;
  }

  function findClosestSnapshotIndex(snapshotList, matchNumber) {
    for (let index = snapshotList.length - 1; index >= 0; index -= 1) {
      if ((snapshotList[index].matchNumber || 0) <= matchNumber) {
        return index;
      }
    }

    return 0;
  }

  function formatDateLabel(value) {
    if (!value) return "Bez daty";

    const parts = String(value).split("-").map(Number);
    if (parts.length !== 3 || parts.some(Number.isNaN)) return value;

    return new Date(Date.UTC(parts[0], parts[1] - 1, parts[2]))
      .toLocaleDateString("pl-PL", {
        weekday: "long",
        day: "numeric",
        month: "long",
      });
  }

  function pluralMatches(value) {
    if (value === 1) return "mecz";
    const lastTwo = value % 100;
    const last = value % 10;
    if (last >= 2 && last <= 4 && !(lastTwo >= 12 && lastTwo <= 14)) {
      return "mecze";
    }
    return "meczów";
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
