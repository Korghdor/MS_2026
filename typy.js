(() => {
  "use strict";

  const data = window.BALTICWOOD_PREDICTIONS_DATA;
  const head = document.getElementById("predictions-head");
  const body = document.getElementById("predictions-body");
  const summary = document.getElementById("predictions-summary");

  if (!data || !Array.isArray(data.players) || !Array.isArray(data.matches)) {
    summary.textContent = "Brak danych z arkusza Typy.";
    return;
  }

  head.innerHTML = `
    <tr>
      <th scope="col">Mecz</th>
      <th scope="col">Wynik</th>
      ${data.players
        .map((player) => `<th scope="col">${escapeHtml(player)}</th>`)
        .join("")}
    </tr>
  `;

  body.innerHTML = data.matches
    .map(
      (match) => `
        <tr class="${match.completed ? "match-completed" : "match-upcoming"}">
          <th scope="row">
            <span class="match-number">${match.number}</span>
            ${escapeHtml(match.match)}
          </th>
          <td>
            <span class="result-badge">${escapeHtml(match.result)}</span>
          </td>
          ${data.players
            .map((player) => {
              const prediction = match.predictions[player] || "X-X";
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
              ]
                .filter(Boolean)
                .join(" ");
              return `<td class="${classes}">${escapeHtml(prediction)}</td>`;
            })
            .join("")}
        </tr>
      `,
    )
    .join("");

  summary.textContent =
    `${data.completedCount} rozegranych meczów + ` +
    `${data.upcomingCount} najbliższe z wynikiem X-X`;

  function getOutcome(score) {
    const match = String(score).trim().match(/^(\d+)\s*[-:]\s*(\d+)$/);
    if (!match) return null;

    const home = Number(match[1]);
    const away = Number(match[2]);
    if (home === away) return "draw";
    return home > away ? "home" : "away";
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
