(() => {
  "use strict";

  const data = window.BALTICWOOD_TOURNAMENT_DATA;

  if (!data || !Array.isArray(data.players)) {
    document.body.innerHTML =
      '<main class="shell section"><h1>Brak danych</h1><p>Uruchom generator danych z pliku XLSM.</p></main>';
    return;
  }

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

  const standingsBody = byId("standings-body");
  const emptyState = byId("empty-state");
  let tableStandings = standings;
  let tableQuery = "";

  const renderTable = (query = "") => {
    const normalized = query.trim().toLocaleLowerCase("pl");
    const filtered = tableStandings.filter((player) =>
      player.name.toLocaleLowerCase("pl").includes(normalized),
    );

    standingsBody.innerHTML = filtered
      .map(
        (player) => `
          <tr>
            <td class="rank-cell"><span class="rank-number">${player.rank}</span></td>
            <td class="table-player">${escapeHtml(player.name)}</td>
            <td>
              <span class="last-points ${player.lastPoints > 0 ? "positive" : ""}">
                ${player.lastPoints > 0 ? `+${player.lastPoints} pkt` : "bez punktów"}
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

  const playbackIntervalMs = 1000;
  const tableRange = byId("table-range");
  const tablePlayButton = byId("table-play");
  const tablePrevButton = byId("table-prev");
  const tableNextButton = byId("table-next");
  let tableIndex = snapshots.length - 1;
  let tableTimer = null;

  tableRange.max = String(snapshots.length - 1);
  tableRange.value = String(tableIndex);

  const renderTableHistory = () => {
    const snapshot = snapshots[tableIndex];
    const previousSnapshot = snapshots[Math.max(0, tableIndex - 1)];

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

    byId("table-kicker").textContent =
      tableIndex === 0
        ? "Przed turniejem"
        : `Klasyfikacja po meczu nr ${snapshot.matchNumber}`;
    byId("table-match-title").textContent = snapshot.match;
    byId("table-match-meta").textContent = [
      snapshot.date,
      snapshot.time,
      snapshot.result,
    ]
      .filter(Boolean)
      .join("  |  ");
    byId("table-progress").textContent =
      `${tableIndex} / ${snapshots.length - 1}`;

    tableRange.value = String(tableIndex);
    tablePrevButton.disabled = tableIndex === 0;
    tableNextButton.disabled = tableIndex === snapshots.length - 1;
    tablePlayButton.disabled = snapshots.length <= 1;
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
    if (snapshots.length <= 1) return;
    if (tableIndex >= snapshots.length - 1) tableIndex = 0;
    renderTableHistory();
    tablePlayButton.textContent = "Pauza";
    tablePlayButton.setAttribute(
      "aria-label",
      "Wstrzymaj historię klasyfikacji",
    );
    tableTimer = window.setInterval(() => {
      if (tableIndex >= snapshots.length - 1) {
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
    tableIndex = Math.min(snapshots.length - 1, tableIndex + 1);
    renderTableHistory();
  });

  tableRange.addEventListener("input", (event) => {
    stopTablePlayback();
    tableIndex = Number(event.target.value);
    renderTableHistory();
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

  function escapeHtml(value) {
    return String(value)
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#039;");
  }
})();
