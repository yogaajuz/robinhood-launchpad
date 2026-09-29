Add-Type -AssemblyName System.IO.Compression
Add-Type -AssemblyName System.IO.Compression.FileSystem

$zipPath = (Resolve-Path (Join-Path $PSScriptRoot "..\namecheap-deploy.zip")).Path
$mode = [System.IO.Compression.ZipArchiveMode]::Update
$zip = [System.IO.Compression.ZipFile]::Open($zipPath, $mode)

$files = @(
    @{ Local = "index.html"; Entry = "index.html" },
    @{ Local = "launchpad.js"; Entry = "launchpad.js" },
    @{ Local = "app.js"; Entry = "app.js" },
    @{ Local = "frontend\index.html"; Entry = "frontend/index.html" },
    @{ Local = "frontend\launchpad.js"; Entry = "frontend/launchpad.js" },
    @{ Local = "frontend\app.js"; Entry = "frontend/app.js" },
    @{ Local = "backend\server.js"; Entry = "backend/server.js" }
)

foreach ($item in $files) {
    $fullLocal = (Resolve-Path (Join-Path $PSScriptRoot ("..\" + $item.Local))).Path
    if (Test-Path $fullLocal) {
        $existing = $zip.GetEntry($item.Entry)
        if ($null -ne $existing) {
            $existing.Delete()
        }
        [System.IO.Compression.ZipFileExtensions]::CreateEntryFromFile($zip, $fullLocal, $item.Entry)
        Write-Host "Updated $($item.Entry) in ZIP"
    }
}

$zip.Dispose()
Write-Host "✅ namecheap-deploy.zip successfully updated!"
