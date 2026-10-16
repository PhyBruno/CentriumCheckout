<#
.SYNOPSIS
  Libera, no Chrome, a impressão local do Centrium Checkout.

.DESCRIPTION
  O Checkout roda em https e imprime mandando o XML da nota para um serviço
  http na própria máquina do PDV (padrão 127.0.0.1:4545). O navegador barra
  essa chamada até que a origem do Checkout seja liberada em duas políticas:

    LocalNetworkAccessAllowedForUrls  - acesso à rede local
    InsecureContentAllowedForUrls     - chamada http a partir de página https

  O script só acrescenta a origem; nunca apaga o que já estava liberado.

  Precisa de PowerShell como administrador. Depois de rodar, abra
  chrome://policy, clique em "Recarregar políticas" e recarregue o Checkout.

.PARAMETER Origem
  Endereço do Checkout, sem barra no final.

.EXAMPLE
  .\liberar-impressao-chrome.ps1

.EXAMPLE
  .\liberar-impressao-chrome.ps1 -Origem https://checkout.cliente.com.br -WhatIf
#>
[CmdletBinding(SupportsShouldProcess)]
param(
  [ValidatePattern('^https://[^/\s]+$')]
  [string]$Origem = 'https://checkout.centrium.inf.br'
)

$ErrorActionPreference = 'Stop'

$RAIZ_CHROME = 'HKLM:\SOFTWARE\Policies\Google\Chrome'
$POLITICAS = 'LocalNetworkAccessAllowedForUrls', 'InsecureContentAllowedForUrls'

function Test-Administrador {
  $identidade = [Security.Principal.WindowsIdentity]::GetCurrent()
  $principal = New-Object Security.Principal.WindowsPrincipal($identidade)
  return $principal.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)
}

# Acrescenta a URL à lista da política, no próximo índice livre. Lista de
# política do Chromium é uma chave com valores REG_SZ chamados 1, 2, 3...
function Add-UrlNaPolitica {
  param([string]$Chave, [string]$Url)

  $existentes = @{}
  if (Test-Path $Chave) {
    $item = Get-Item $Chave
    foreach ($nome in $item.GetValueNames()) { $existentes[$nome] = $item.GetValue($nome) }
  }

  if ($existentes.Values -contains $Url) {
    Write-Host "  já liberado: $Chave"
    return
  }

  $indice = 1
  while ($existentes.ContainsKey("$indice")) { $indice++ }

  if ($PSCmdlet.ShouldProcess("$Chave\$indice", "Gravar $Url")) {
    if (-not (Test-Path $Chave)) { New-Item -Path $Chave -Force | Out-Null }
    New-ItemProperty -Path $Chave -Name "$indice" -Value $Url -PropertyType String -Force | Out-Null
    Write-Host "  liberado:    $Chave ($indice)"
  }
}

if (-not $WhatIfPreference -and -not (Test-Administrador)) {
  throw 'Abra o PowerShell como administrador: as políticas ficam em HKLM.'
}

Write-Host "Chrome - liberando $Origem"
foreach ($politica in $POLITICAS) {
  Add-UrlNaPolitica -Chave (Join-Path $RAIZ_CHROME $politica) -Url $Origem
}

Write-Host ''
Write-Host 'Pronto. Abra chrome://policy, clique em "Recarregar políticas" e recarregue o Checkout.'
