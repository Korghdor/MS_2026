#!/usr/bin/env python3
"""Extract the BalticWood tournament ranking from an XLSM workbook."""

from __future__ import annotations

import json
import math
import posixpath
import re
import sys
import xml.etree.ElementTree as ET
from datetime import datetime, timedelta, timezone
from pathlib import Path
from zipfile import BadZipFile, ZipFile


MAIN_NS = "http://schemas.openxmlformats.org/spreadsheetml/2006/main"
DOC_REL_NS = "http://schemas.openxmlformats.org/officeDocument/2006/relationships"
PACKAGE_REL_NS = "http://schemas.openxmlformats.org/package/2006/relationships"
NS = {"m": MAIN_NS}
REL_NS = {"r": PACKAGE_REL_NS}
TARGET_SHEET = "Faza Grupowa - Punktacja"
PREDICTIONS_SHEET = "Typy"
RESULT_PATTERN = re.compile(r"^\s*\d+\s*[-:–—]\s*\d+\s*$")
CELL_PATTERN = re.compile(r"^([A-Z]+)(\d+)$")


def column_number(reference: str) -> int:
    match = CELL_PATTERN.match(reference)
    if not match:
        raise ValueError(f"Invalid cell reference: {reference}")
    result = 0
    for character in match.group(1):
        result = result * 26 + ord(character) - ord("A") + 1
    return result


def load_shared_strings(archive: ZipFile) -> list[str]:
    try:
        root = ET.fromstring(archive.read("xl/sharedStrings.xml"))
    except KeyError:
        return []

    return [
        "".join(node.text or "" for node in item.iterfind(".//m:t", NS))
        for item in root.findall("m:si", NS)
    ]


def find_sheet_path(archive: ZipFile, sheet_name: str) -> str:
    workbook = ET.fromstring(archive.read("xl/workbook.xml"))
    relationships = ET.fromstring(archive.read("xl/_rels/workbook.xml.rels"))
    targets = {
        relation.attrib["Id"]: relation.attrib["Target"]
        for relation in relationships.findall("r:Relationship", REL_NS)
    }

    for sheet in workbook.findall("m:sheets/m:sheet", NS):
        if sheet.attrib["name"] != sheet_name:
            continue
        relation_id = sheet.attrib[f"{{{DOC_REL_NS}}}id"]
        target = targets[relation_id].lstrip("/")
        if target.startswith("xl/"):
            return posixpath.normpath(target)
        return posixpath.normpath(posixpath.join("xl", target))

    raise ValueError(f'Nie znaleziono arkusza "{sheet_name}".')


def read_cell_value(cell: ET.Element, shared_strings: list[str]):
    cell_type = cell.attrib.get("t")

    if cell_type == "inlineStr":
        return "".join(node.text or "" for node in cell.iterfind(".//m:t", NS))

    value_node = cell.find("m:v", NS)
    if value_node is None:
        return None

    raw_value = value_node.text or ""
    if cell_type == "s":
        return shared_strings[int(raw_value)]
    if cell_type == "b":
        return raw_value == "1"
    if cell_type in {"str", "e"}:
        return raw_value

    try:
        number = float(raw_value)
        return int(number) if number.is_integer() else number
    except ValueError:
        return raw_value


def read_sheet(archive: ZipFile, sheet_path: str, shared_strings: list[str]):
    root = ET.fromstring(archive.read(sheet_path))
    rows: dict[int, dict[int, object]] = {}

    for row in root.findall("m:sheetData/m:row", NS):
        row_number = int(row.attrib["r"])
        values = {}
        for cell in row.findall("m:c", NS):
            values[column_number(cell.attrib["r"])] = read_cell_value(
                cell, shared_strings
            )
        rows[row_number] = values
    return rows


def clean_text(value) -> str:
    return value.strip() if isinstance(value, str) else ""


def numeric_value(value) -> float:
    if isinstance(value, bool):
        return 0
    if isinstance(value, (int, float)) and math.isfinite(value):
        return value
    if isinstance(value, str):
        try:
            return float(value.strip().replace(",", "."))
        except ValueError:
            return 0
    return 0


def excel_date(serial) -> str:
    value = numeric_value(serial)
    if value <= 0:
        return ""
    date = datetime(1899, 12, 30) + timedelta(days=value)
    return date.strftime("%Y-%m-%d")


def excel_time(serial) -> str:
    value = numeric_value(serial)
    if value < 0:
        return ""
    minutes = int(round((value % 1) * 24 * 60)) % (24 * 60)
    return f"{minutes // 60:02d}:{minutes % 60:02d}"


def point_value(value):
    number = numeric_value(value)
    return int(number) if float(number).is_integer() else number


def build_tournament_data(workbook_path: Path) -> dict:
    try:
        with ZipFile(workbook_path) as archive:
            shared_strings = load_shared_strings(archive)
            sheet_path = find_sheet_path(archive, TARGET_SHEET)
            rows = read_sheet(archive, sheet_path, shared_strings)
    except (BadZipFile, KeyError, ET.ParseError) as error:
        raise ValueError(f"Nie można odczytać pliku XLSM: {error}") from error

    header = rows.get(1, {})
    player_columns = {
        column: clean_text(value)
        for column, value in header.items()
        if column >= 6 and clean_text(value)
    }
    if not player_columns:
        raise ValueError("Nie znaleziono zawodników w nagłówku od kolumny F.")

    players = list(player_columns.values())
    matches = []
    completed_matches = []
    summary_row = None

    for row_number in sorted(rows):
        if row_number == 1:
            continue

        row = rows[row_number]
        match_name = clean_text(row.get(4))
        if match_name.casefold() == "podsumowanie":
            summary_row = row
            continue

        match_number_raw = numeric_value(row.get(1))
        if match_number_raw <= 0 or not match_name or match_name == "0":
            continue

        result = clean_text(row.get(5))
        match = {
            "number": int(match_number_raw),
            "date": excel_date(row.get(2)),
            "time": excel_time(row.get(3)),
            "match": match_name,
            "result": result,
        }
        matches.append(match)

        if not RESULT_PATTERN.match(result):
            continue

        points = {
            player: point_value(row.get(column))
            for column, player in player_columns.items()
        }
        completed_matches.append({**match, "points": points})

    matches.sort(key=lambda item: item["number"])
    completed_matches.sort(key=lambda item: item["number"])

    cumulative = {player: 0 for player in players}
    race_snapshots = []
    for match in completed_matches:
        for player, points in match["points"].items():
            cumulative[player] += points
        race_snapshots.append(
            {
                "matchNumber": match["number"],
                "date": match["date"],
                "time": match["time"],
                "match": match["match"],
                "result": match["result"],
                "totals": dict(cumulative),
            }
        )

    summary_totals = (
        {
            player: point_value(summary_row.get(column))
            for column, player in player_columns.items()
        }
        if summary_row
        else {}
    )
    current_totals = (
        summary_totals
        if summary_totals and (any(summary_totals.values()) or not completed_matches)
        else cumulative
    )
    last_match_points = (
        completed_matches[-1]["points"]
        if completed_matches
        else {player: 0 for player in players}
    )

    warnings = []
    if completed_matches and summary_totals and summary_totals != cumulative:
        warnings.append(
            "Suma punktów z rozegranych meczów różni się od wiersza Podsumowanie."
        )

    modified_at = datetime.fromtimestamp(
        workbook_path.stat().st_mtime, tz=timezone.utc
    ).isoformat(timespec="seconds")

    return {
        "sourceFile": workbook_path.name,
        "sheet": TARGET_SHEET,
        "generatedAt": datetime.now(timezone.utc).isoformat(timespec="seconds"),
        "workbookModifiedAt": modified_at,
        "players": players,
        "matches": matches,
        "completedMatches": completed_matches,
        "currentTotals": current_totals,
        "lastMatchPoints": last_match_points,
        "raceSnapshots": race_snapshots,
        "warnings": warnings,
    }


def build_predictions_data(workbook_path: Path, upcoming_count: int = 4) -> dict:
    try:
        with ZipFile(workbook_path) as archive:
            shared_strings = load_shared_strings(archive)
            sheet_path = find_sheet_path(archive, PREDICTIONS_SHEET)
            rows = read_sheet(archive, sheet_path, shared_strings)
    except (BadZipFile, KeyError, ET.ParseError) as error:
        raise ValueError(f"Nie można odczytać arkusza Typy: {error}") from error

    header = rows.get(1, {})
    player_columns = {
        column: clean_text(value)
        for column, value in header.items()
        if column >= 3 and clean_text(value)
    }
    if not player_columns:
        raise ValueError("Nie znaleziono graczy w arkuszu Typy od kolumny C.")

    players = list(player_columns.values())
    all_matches = []

    for row_number in sorted(rows):
        if row_number == 1:
            continue

        row = rows[row_number]
        match_name = clean_text(row.get(1))
        if not match_name:
            continue

        result = clean_text(row.get(2)) or "X-X"
        completed = bool(RESULT_PATTERN.match(result))
        predictions = {
            player: clean_text(row.get(column)) or "X-X"
            for column, player in player_columns.items()
        }
        all_matches.append(
            {
                "number": row_number - 1,
                "match": match_name,
                "result": result,
                "completed": completed,
                "predictions": predictions,
            }
        )

    last_completed_index = max(
        (
            index
            for index, match in enumerate(all_matches)
            if match["completed"]
        ),
        default=-1,
    )
    completed_matches = [
        match for match in all_matches if match["completed"]
    ]
    upcoming_matches = [
        match
        for match in all_matches[last_completed_index + 1 :]
        if not match["completed"]
    ][:upcoming_count]
    visible_matches = sorted(
        [*completed_matches, *upcoming_matches],
        key=lambda match: match["number"],
    )

    return {
        "sourceFile": workbook_path.name,
        "sheet": PREDICTIONS_SHEET,
        "generatedAt": datetime.now(timezone.utc).isoformat(timespec="seconds"),
        "players": players,
        "completedCount": len(completed_matches),
        "upcomingCount": len(upcoming_matches),
        "matches": visible_matches,
    }


def write_js_data(output_path: Path, variable_name: str, data: dict) -> None:
    output_path.parent.mkdir(parents=True, exist_ok=True)
    payload = json.dumps(data, ensure_ascii=False, indent=2)
    output_path.write_text(
        f"window.{variable_name} = {payload};\n",
        encoding="utf-8",
    )


def main() -> int:
    if len(sys.argv) not in {2, 3}:
        print(
            "Użycie: python scripts/update_data.py <plik.xlsm> "
            "[data/tournament-data.js]",
            file=sys.stderr,
        )
        return 2

    workbook_path = Path(sys.argv[1]).expanduser().resolve()
    output_path = (
        Path(sys.argv[2])
        if len(sys.argv) == 3
        else Path("data/tournament-data.js")
    )

    if not workbook_path.is_file():
        print(f"Nie znaleziono pliku: {workbook_path}", file=sys.stderr)
        return 1

    try:
        data = build_tournament_data(workbook_path)
        predictions_data = build_predictions_data(workbook_path)
    except ValueError as error:
        print(str(error), file=sys.stderr)
        return 1

    predictions_output_path = output_path.with_name("predictions-data.js")
    write_js_data(output_path, "BALTICWOOD_TOURNAMENT_DATA", data)
    write_js_data(
        predictions_output_path,
        "BALTICWOOD_PREDICTIONS_DATA",
        predictions_data,
    )

    print(
        f"Gotowe: {len(data['players'])} zawodników, "
        f"{len(data['completedMatches'])}/{len(data['matches'])} rozegranych meczów."
    )
    print(f"Zapisano: {output_path.resolve()}")
    print(
        f"Typy: {len(predictions_data['players'])} graczy, "
        f"{predictions_data['completedCount']} rozegranych + "
        f"{predictions_data['upcomingCount']} kolejnych."
    )
    print(f"Zapisano: {predictions_output_path.resolve()}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
