# Capture server-only Supabase S3 credentials without echoing the secret.
$ErrorActionPreference = 'Stop'
$projectRoot = Split-Path -Parent $PSScriptRoot
$privateDirectory = Join-Path $projectRoot '.tmp/supabase-demo'
$configFile = Join-Path $privateDirectory 'storage-private.json'
$projectConfigFile = Join-Path $privateDirectory 'connection-private.json'
if (-not (Test-Path -LiteralPath $projectConfigFile)) { throw 'Save the new project database connection first.' }
$projectConfig = Get-Content -LiteralPath $projectConfigFile -Raw | ConvertFrom-Json
$projectRef = $projectConfig.user -replace '^postgres\.', ''
Write-Host 'Use Storage > S3 connection settings for the confirmed new project.'
Write-Host 'Generate S3 keys specifically for this private document bucket.'
function Read-ClipboardValue([string]$label) {
    Write-Host "Copy $label in Supabase, then return here and press Enter."
    [void](Read-Host "Press Enter after copying $label")
    $copiedText = $null
    for ($attempt = 0; $attempt -lt 12; $attempt++) {
        try {
            $copiedText = Get-Clipboard -Raw -ErrorAction Stop
            if (-not [string]::IsNullOrWhiteSpace($copiedText)) { break }
        } catch {
            if ($attempt -eq 11) { throw 'Windows clipboard is busy. Copy the value again and rerun this script.' }
        }
        Start-Sleep -Milliseconds 250
    }
    if ([string]::IsNullOrWhiteSpace($copiedText)) { throw "Clipboard is empty for $label. Copy the value and rerun the script." }
    $value = $copiedText.Trim()
    if ([string]::IsNullOrWhiteSpace($value)) { throw "Clipboard was empty for $label. Rerun and copy it first." }
    # Windows PowerShell treats -Value '' as null. Replace copied secrets with
    # harmless whitespace so the sensitive value is no longer on the clipboard.
    $cleared = $false
    for ($attempt = 0; $attempt -lt 12; $attempt++) {
        try {
            Set-Clipboard -Value ([string[]]@(' ')) -ErrorAction Stop
            $cleared = $true
            break
        } catch {
            if ($attempt -eq 11) { throw 'Windows clipboard stayed busy; rerun the script before continuing.' }
            Start-Sleep -Milliseconds 250
        }
    }
    return $value
}
$endpoint = (Read-ClipboardValue 'the S3 endpoint URL').TrimEnd('/')
$region = Read-ClipboardValue 'the S3 region'
$accessKey = Read-ClipboardValue 'the NEW S3 access key ID'
$secret = $null
$secretPointer = [IntPtr]::Zero
try {
    $parsedEndpoint = [Uri]$endpoint
    if ($parsedEndpoint.Scheme -ne 'https' -or $parsedEndpoint.Host -ne "$projectRef.storage.supabase.co" -or
        $parsedEndpoint.AbsolutePath.TrimEnd('/') -ne '/storage/v1/s3' -or $parsedEndpoint.Query -or $parsedEndpoint.UserInfo) {
        throw 'Use this exact project’s HTTPS Supabase Storage S3 endpoint.'
    }
    if ([string]::IsNullOrWhiteSpace($region) -or $region -notmatch '^[a-z0-9-]+$') { throw 'Enter the region shown in Supabase.' }
    if ([string]::IsNullOrWhiteSpace($accessKey)) { throw 'S3 access key ID cannot be empty.' }
    $plainSecret = Read-ClipboardValue 'the NEW S3 secret access key'
    $secret = ConvertTo-SecureString $plainSecret -AsPlainText -Force
    $secretPointer = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($secret)
    $plainSecret = [Runtime.InteropServices.Marshal]::PtrToStringBSTR($secretPointer)
    if ([string]::IsNullOrWhiteSpace($plainSecret)) { throw 'S3 secret cannot be empty.' }
    New-Item -ItemType Directory -Path $privateDirectory -Force | Out-Null
    [ordered]@{
        purpose = 'new-private-supabase-demo-bucket'
        endpoint_url = $endpoint
        region = $region
        bucket = 'gravetrak-documents'
        storage_mode = 'supabase'
        access_key_id = $accessKey
        secret_access_key = $plainSecret
    } | ConvertTo-Json | Set-Content -LiteralPath $configFile -Encoding UTF8
    Write-Host 'Saved privately under .tmp/supabase-demo; keys were not printed.'
    Write-Host 'No connection or upload was made. Tell Codex: storage keys saved.'
} finally {
    if ($secretPointer -ne [IntPtr]::Zero) { [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($secretPointer) }
    $plainSecret = $null
    if ($secret) { $secret.Dispose() }
}
