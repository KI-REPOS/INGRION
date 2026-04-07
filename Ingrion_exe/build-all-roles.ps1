$roles = @("user", "validator", "regulator", "company")
$tauriDir = "src-tauri"
$outputDir = "$tauriDir\target\debug\roles"
$confPath = "$tauriDir\tauri.conf.json"

New-Item -ItemType Directory -Force -Path $outputDir | Out-Null

Write-Host "Building frontend..." -ForegroundColor Cyan
npx vite build
if ($LASTEXITCODE -ne 0) { Write-Host "Frontend build failed!" -ForegroundColor Red; exit 1 }

foreach ($role in $roles) {
    Write-Host "Building role: $role" -ForegroundColor Yellow
    $roleCfg = "$tauriDir\tauri.conf.$role.json"
    Copy-Item $roleCfg $confPath -Force
    Push-Location $tauriDir
    cargo build
    $exitCode = $LASTEXITCODE
    Pop-Location
    if ($exitCode -ne 0) {
        Write-Host "Build failed for $role" -ForegroundColor Red
    } else {
        Copy-Item "$tauriDir\target\debug\ingrion.exe" "$outputDir\ingrion-$role.exe" -Force
        Write-Host "Saved: ingrion-$role.exe" -ForegroundColor Green
    }
}

Copy-Item "$tauriDir\tauri.conf.app.json" $confPath -Force
Write-Host "Done! Exes in: $outputDir" -ForegroundColor Green
