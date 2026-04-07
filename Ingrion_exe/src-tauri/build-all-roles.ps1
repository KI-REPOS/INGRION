# INGRION Multi-Role Debug Builder
# Place this in D:\ingrion-exe\ingrion\
# Also place the 4 tauri.conf.*.json files in src-tauri\

$roles = @("user", "validator", "regulator", "company")
$projectRoot = Get-Location
$tauriDir = "$projectRoot\src-tauri"
$outputDir = "$tauriDir\target\debug\roles"
$confPath = "$tauriDir\tauri.conf.json"
$backupPath = "$tauriDir\tauri.conf.backup.json"

New-Item -ItemType Directory -Force -Path $outputDir | Out-Null

# Backup original
Copy-Item $confPath $backupPath -Force

Write-Host "Building frontend..." -ForegroundColor Cyan
npx vite build
if ($LASTEXITCODE -ne 0) {
    Write-Host "Frontend build failed!" -ForegroundColor Red
    exit 1
}

foreach ($role in $roles) {
    Write-Host "Building role: $role" -ForegroundColor Yellow

    $roleCfg = "$tauriDir\tauri.conf.$role.json"
    if (-not (Test-Path $roleCfg)) {
        Write-Host "Missing: $roleCfg" -ForegroundColor Red
        continue
    }

    # Copy role config as main config (simple file copy, no JSON parsing)
    Copy-Item $roleCfg $confPath -Force

    Push-Location $tauriDir
    cargo build
    $exitCode = $LASTEXITCODE
    Pop-Location

    if ($exitCode -ne 0) {
        Write-Host "Build failed for $role" -ForegroundColor Red
    } else {
        $src = "$tauriDir\target\debug\ingrion.exe"
        $dst = "$outputDir\ingrion-$role.exe"
        Copy-Item $src $dst -Force
        Write-Host "Saved: $dst" -ForegroundColor Green
    }
}

# Restore original
Copy-Item $backupPath $confPath -Force
Remove-Item $backupPath -Force
Write-Host "Done! Original config restored." -ForegroundColor Cyan
Write-Host "Your exes are in: $outputDir" -ForegroundColor Green
