$ErrorActionPreference = 'Stop'
$projectPath = (Resolve-Path -LiteralPath $PSScriptRoot).Path
$timestamp = Get-Date -Format 'yyyyMMdd-HHmmss-fff'
$zipPath = Join-Path (Split-Path -Parent $projectPath) "flor-de-lista-$timestamp.zip"
$include = @('public', '.gitignore', 'README.md', 'CONFIGURAR.txt', 'GITHUB.txt', 'firestore.rules', 'firebase.json', 'gerar-zip.ps1', 'evidencias')
$files = $include | ForEach-Object { Join-Path $projectPath $_ } | Where-Object { Test-Path -LiteralPath $_ }
Compress-Archive -LiteralPath $files -DestinationPath $zipPath
Write-Output "Pacote criado: $zipPath"
