$ErrorActionPreference = "Stop"

Set-Location $PSScriptRoot

if (-not (Get-Command node -ErrorAction SilentlyContinue)) {
  throw "Node.js is not installed or not on PATH. Install Node.js 18+ and try again."
}

if (-not (Test-Path ".\.env")) {
  if (Test-Path ".\.env.example") {
    Copy-Item ".\.env.example" ".\.env"
    Write-Host "Created .env from .env.example"
  } else {
    throw "Missing .env and .env.example"
  }
}

if (-not (Test-Path ".\node_modules")) {
  Write-Host "Installing dependencies..."
  npm install
}

if ($env:PORT) {
  Write-Host "Starting server on PORT=$env:PORT"
} else {
  Write-Host "Starting server (set `$env:PORT to override)"
}

npm run dev

