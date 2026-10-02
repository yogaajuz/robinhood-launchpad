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
    @{ Local = "deploy.html"; Entry = "deploy.html" },
    @{ Local = "frontend\deploy.html"; Entry = "frontend/deploy.html" },
    @{ Local = "backend\server.js"; Entry = "backend/server.js" },
    @{ Local = "backend\indexer.js"; Entry = "backend/indexer.js" },
    @{ Local = "trades.php"; Entry = "trades.php" },
    @{ Local = "socials.php"; Entry = "socials.php" },
    @{ Local = "upload.php"; Entry = "upload.php" },
    @{ Local = "frontend\trades.php"; Entry = "frontend/trades.php" },
    @{ Local = "frontend\socials.php"; Entry = "frontend/socials.php" },
    @{ Local = "frontend\upload.php"; Entry = "frontend/upload.php" },
    @{ Local = "styles.css"; Entry = "styles.css" },
    @{ Local = "frontend\styles.css"; Entry = "frontend/styles.css" },
    @{ Local = ".htaccess"; Entry = ".htaccess" },
    @{ Local = "uploads\.htaccess"; Entry = "uploads/.htaccess" },
    @{ Local = "frontend\uploads\.htaccess"; Entry = "frontend/uploads/.htaccess" },
    @{ Local = "whitepaper.html"; Entry = "whitepaper.html" },
    @{ Local = "frontend\whitepaper.html"; Entry = "frontend/whitepaper.html" },
    @{ Local = "WHITEPAPER.md"; Entry = "WHITEPAPER.md" }
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
