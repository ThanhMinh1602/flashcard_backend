# deploy-only-cloud-run.ps1
# Deploy code to Google Cloud Run and update environment variables from .env file

$ErrorActionPreference = "Stop"

# ===== DEFAULT CONFIG =====
$defaultProjectId = "ntm-flashcard"
$defaultServiceName = "flashcard-backend"
$defaultRegion = "asia-southeast1"
$defaultTimeout = "300"

# ===== FUNCTIONS =====
function Write-Step($message) {
  Write-Host ""
  Write-Host "==> $message" -ForegroundColor Cyan
}

function Write-Ok($message) {
  Write-Host "OK: $message" -ForegroundColor Green
}

function Write-Warn($message) {
  Write-Host "WARN: $message" -ForegroundColor Yellow
}

function Read-WithDefault($label, $defaultValue) {
  $value = Read-Host "$label [$defaultValue]"
  if ([string]::IsNullOrWhiteSpace($value)) {
    return $defaultValue
  }
  return $value.Trim()
}

# Move to this script's directory, so drag/drop works correctly.
$scriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
Set-Location $scriptDir

Write-Step "Kiem tra folder backend"
if (!(Test-Path "package.json")) {
  throw "Khong thay package.json. Hay dat file ps1 nay trong folder flashcard_backend roi chay lai."
}

if (!(Test-Path "src")) {
  Write-Warn "Khong thay folder src. Neu repo cua ban khac cau truc thi van co the deploy, nhung hay kiem tra lai."
}

Write-Ok "Dang o folder: $((Get-Location).Path)"

Write-Step "Kiem tra gcloud CLI"
$gcloudCmd = Get-Command gcloud -ErrorAction SilentlyContinue
if ($null -eq $gcloudCmd) {
  throw "Chua cai Google Cloud CLI. Cai xong roi mo PowerShell lai: https://cloud.google.com/sdk/docs/install"
}
gcloud --version | Select-Object -First 1 | Write-Ok

Write-Step "Kiem tra account dang login"
$activeAccount = (gcloud auth list --filter=status:ACTIVE --format="value(account)" 2>$null)
if ([string]::IsNullOrWhiteSpace($activeAccount)) {
  Write-Warn "Chua login gcloud. Dang mo trinh duyet de login..."
  gcloud auth login
  $activeAccount = (gcloud auth list --filter=status:ACTIVE --format="value(account)" 2>$null)
}
Write-Ok "Account: $activeAccount"

Write-Step "Nhap thong tin deploy"
$projectId = Read-WithDefault "Project ID" $defaultProjectId
$serviceName = Read-WithDefault "Service name" $defaultServiceName
$region = Read-WithDefault "Region" $defaultRegion
$timeout = Read-WithDefault "Timeout seconds" $defaultTimeout

Write-Step "Set project"
gcloud config set project $projectId | Out-Null
Write-Ok "Da set project thanh $projectId"

Write-Step "Bat API can thiet neu chua bat"
gcloud services enable run.googleapis.com cloudbuild.googleapis.com artifactregistry.googleapis.com | Out-Null
Write-Ok "Da kiem tra/bat cac API can thiet"

Write-Step "Tao/CAP NHAT .gcloudignore de upload source gon hon"
$ignoreContent = @"
node_modules/
.git/
.env
.env.*
npm-debug.log
yarn-error.log
dist/
build/
coverage/
.DS_Store
"@

if (!(Test-Path ".gcloudignore")) {
  Set-Content -Path ".gcloudignore" -Value $ignoreContent -Encoding UTF8
  Write-Ok "Da tao .gcloudignore"
} else {
  Write-Ok ".gcloudignore da ton tai, giu nguyen file hien tai"
}

Write-Step "Chuan bi bien moi truong tu file .env"
$envString = ""
if (Test-Path ".env") {
    $envLines = Get-Content ".env"
    $validEnvs = @()
    foreach ($line in $envLines) {
        $line = $line.Trim()
        # Bỏ qua dòng trống, dòng comment (#) và biến PORT
        if ($line -ne "" -and !$line.StartsWith("#") -and !$line.StartsWith("PORT=")) {
            $validEnvs += $line
        }
    }
    $envString = $validEnvs -join ","
    Write-Ok "Da doc xong cac bien tu .env (da bo qua PORT)"
} else {
    Write-Warn "Khong tim thay file .env, se deploy ma khong kem env."
}

Write-Step "Deploy Cloud Run"
Write-Host "Service: $serviceName"
Write-Host "Project: $projectId"
Write-Host "Region : $region"
Write-Host ""

try {
    if ([string]::IsNullOrWhiteSpace($envString)) {
        gcloud run deploy $serviceName `
            --source . `
            --region $region `
            --allow-unauthenticated `
            --timeout $timeout
    } else {
        gcloud run deploy $serviceName `
            --source . `
            --region $region `
            --allow-unauthenticated `
            --timeout $timeout `
            --update-env-vars=$envString
    }

    Write-Step "Lay URL service"
    $serviceUrl = (gcloud run services describe $serviceName `
        --region $region `
        --format "value(status.url)").Trim()

    if ([string]::IsNullOrWhiteSpace($serviceUrl)) {
        Write-Warn "Deploy xong nhung chua lay duoc URL. Vao Cloud Run Console de xem service."
    } else {
        Write-Host ""
        Write-Host "DEPLOY THANH CONG!" -ForegroundColor Green
        Write-Host "API URL      : $serviceUrl" -ForegroundColor Green
        Write-Host "Health check : $serviceUrl/health" -ForegroundColor Green
        Write-Host "Swagger      : $serviceUrl/api-docs" -ForegroundColor Green
        Write-Host ""
        Write-Host "Frontend .env:"
        Write-Host "VITE_API_BASE_URL=$serviceUrl/api" -ForegroundColor Yellow
    }
}
catch {
    Write-Host ""
    Write-Host "DEPLOY THAT BAI!" -ForegroundColor Red
    Write-Host $_.Exception.Message -ForegroundColor Red
    Write-Host ""
    Write-Host "Doc logs bang lenh:" -ForegroundColor Yellow
    Write-Host "gcloud run services logs read $serviceName --region $region --limit=100" -ForegroundColor Yellow
}

Write-Host ""
Write-Host "Nhan Enter de dong cua so..."
Read-Host