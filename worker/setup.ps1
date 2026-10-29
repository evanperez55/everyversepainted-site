# One-time setup for the everyversepainted.com signup Worker.
# Run in PowerShell:  cd C:\Users\evanp\projects\everyversepainted-site\worker ; .\setup.ps1
# It logs in to Cloudflare, deploys the Worker, then asks you to paste each secret.
# Secrets go straight to Cloudflare; nothing is written to disk or printed.

$ErrorActionPreference = "Stop"
Set-Location $PSScriptRoot

Write-Host "`n1/5  Logging in to Cloudflare (a browser window will open)..." -ForegroundColor Yellow
npx wrangler login

Write-Host "`n2/5  Deploying the Worker..." -ForegroundColor Yellow
npx wrangler deploy

Write-Host "`n3/5  Paste your NEW Resend API key (resend.com > API Keys, Full access), then press Enter:" -ForegroundColor Yellow
npx wrangler secret put RESEND_API_KEY

Write-Host "`n4/5  Paste the Turnstile SECRET key (Cloudflare > Turnstile > 'Every Verse Painted signup'), then press Enter:" -ForegroundColor Yellow
npx wrangler secret put TURNSTILE_SECRET

Write-Host "`n5/5  Generating and storing a random signing secret (nothing to paste)..." -ForegroundColor Yellow
$bytes = New-Object byte[] 32
[System.Security.Cryptography.RandomNumberGenerator]::Create().GetBytes($bytes)
$hex = -join ($bytes | ForEach-Object { $_.ToString("x2") })
$hex | npx wrangler secret put SIGNING_SECRET
Remove-Variable hex, bytes

Write-Host "`nDone. Copy the *.workers.dev URL printed in step 2 and send it to Claude." -ForegroundColor Green
