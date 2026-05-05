
# ============================================================
# AUTO PUSH TO GITHUB - MMU Biometric E-Voting System
# ============================================================
Write-Host "========================================" -ForegroundColor Cyan
Write-Host "  Pushing project to GitHub..." -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan

Set-Location "C:\Users\Benson\Desktop\britney"

# Step 1: Initialize git if not already initialized
if (-Not (Test-Path ".git")) {
    Write-Host "`n[1/6] Initializing Git repository..." -ForegroundColor Yellow
    git init
} else {
    Write-Host "`n[1/6] Git already initialized. Skipping." -ForegroundColor Green
}

# Step 2: Stage all files
Write-Host "`n[2/6] Staging all files..." -ForegroundColor Yellow
git add .

# Step 3: Commit
Write-Host "`n[3/6] Creating initial commit..." -ForegroundColor Yellow
git commit -m "Initial commit: MMU Biometric E-Voting System"

# Step 4: Set remote
Write-Host "`n[4/6] Setting remote origin..." -ForegroundColor Yellow
$remoteExists = git remote | Select-String "origin"
if ($remoteExists) {
    Write-Host "Remote 'origin' already exists. Updating URL..." -ForegroundColor Green
    git remote set-url origin https://github.com/blaizer259-boop/Biometric_V259.git
} else {
    git remote add origin https://github.com/blaizer259-boop/Biometric_V259.git
}

# Step 5: Rename branch to main
Write-Host "`n[5/6] Setting branch to 'main'..." -ForegroundColor Yellow
git branch -M main

# Step 6: Push to GitHub
Write-Host "`n[6/6] Pushing to GitHub..." -ForegroundColor Yellow
Write-Host "NOTE: Enter your GitHub username and Personal Access Token when prompted." -ForegroundColor Magenta
git push -u origin main --force

Write-Host "`n========================================" -ForegroundColor Cyan
Write-Host "  Done! Check your repo at:" -ForegroundColor Green
Write-Host "  https://github.com/blaizer259-boop/Biometric_V259" -ForegroundColor Green
Write-Host "========================================" -ForegroundColor Cyan
