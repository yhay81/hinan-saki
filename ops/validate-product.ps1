[CmdletBinding()]
param()

$ErrorActionPreference = "Stop"
$RepoRoot = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path
$WorkerPath = Join-Path $RepoRoot "src\worker.tsx"
$MigrationPath = Join-Path $RepoRoot "migrations\0001_telemetry.sql"
$AppPath = Join-Path $RepoRoot "public\app.js"
$StylesPath = Join-Path $RepoRoot "public\styles.css"
$SourcePath = Join-Path $RepoRoot "SOURCE.md"
$WranglerPath = Join-Path $RepoRoot "wrangler.jsonc"
$PublicDirectory = Join-Path $RepoRoot "public"
$DataDirectory = Join-Path $PublicDirectory "data"

$RequiredFiles = @(
    "DECISIONS.md", "EXPERIMENT.md", "LICENSE", "METRICS.md", "PRIVACY.md", "README.md", "SECURITY.md", "SOURCE.md", "STACK.md",
    ".github\workflows\ci.yml", "migrations\0001_telemetry.sql", "ops\product-metrics.ps1", "ops\product-metrics.sql",
    "ops\submit-indexnow.ps1", "public\app.js", "public\data\index.json", "public\favicon.svg", "public\manifest.webmanifest", "public\og.svg", "public\robots.txt",
    "scripts\build-data.mjs", "src\worker.tsx", "test\shelter-data.test.ts", "test\surface.test.ts"
)
foreach ($RelativePath in $RequiredFiles) {
    if (-not (Test-Path -LiteralPath (Join-Path $RepoRoot $RelativePath))) { throw "Missing required release file: $RelativePath" }
}

$Worker = Get-Content -Raw -LiteralPath $WorkerPath
$Migration = Get-Content -Raw -LiteralPath $MigrationPath
$App = Get-Content -Raw -LiteralPath $AppPath
$Styles = Get-Content -Raw -LiteralPath $StylesPath
$Source = Get-Content -Raw -LiteralPath $SourcePath
$Wrangler = Get-Content -Raw -LiteralPath $WranglerPath
$DataIndex = Get-Content -Raw -LiteralPath (Join-Path $DataDirectory "index.json") | ConvertFrom-Json
$ProductSurface = @($Worker, $App) -join "`n"

if (-not $Worker.Contains('class="route-scene"') -or -not $Worker.Contains('class="street-board"') -or -not $Worker.Contains('class="signpost"') -or -not $Worker.Contains('class="mode-grid"') -or -not $App.Contains('card.className = `place-card ${mode}`') -or -not $App.Contains('fields.className = "field-tags"')) { throw "Expected the street map, route pins, two signs, and place-card visual system" }
if ($ProductSurface -match '(?i)public validation|success criteria|experiment|仮説|成功条件|市場スコア|移行候補|収益性') { throw "Research copy must not appear on the product surface" }
if ($Styles -match '(?i)gradient') { throw "Product CSS must not use gradients" }
if ($Styles -match '(?s)h1\s*\{[^}]*font-size:\s*(?:[4-9]\d|[1-9]\d{2})px') { throw "Primary heading is too large" }
if ($ProductSurface -match '(?i)innerHTML|eval\(|new Function|dangerouslySetInnerHTML') { throw "Official place data must not be interpreted as markup or code" }
if (-not $Worker.Contains('app.post("/api/telemetry"') -or $Worker.Contains('app.post("/api/search"') -or -not $App.Contains('fetch("/data/index.json"') -or -not $App.Contains('fetch(`/data/${code}.json`')) { throw "Place search must stay in the browser and load one regional shard" }
if ($App -match 'history\.(pushState|replaceState)|location\.search\s*=') { throw "Search and place details must not enter product URLs" }
if ($Migration -match '(?i)latitude|longitude|coordinates|prefecture_id|hazard_id|query|search_term|place_id|address|common_id|email|phone_number|telephone|advertising_id|password') { throw "Location, place, contact, advertising, and authentication data do not belong in telemetry storage" }
if (-not $Migration.Contains("CHECK(event_name IN") -or -not $Worker.Contains("35 * 86400")) { throw "Expected allowlisted telemetry and 35-day retention" }
if (-not $Source.Contains("指定緊急避難場所は") -or -not $Source.Contains("指定避難所は") -or -not $Source.Contains("2026年7月27日") -or -not $Source.Contains("国土地理院コンテンツ利用規約") -or -not $Source.Contains("最新でない場合や未掲載の場合")) { throw "Official definitions, source date, terms, and limitations are incomplete" }
if (-not $App.Contains('saved.length >= 6') -or -not $App.Contains('saved.slice(0, 6)')) { throw "Expected a six-place local saved-list limit" }
if (-not $App.Contains("navigator.geolocation.getCurrentPosition") -or -not $App.Contains("distanceKilometers") -or -not $Worker.Contains("geolocation=(self)")) { throw "Expected explicit, local-only nearby sorting" }
if ($App -match 'JSON\.stringify\([^)]*currentPosition|writeLocal\([^)]*currentPosition') { throw "Current position must not be persisted or transmitted" }
if ($ProductSurface -match '(?i)better-auth|betterAuth') { throw "Account authentication is not needed for a local plan" }
if ($Wrangler.Contains("00000000-0000-0000-0000-000000000000")) { throw "The production D1 database ID has not been configured" }

if ($DataIndex.source.totalRows -ne 198595 -or $DataIndex.source.emergency.rows -ne 115529 -or $DataIndex.source.shelter.rows -ne 83066 -or $DataIndex.prefectures.Count -ne 47 -or $DataIndex.hazards.Count -ne 8) { throw "Official evacuation-place dataset dimensions are incorrect" }
if ($DataIndex.source.lastModified -ne "2026-07-27" -or $DataIndex.source.emergency.sha256 -ne "ec5a52bb3cdf6d30e1abd767e96d5746520ff1ca44c2ebca1ba2bb98bea4a450" -or $DataIndex.source.shelter.sha256 -ne "8b688ee3e70c869ca4878a32d89ae98b5be85ecfdbcb45e48e7dc7f3ccebc2f4") { throw "Official evacuation-place source date or hashes are incorrect" }
if ($DataIndex.source.hazardCounts.洪水 -ne 71707 -or $DataIndex.source.hazardCounts.地震 -ne 88281 -or $DataIndex.source.hazardCounts.津波 -ne 40411 -or $DataIndex.source.hazardCounts.火山現象 -ne 10727) { throw "Official hazard counts are incorrect" }

$ShardFiles = @(Get-ChildItem -LiteralPath $DataDirectory -File | Where-Object { $_.Name -match '^\d{2}\.json$' } | Sort-Object Name)
if ($ShardFiles.Count -ne 47) { throw "Expected 47 prefecture shards, found $($ShardFiles.Count)" }
$ExpectedIds = 1..47 | ForEach-Object { $_.ToString("00") }
$ActualIds = $ShardFiles | ForEach-Object { $_.BaseName }
if (($ExpectedIds -join ",") -ne ($ActualIds -join ",")) { throw "Prefecture shard IDs are incomplete" }
$EmergencyCount = [int](($DataIndex.prefectures | Measure-Object -Property e -Sum).Sum)
$ShelterCount = [int](($DataIndex.prefectures | Measure-Object -Property s -Sum).Sum)
if ($EmergencyCount -ne 115529 -or $ShelterCount -ne 83066) { throw "Prefecture index totals are incorrect" }
$TotalBytes = (Get-Item -LiteralPath (Join-Path $DataDirectory "index.json")).Length
foreach ($ShardFile in $ShardFiles) {
    if ($ShardFile.Length -gt 2100000) { throw "Prefecture shard $($ShardFile.Name) exceeds 2.1 MB" }
    $TotalBytes += $ShardFile.Length
}
if ($TotalBytes -gt 31000000) { throw "Static evacuation-place data exceeds 31 MB" }
if ((Get-Item -LiteralPath (Join-Path $PublicDirectory "og.svg")).Length -lt 1500) { throw "Expected a product-specific OG SVG larger than 1.5 KB" }
if ((Get-Item -LiteralPath $AppPath).Length -lt 17000) { throw "Expected a substantial evacuation-place client" }

$KeyFiles = @(Get-ChildItem -LiteralPath $PublicDirectory -File | Where-Object { $_.Name -match "^[a-zA-Z0-9-]{8,128}\.txt$" })
if ($KeyFiles.Count -ne 1) { throw "Expected exactly one generated IndexNow key file, found $($KeyFiles.Count)" }
$Key = (Get-Content -Raw -LiteralPath $KeyFiles[0].FullName).Trim()
if ($Key -ne $KeyFiles[0].BaseName) { throw "IndexNow key file name and content do not match" }

Write-Output "Product release contract is satisfied"
