param(
    [Parameter(Mandatory = $true)]
    [string]$WorkbookPath,

    [Parameter(Mandatory = $true)]
    [string]$OutputPath
)

$ErrorActionPreference = "Stop"
$TargetSheet = "Faza Grupowa - Punktacja"
$ResultPattern = '^\s*\d+\s*[-:–—]\s*\d+\s*$'

function Get-Number {
    param($Value)

    if ($null -eq $Value -or $Value -is [bool]) {
        return 0.0
    }
    if ($Value -is [byte] -or $Value -is [int16] -or $Value -is [int32] -or
        $Value -is [int64] -or $Value -is [single] -or $Value -is [double] -or
        $Value -is [decimal]) {
        return [double]$Value
    }

    $Parsed = 0.0
    $Text = ([string]$Value).Trim().Replace(",", ".")
    if ([double]::TryParse(
        $Text,
        [Globalization.NumberStyles]::Float,
        [Globalization.CultureInfo]::InvariantCulture,
        [ref]$Parsed
    )) {
        return $Parsed
    }
    return 0.0
}

function Get-PointValue {
    param($Value)

    $Number = Get-Number $Value
    if ($Number -eq [math]::Truncate($Number)) {
        return [int]$Number
    }
    return $Number
}

function Get-DateText {
    param($Value)

    $Number = Get-Number $Value
    if ($Number -le 0) {
        return ""
    }
    return [datetime]::FromOADate($Number).ToString("yyyy-MM-dd")
}

function Get-TimeText {
    param($Value)

    $Number = Get-Number $Value
    if ($Number -lt 0) {
        return ""
    }
    $Minutes = [int][math]::Round(($Number - [math]::Floor($Number)) * 1440)
    $Minutes = $Minutes % 1440
    return "{0:00}:{1:00}" -f [math]::Floor($Minutes / 60), ($Minutes % 60)
}

function Copy-OrderedMap {
    param([System.Collections.IDictionary]$Map)

    $Copy = [ordered]@{}
    foreach ($Key in $Map.Keys) {
        $Copy[$Key] = $Map[$Key]
    }
    return $Copy
}

function Get-CellValue {
    param(
        [Array]$Values,
        [int]$Row,
        [int]$Column
    )

    return $Values.GetValue($Row, $Column)
}

$ResolvedWorkbook = (Resolve-Path -LiteralPath $WorkbookPath).Path
$ResolvedOutput = [IO.Path]::GetFullPath($OutputPath)
$Excel = $null
$Workbook = $null
$Sheet = $null
$UsedRange = $null
$PredictionsSheet = $null
$PredictionsRange = $null

try {
    $Excel = New-Object -ComObject Excel.Application
    $Excel.Visible = $false
    $Excel.DisplayAlerts = $false
    $Excel.AutomationSecurity = 3

    $Workbook = $Excel.Workbooks.Open($ResolvedWorkbook, 0, $true)
    $Sheet = $Workbook.Worksheets.Item($TargetSheet)
    $UsedRange = $Sheet.UsedRange
    $Values = $UsedRange.Value2
    $RowCount = $UsedRange.Rows.Count
    $ColumnCount = $UsedRange.Columns.Count

    $PlayerColumns = [ordered]@{}
    for ($Column = 6; $Column -le $ColumnCount; $Column++) {
        $Header = Get-CellValue $Values 1 $Column
        if ($Header -is [string] -and -not [string]::IsNullOrWhiteSpace($Header)) {
            $PlayerColumns.Add([string]$Column, $Header.Trim())
        }
    }

    if ($PlayerColumns.Count -eq 0) {
        throw "Nie znaleziono zawodników w nagłówku od kolumny F."
    }

    $Players = @($PlayerColumns.Values)
    $MatchList = [Collections.Generic.List[object]]::new()
    $CompletedMatches = [Collections.Generic.List[object]]::new()
    $SummaryTotals = $null

    for ($Row = 2; $Row -le $RowCount; $Row++) {
        $MatchNameValue = Get-CellValue $Values $Row 4
        $MatchName = if ($MatchNameValue -is [string]) {
            $MatchNameValue.Trim()
        }
        else {
            ""
        }

        if ($MatchName -eq "Podsumowanie") {
            $SummaryTotals = [ordered]@{}
            foreach ($Column in $PlayerColumns.Keys) {
                $SummaryTotals[$PlayerColumns[$Column]] = Get-PointValue (
                    Get-CellValue $Values $Row $Column
                )
            }
            continue
        }

        $MatchNumber = Get-Number (Get-CellValue $Values $Row 1)
        if ($MatchNumber -le 0 -or [string]::IsNullOrWhiteSpace($MatchName)) {
            continue
        }

        $ResultValue = Get-CellValue $Values $Row 5
        $Result = if ($ResultValue -is [string]) {
            $ResultValue.Trim()
        }
        else {
            [string]$ResultValue
        }

        $Match = [ordered]@{
            number = [int]$MatchNumber
            date = Get-DateText (Get-CellValue $Values $Row 2)
            time = Get-TimeText (Get-CellValue $Values $Row 3)
            match = $MatchName
            result = $Result
        }
        $MatchList.Add([object]$Match)

        if ($Result -notmatch $ResultPattern) {
            continue
        }

        $Points = [ordered]@{}
        foreach ($Column in $PlayerColumns.Keys) {
            $Points[$PlayerColumns[$Column]] = Get-PointValue (
                Get-CellValue $Values $Row $Column
            )
        }

        $CompletedMatch = [ordered]@{
            number = $Match.number
            date = $Match.date
            time = $Match.time
            match = $Match.match
            result = $Match.result
            points = $Points
        }
        $CompletedMatches.Add([object]$CompletedMatch)
    }

    $Cumulative = [ordered]@{}
    foreach ($Player in $Players) {
        $Cumulative[$Player] = 0
    }

    $RaceSnapshots = [Collections.Generic.List[object]]::new()
    foreach ($Match in $CompletedMatches) {
        foreach ($Player in $Players) {
            $Cumulative[$Player] += $Match.points[$Player]
        }
        $Snapshot = [ordered]@{
            matchNumber = $Match.number
            date = $Match.date
            time = $Match.time
            match = $Match.match
            result = $Match.result
            totals = Copy-OrderedMap $Cumulative
        }
        $RaceSnapshots.Add([object]$Snapshot)
    }

    $UseSummary = $false
    if ($null -ne $SummaryTotals) {
        $SummarySum = ($SummaryTotals.Values | Measure-Object -Sum).Sum
        $UseSummary = $SummarySum -ne 0 -or $CompletedMatches.Count -eq 0
    }
    $CurrentTotals = if ($UseSummary) {
        $SummaryTotals
    }
    else {
        $Cumulative
    }

    $LastMatchPoints = [ordered]@{}
    if ($CompletedMatches.Count -gt 0) {
        $LastMatchPoints = Copy-OrderedMap $CompletedMatches[$CompletedMatches.Count - 1].points
    }
    else {
        foreach ($Player in $Players) {
            $LastMatchPoints[$Player] = 0
        }
    }

    $Data = [ordered]@{
        sourceFile = [IO.Path]::GetFileName($ResolvedWorkbook)
        sheet = $TargetSheet
        generatedAt = [DateTimeOffset]::UtcNow.ToString("yyyy-MM-ddTHH:mm:sszzz")
        workbookModifiedAt = [DateTimeOffset]::new(
            (Get-Item -LiteralPath $ResolvedWorkbook).LastWriteTimeUtc
        ).ToString("yyyy-MM-ddTHH:mm:sszzz")
        players = $Players
        matches = @($MatchList)
        completedMatches = @($CompletedMatches)
        currentTotals = $CurrentTotals
        lastMatchPoints = $LastMatchPoints
        raceSnapshots = @($RaceSnapshots)
        warnings = @()
    }

    $PredictionsSheet = $Workbook.Worksheets.Item("Typy")
    $PredictionsRange = $PredictionsSheet.UsedRange
    $PredictionValues = $PredictionsRange.Value2
    $PredictionRowCount = $PredictionsRange.Rows.Count
    $PredictionColumnCount = $PredictionsRange.Columns.Count

    $PredictionPlayerColumns = [ordered]@{}
    for ($Column = 3; $Column -le $PredictionColumnCount; $Column++) {
        $Header = Get-CellValue $PredictionValues 1 $Column
        if ($Header -is [string] -and -not [string]::IsNullOrWhiteSpace($Header)) {
            $PredictionPlayerColumns.Add([string]$Column, $Header.Trim())
        }
    }

    if ($PredictionPlayerColumns.Count -eq 0) {
        throw "Nie znaleziono graczy w arkuszu Typy od kolumny C."
    }

    $PredictionPlayers = @($PredictionPlayerColumns.Values)
    $AllPredictionMatches = [Collections.Generic.List[object]]::new()

    for ($Row = 2; $Row -le $PredictionRowCount; $Row++) {
        $MatchValue = Get-CellValue $PredictionValues $Row 1
        $MatchName = if ($MatchValue -is [string]) {
            $MatchValue.Trim()
        }
        else {
            ""
        }
        if ([string]::IsNullOrWhiteSpace($MatchName)) {
            continue
        }

        $ResultValue = Get-CellValue $PredictionValues $Row 2
        $PredictionResult = if ($ResultValue -is [string] -and
            -not [string]::IsNullOrWhiteSpace($ResultValue)) {
            $ResultValue.Trim()
        }
        else {
            "X-X"
        }
        $IsCompleted = $PredictionResult -match $ResultPattern

        $Predictions = [ordered]@{}
        foreach ($Column in $PredictionPlayerColumns.Keys) {
            $PredictionValue = Get-CellValue $PredictionValues $Row ([int]$Column)
            $PredictionText = if ($PredictionValue -is [string] -and
                -not [string]::IsNullOrWhiteSpace($PredictionValue)) {
                $PredictionValue.Trim()
            }
            else {
                "X-X"
            }
            $Predictions[$PredictionPlayerColumns[$Column]] = $PredictionText
        }

        $PredictionMatch = [ordered]@{
            number = $Row - 1
            match = $MatchName
            result = $PredictionResult
            completed = $IsCompleted
            predictions = $Predictions
        }
        $AllPredictionMatches.Add([object]$PredictionMatch)
    }

    $VisiblePredictionMatches = [Collections.Generic.List[object]]::new()
    $CompletedPredictionCount = 0
    $UpcomingPredictionCount = 0
    foreach ($PredictionMatch in $AllPredictionMatches) {
        $VisiblePredictionMatches.Add([object]$PredictionMatch)
        if ($PredictionMatch.completed) {
            $CompletedPredictionCount += 1
        }
        else {
            $UpcomingPredictionCount += 1
        }
    }

    $PredictionsData = [ordered]@{
        sourceFile = [IO.Path]::GetFileName($ResolvedWorkbook)
        sheet = "Typy"
        generatedAt = [DateTimeOffset]::UtcNow.ToString("yyyy-MM-ddTHH:mm:sszzz")
        players = $PredictionPlayers
        completedCount = $CompletedPredictionCount
        upcomingCount = $UpcomingPredictionCount
        matches = @($VisiblePredictionMatches)
    }

    $OutputDirectory = Split-Path -Parent $ResolvedOutput
    New-Item -ItemType Directory -Path $OutputDirectory -Force | Out-Null
    $Json = $Data | ConvertTo-Json -Depth 10
    $Content = "window.BALTICWOOD_TOURNAMENT_DATA = $Json;`n"
    [IO.File]::WriteAllText(
        $ResolvedOutput,
        $Content,
        [Text.UTF8Encoding]::new($false)
    )
    $PredictionsOutput = Join-Path $OutputDirectory "predictions-data.js"
    $PredictionsJson = $PredictionsData | ConvertTo-Json -Depth 10
    $PredictionsContent = "window.BALTICWOOD_PREDICTIONS_DATA = $PredictionsJson;`n"
    [IO.File]::WriteAllText(
        $PredictionsOutput,
        $PredictionsContent,
        [Text.UTF8Encoding]::new($false)
    )

    Write-Host "Gotowe: $($Players.Count) zawodników, $($CompletedMatches.Count)/$($MatchList.Count) rozegranych meczów."
    Write-Host "Zapisano: $ResolvedOutput"
    Write-Host "Typy: $($PredictionPlayers.Count) graczy, $CompletedPredictionCount rozegranych + $UpcomingPredictionCount do rozegrania."
    Write-Host "Zapisano: $PredictionsOutput"
}
catch {
    Write-Error "$($_.Exception.Message)`n$($_.InvocationInfo.PositionMessage)`n$($_.ScriptStackTrace)"
    throw
}
finally {
    if ($null -ne $Workbook) {
        $Workbook.Close($false)
    }
    if ($null -ne $Excel) {
        $Excel.Quit()
    }
    foreach ($ComObject in @(
        $PredictionsRange,
        $PredictionsSheet,
        $UsedRange,
        $Sheet,
        $Workbook,
        $Excel
    )) {
        if ($null -ne $ComObject) {
            [Runtime.InteropServices.Marshal]::ReleaseComObject($ComObject) | Out-Null
        }
    }
    [GC]::Collect()
    [GC]::WaitForPendingFinalizers()
}
