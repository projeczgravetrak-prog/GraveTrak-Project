# Run from the project terminal. Password input is hidden and never printed.
$ErrorActionPreference = 'Stop'
$projectRoot = Split-Path -Parent $PSScriptRoot
$privateDirectory = Join-Path $projectRoot '.tmp/supabase-demo'
$configFile = Join-Path $privateDirectory 'connection-private.json'

Write-Host 'Enter details for the NEW empty Supabase demo project only.'
Write-Host 'Copy Host and User from Connect > Session pooler.'
$demoHost = (Read-Host 'Host').Trim()
$demoUser = (Read-Host 'User (postgres.PROJECT_REF)').Trim()
if ($demoHost -notmatch '^[a-zA-Z0-9.-]+\.pooler\.supabase\.com$') {
    throw 'Expected the session-pooler hostname from Supabase Connect.'
}
if ($demoUser -notmatch '^postgres\.[a-z0-9]+$') {
    throw 'Expected the full session-pooler user, including the project reference.'
}
$demoPassword = Read-Host 'NEW project database password (hidden)' -AsSecureString
$passwordPointer = [IntPtr]::Zero
try {
    $passwordPointer = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($demoPassword)
    $plainPassword = [Runtime.InteropServices.Marshal]::PtrToStringBSTR($passwordPointer)
    if ([string]::IsNullOrWhiteSpace($plainPassword)) { throw 'Password cannot be empty.' }
    $privateConfig = [ordered]@{
        purpose = 'new-empty-supabase-demo'
        host = $demoHost
        port = 5432
        database = 'postgres'
        user = $demoUser
        password = $plainPassword
        sslmode = 'require'
    }
    New-Item -ItemType Directory -Path $privateDirectory -Force | Out-Null
    $privateConfig | ConvertTo-Json | Set-Content -LiteralPath $configFile -Encoding UTF8
    Write-Host 'Saved privately under .tmp/supabase-demo (excluded from Git and source ZIP).'
    Write-Host 'No database connection or changes were made. Tell Codex: connection saved.'
    Write-Host 'Do not share this file or include .tmp when uploading your project.'
} finally {
    if ($passwordPointer -ne [IntPtr]::Zero) {
        [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($passwordPointer)
    }
    $plainPassword = $null
    $privateConfig = $null
    $demoPassword.Dispose()
}
