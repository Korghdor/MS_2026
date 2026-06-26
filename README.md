# BalticWood Mundial 2026

Statyczna strona rankingu typujących, generowana z arkusza
`Faza Grupowa - Punktacja` w pliku `MS_2026.xlsm`.

## Co pokazuje strona

- aktualne TOP 3,
- animowany Race Chart po każdym rozegranym meczu,
- pełną klasyfikację wszystkich zawodników,
- podstronę z typami wszystkich graczy dla wszystkich meczów,
- liczbę rozegranych meczów i datę aktualizacji.

Lista zawodników jest wykrywana automatycznie z nagłówków od kolumny `F`.
Nowych osób nie trzeba dopisywać w kodzie strony.

## Najprostsza aktualizacja

1. Wpisz wyniki w Excelu i zapisz plik. Zapis jest ważny, ponieważ generator
   odczytuje wartości obliczone przez Excel.
2. Uruchom lokalnego pomocnika:

```powershell
.\update-site.cmd "C:\Users\Maciej\Downloads\MS_2026.xlsm"
```

3. Zatwierdź wygenerowane pliki `data/tournament-data.js` oraz
   `data/predictions-data.js` i wyślij zmianę do GitHuba. Akcja
   `Deploy GitHub Pages` sama opublikuje nową wersję.

Skrypt używa Pythona, jeśli jest dostępny. W przeciwnym razie odczytuje dane
przez zainstalowany program Excel. Sam skoroszyt XLSM pozostaje na komputerze
i nie jest publikowany w repozytorium.

## Pierwsza publikacja na GitHub Pages

1. Utwórz repozytorium GitHub i wyślij do niego ten projekt.
2. W GitHub przejdź do `Settings > Pages`.
3. W polu `Source` wybierz `GitHub Actions`.
4. Wyślij zmianę na gałąź `main` lub `master`.

Workflow publikuje tylko pliki strony i wygenerowane dane rankingu. Skoroszyt
XLSM nie trafia ani do repozytorium, ani do publicznego artefaktu GitHub Pages.

## Ręczne generowanie danych

Generator korzysta wyłącznie ze standardowej biblioteki Pythona:

```powershell
python scripts/update_data.py "C:\ścieżka\MS_2026.xlsm" data/tournament-data.js
```

## Podgląd lokalny

```powershell
python -m http.server 8000
```

Następnie otwórz `http://localhost:8000`.
