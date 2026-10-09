<#
.SYNOPSIS
  Libera, no Brave, a impressão local do Centrium Checkout.

.DESCRIPTION
  O Checkout roda em https e imprime mandando o XML da nota para um serviço
  http na própria máquina do PDV (padrão 127.0.0.1:4545). No Brave, quem barra
  essa chamada é o Shields (o leão), que bloqueia o acesso de sites públicos
  ao localhost. O script desliga o Shields SÓ para a origem do Checkout:

    BraveShieldsDisabledForUrls       - Shields desligado para o site

  e, como o Brave é Chromium, grava também as duas políticas do Chrome, na
  chave própria dele:

    LocalNetworkAccessAllowedForUrls  - acesso à rede local
    InsecureContentAllowedForUrls     - chamada http a partir de página https

  O script só acrescenta a origem; nunca apaga o que já estava liberado.

  Precisa de PowerShell como administrador. Depois de rodar, abra
  brave://policy, clique em "Recarregar políticas" e recarregue o Checkout.

.PARAMETER Origem
  Endereço do Checkout, sem barra no final.

.EXAMPLE
  .\liberar-impressao-brave.ps1

.EXAMPLE
  .\liberar-impressao-brave.ps1 -Origem https://checkout.cliente.com.br -WhatIf
#>
[CmdletBinding(SupportsShouldProcess)]
param(
  [ValidatePattern('^https://[^/\s]+$')]
  [string]$Origem = 'https://checkout.centrium.inf.br'
)

$ErrorActionPreference = 'Stop'

$RAIZ_BRAVE = 'HKLM:\SOFTWARE\Policies\BraveSoftware\Brave'
$POLITICAS = 'BraveShieldsDisabledForUrls', 'LocalNetworkAccessAllowedForUrls', 'InsecureContentAllowedForUrls'

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

Write-Host "Brave - liberando $Origem"
foreach ($politica in $POLITICAS) {
  Add-UrlNaPolitica -Chave (Join-Path $RAIZ_BRAVE $politica) -Url $Origem
}

Write-Host ''
Write-Host 'Pronto. Abra brave://policy, clique em "Recarregar políticas" e recarregue o Checkout.'
Write-Host 'Em brave://policy, BraveShieldsDisabledForUrls tem que aparecer com status OK.'
Write-Host 'Se o Brave não reconhecer a política, desligue o Shields do site pelo ícone do leão.'
