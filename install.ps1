# agent-telegram CLI Installer for Windows
#
# Usage:
#   irm https://kurier.sh/install.ps1 | iex
#   irm https://kurier.sh/install.ps1 | iex -Version 0.1.0
#
# Or download and run:
#   .\install.ps1 [-Version <version>] [-NoModifyPath]

param(
    [string]$Version = "",
    [switch]$NoModifyPath,
    [switch]$Help
)

$ErrorActionPreference = "Stop"

$App = "agent-telegram"
$Repo = "avemeva/kurier"
$BinName = "$App.exe"

# --- Help ---

if ($Help) {
    Write-Host @"
agent-telegram CLI Installer

Usage: install.ps1 [options]

Options:
    -Version <version>  Install a specific version (e.g., 0.1.0)
    -NoModifyPath       Don't add install directory to PATH
    -Help               Display this help message

Examples:
    irm https://kurier.sh/install.ps1 | iex
    .\install.ps1 -Version 0.1.0
"@
    exit 0
}

# --- Detect architecture ---

$RawArch = [System.Runtime.InteropServices.RuntimeInformation]::OSArchitecture
switch ($RawArch) {
    "X64"   { $Arch = "x64" }
    "Arm64" { $Arch = "arm64" }
    default {
        Write-Host "Error: Unsupported architecture: $RawArch" -ForegroundColor Red
        exit 1
    }
}

$ArchiveName = "$App-win32-$Arch.zip"

# --- Install directories ---

$LocalAppData = $env:LOCALAPPDATA
if (-not $LocalAppData) {
    $LocalAppData = Join-Path $env:USERPROFILE "AppData\Local"
}

$InstallDir = Join-Path $LocalAppData "Programs\$App\bin"
$LibDir = Join-Path $LocalAppData "$App\lib"

# --- Resolve version ---

if ($Version -eq "") {
    # Fetch latest release version
    try {
        $Release = Invoke-RestMethod -Uri "https://api.github.com/repos/$Repo/releases/latest" -Headers @{ "User-Agent" = "agent-telegram-installer" }
        $SpecificVersion = $Release.tag_name -replace "^v", ""
    } catch {
        Write-Host "Error: Failed to fetch latest version information" -ForegroundColor Red
        exit 1
    }
    $DownloadUrl = "https://github.com/$Repo/releases/latest/download/$ArchiveName"
    $ChecksumsUrl = "https://github.com/$Repo/releases/latest/download/checksums.txt"
} else {
    # Strip leading 'v' if present
    $Version = $Version -replace "^v", ""
    $SpecificVersion = $Version

    # Verify the release exists
    try {
        $null = Invoke-WebRequest -Uri "https://github.com/$Repo/releases/tag/v$Version" -Method Head -UseBasicParsing
    } catch {
        if ($_.Exception.Response.StatusCode -eq 404) {
            Write-Host "Error: Release v$Version not found" -ForegroundColor Red
            Write-Host "Available releases: https://github.com/$Repo/releases" -ForegroundColor DarkGray
            exit 1
        }
    }
    $DownloadUrl = "https://github.com/$Repo/releases/download/v$Version/$ArchiveName"
    $ChecksumsUrl = "https://github.com/$Repo/releases/download/v$Version/checksums.txt"
}

# --- Version check ---

$ExistingBin = Join-Path $InstallDir $BinName
if (Test-Path $ExistingBin) {
    try {
        $InstalledVersion = & $ExistingBin --version 2>$null
        if ($InstalledVersion -eq $SpecificVersion) {
            Write-Host "$App v$SpecificVersion is already installed" -ForegroundColor DarkGray
            exit 0
        }
    } catch {
        # Could not determine installed version, proceed with install
    }
}

# --- Download ---

Write-Host ""
Write-Host "Installing " -NoNewline -ForegroundColor DarkGray
Write-Host "$App" -NoNewline
Write-Host " v" -NoNewline -ForegroundColor DarkGray
Write-Host "$SpecificVersion" -NoNewline
Write-Host " (win32/$Arch)" -ForegroundColor DarkGray

$TmpDir = Join-Path ([System.IO.Path]::GetTempPath()) "agent-telegram-install-$PID"
New-Item -ItemType Directory -Force -Path $TmpDir | Out-Null

$ArchivePath = Join-Path $TmpDir $ArchiveName

try {
    $ProgressPreference = 'SilentlyContinue'  # Speeds up Invoke-WebRequest significantly
    Write-Host "Downloading $ArchiveName..." -ForegroundColor DarkGray
    Invoke-WebRequest -Uri $DownloadUrl -OutFile $ArchivePath -UseBasicParsing
} catch {
    Write-Host "Error: Failed to download $ArchiveName" -ForegroundColor Red
    Write-Host "URL: $DownloadUrl" -ForegroundColor DarkGray
    Remove-Item -Recurse -Force $TmpDir -ErrorAction SilentlyContinue
    exit 1
}

# --- Verify checksum ---

try {
    $ChecksumsPath = Join-Path $TmpDir "checksums.txt"
    Invoke-WebRequest -Uri $ChecksumsUrl -OutFile $ChecksumsPath -UseBasicParsing

    $Checksums = Get-Content $ChecksumsPath
    $ExpectedLine = $Checksums | Where-Object { $_ -match $ArchiveName }

    if ($ExpectedLine) {
        $ExpectedHash = ($ExpectedLine -split '\s+')[0]
        $ActualHash = (Get-FileHash -Path $ArchivePath -Algorithm SHA256).Hash.ToLower()

        if ($ActualHash -ne $ExpectedHash.ToLower()) {
            Write-Host "Error: Checksum verification failed" -ForegroundColor Red
            Write-Host "  Expected: $ExpectedHash" -ForegroundColor DarkGray
            Write-Host "  Actual:   $ActualHash" -ForegroundColor DarkGray
            Remove-Item -Recurse -Force $TmpDir -ErrorAction SilentlyContinue
            exit 1
        }
        Write-Host "Checksum verified" -ForegroundColor DarkGray
    } else {
        Write-Host "Warning: No checksum found for $ArchiveName in checksums.txt" -ForegroundColor Yellow
    }
} catch {
    Write-Host "Warning: Could not download checksums.txt, skipping verification" -ForegroundColor Yellow
}

# --- Extract ---

$ExtractDir = Join-Path $TmpDir "extracted"
New-Item -ItemType Directory -Force -Path $ExtractDir | Out-Null

try {
    Expand-Archive -Path $ArchivePath -DestinationPath $ExtractDir -Force
} catch {
    Write-Host "Error: Failed to extract archive" -ForegroundColor Red
    Remove-Item -Recurse -Force $TmpDir -ErrorAction SilentlyContinue
    exit 1
}

# --- Install binary ---

New-Item -ItemType Directory -Force -Path $InstallDir | Out-Null

# Find the binary (might be at top level or in bin/)
$BinarySource = $null
if (Test-Path (Join-Path $ExtractDir "bin\$BinName")) {
    $BinarySource = Join-Path $ExtractDir "bin\$BinName"
} elseif (Test-Path (Join-Path $ExtractDir $BinName)) {
    $BinarySource = Join-Path $ExtractDir $BinName
} else {
    $Found = Get-ChildItem -Path $ExtractDir -Filter $BinName -Recurse -File | Select-Object -First 1
    if ($Found) {
        $BinarySource = $Found.FullName
    }
}

if (-not $BinarySource) {
    Write-Host "Error: Could not find '$BinName' in the archive" -ForegroundColor Red
    Remove-Item -Recurse -Force $TmpDir -ErrorAction SilentlyContinue
    exit 1
}

Copy-Item -Path $BinarySource -Destination (Join-Path $InstallDir $BinName) -Force

# --- Install tdjson.dll ---

$LibSource = Join-Path $ExtractDir "lib"
if (Test-Path $LibSource) {
    New-Item -ItemType Directory -Force -Path $LibDir | Out-Null
    Copy-Item -Path (Join-Path $LibSource "*") -Destination $LibDir -Force
    Write-Host "Installed tdjson to " -NoNewline -ForegroundColor DarkGray
    Write-Host $LibDir
}

# --- Install tdl.node prebuilds ---

$PrebuildsSource = Join-Path $ExtractDir "bin\prebuilds"
if (Test-Path $PrebuildsSource) {
    $PrebuildsDestDir = Join-Path $InstallDir "prebuilds"
    if (Test-Path $PrebuildsDestDir) {
        Remove-Item -Recurse -Force $PrebuildsDestDir
    }
    Copy-Item -Path $PrebuildsSource -Destination $PrebuildsDestDir -Recurse -Force
    Write-Host "Installed tdl.node prebuilds to " -NoNewline -ForegroundColor DarkGray
    Write-Host $PrebuildsDestDir
}

# --- Cleanup ---

Remove-Item -Recurse -Force $TmpDir -ErrorAction SilentlyContinue

# --- Update PATH ---

if (-not $NoModifyPath) {
    $UserPath = [System.Environment]::GetEnvironmentVariable("Path", "User")
    $PathEntries = $UserPath -split ";"

    if ($PathEntries -notcontains $InstallDir) {
        if ($env:GITHUB_ACTIONS -eq "true") {
            # GitHub Actions: use GITHUB_PATH
            Add-Content -Path $env:GITHUB_PATH -Value $InstallDir
            Write-Host "Added $InstallDir to GITHUB_PATH" -ForegroundColor DarkGray
        } else {
            # Add to user PATH permanently
            $NewPath = "$InstallDir;$UserPath"
            [System.Environment]::SetEnvironmentVariable("Path", $NewPath, "User")
            # Also update current session
            $env:Path = "$InstallDir;$env:Path"
            Write-Host "Added " -NoNewline -ForegroundColor DarkGray
            Write-Host "$App" -NoNewline
            Write-Host " to User PATH" -ForegroundColor DarkGray
        }
    } else {
        Write-Host "PATH entry already exists, skipping." -ForegroundColor DarkGray
    }
}

# --- Success ---

Write-Host ""
Write-Host "$App" -NoNewline -ForegroundColor Cyan
Write-Host " v$SpecificVersion installed successfully" -ForegroundColor DarkGray
Write-Host ""
Write-Host "To get started:" -ForegroundColor DarkGray
Write-Host ""
Write-Host "  $App  " -NoNewline
Write-Host "# Launch the Telegram CLI" -ForegroundColor DarkGray
Write-Host ""

$CurrentPath = $env:Path -split ";"
if ($CurrentPath -notcontains $InstallDir) {
    Write-Host "Restart your terminal or run:" -ForegroundColor DarkGray
    Write-Host "  `$env:Path = `"$InstallDir;`$env:Path`""
    Write-Host ""
}
