param(
    [string]$WorkbookPath = "$HOME\Downloads\MS_2026.xlsm"
)

$ErrorActionPreference = "Stop"
$ProjectRoot = Split-Path -Parent $MyInvocation.MyCommand.Path
$Generator = Join-Path $ProjectRoot "scripts\update_data.py"
$ExcelGenerator = Join-Path $ProjectRoot "scripts\update_data_excel.ps1"
$Output = Join-Path $ProjectRoot "data\tournament-data.js"
$PredictionsOutput = Join-Path $ProjectRoot "data\predictions-data.js"

if (-not (Test-Path -LiteralPath $WorkbookPath -PathType Leaf)) {
    throw "Nie znaleziono pliku XLSM: $WorkbookPath"
}

$Generated = $false
$Python = Get-Command py -ErrorAction SilentlyContinue
if ($Python -and -not $Generated) {
    & $Python.Source -3 $Generator $WorkbookPath $Output
    $Generated = $LASTEXITCODE -eq 0
}

$Python = Get-Command python -ErrorAction SilentlyContinue
if ($Python -and -not $Generated) {
    & $Python.Source $Generator $WorkbookPath $Output
    $Generated = $LASTEXITCODE -eq 0
}

if (-not $Generated) {
    Write-Host "Korzystam z odczytu danych bezpośrednio przez Excel."
    & $ExcelGenerator -WorkbookPath $WorkbookPath -OutputPath $Output
    $Generated = $true
}

if (
    -not $Generated -or
    -not (Test-Path -LiteralPath $Output -PathType Leaf) -or
    -not (Test-Path -LiteralPath $PredictionsOutput -PathType Leaf)
) {
    throw "Nie udało się wygenerować danych strony."
}

Write-Host ""
Write-Host "Zaktualizowano data\tournament-data.js."
Write-Host "Zaktualizowano data\predictions-data.js."
Write-Host "Podstrony Samotni i Pomyłki przeliczają się automatycznie z data\predictions-data.js."
Write-Host "Następny krok: zatwierdź oba pliki danych i wyślij zmiany do GitHuba."
