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

  const standings = data.players
    .map((name) => ({
      name,
      points: Number(data.currentTotals[name] || 0),
      lastPoints: Number(data.lastMatchPoints?.[name] || 0),
    }))
    .sort(
      (a, b) =>
        b.points - a.points || a.name.localeCompare(b.name, "pl", { sensitivity: "base" }),
    );

  let currentRank = 0;
  let previousPoints = null;

  standings.forEach((player) => {
    if (previousPoints === null || player.points < previousPoints) {
      currentRank += 1;
    }
    player.rank = currentRank;
    previousPoints = player.points;
  });

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

  const standingsBody = byId("standings-body");
  const emptyState = byId("empty-state");

  const renderTable = (query = "") => {
    const normalized = query.trim().toLocaleLowerCase("pl");
    const filtered = standings.filter((player) =>
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

    emptyState.hidden = filtered.length > 0;
  };

  byId("player-search").addEventListener("input", (event) => {
    renderTable(event.target.value);
  });
  renderTable();

  const generatedAt = new Date(data.generatedAt);
  byId("updated-at").textContent = Number.isNaN(generatedAt.getTime())
    ? data.generatedAt
    : new Intl.DateTimeFormat("pl-PL", {
        dateStyle: "long",
        timeStyle: "short",
      }).format(generatedAt);

  const snapshots =
    data.raceSnapshots.length > 0
      ? data.raceSnapshots
      : [
          {
            matchNumber: 0,
            match: "Czekamy na pierwszy wynik",
            result: "",
            date: "",
            time: "",
            totals: Object.fromEntries(data.players.map((name) => [name, 0])),
          },
        ];

  const raceBars = byId("race-bars");
  const range = byId("race-range");
  const playButton = byId("race-play");
  const prevButton = byId("race-prev");
  const nextButton = byId("race-next");
  let raceIndex = snapshots.length - 1;
  let timer = null;

  range.max = String(snapshots.length - 1);
  range.value = String(raceIndex);

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
    byId("race-progress").textContent = `${raceIndex + 1} / ${snapshots.length}`;

    raceBars.innerHTML = rows
      .map(
        (row) => `
          <div class="race-row">
            <span class="race-name" title="${escapeHtml(row.name)}">${escapeHtml(row.name)}</span>
            <div class="race-track" aria-hidden="true">
              <div class="race-fill" style="width: ${(row.points / maxPoints) * 100}%"></div>
            </div>
            <strong class="race-points">${row.points}</strong>
          </div>
        `,
      )
      .join("");

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
    }, 1500);
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

  function escapeHtml(value) {
    return String(value)
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#039;");
  }
})();
