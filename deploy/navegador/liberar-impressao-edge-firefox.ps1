<#
.SYNOPSIS
  Libera, no Edge e no Firefox, a impressão local do Centrium Checkout.

.DESCRIPTION
  O Checkout roda em https e imprime mandando o XML da nota para um serviço
  http na própria máquina do PDV (padrão 127.0.0.1:4545).

  EDGE - é Chromium e usa as mesmas duas políticas do Chrome, na chave dele:

    LocalNetworkAccessAllowedForUrls  - acesso à rede local
    InsecureContentAllowedForUrls     - chamada http a partir de página https

  O script só acrescenta a origem; nunca apaga o que já estava liberado.

  FIREFOX - não tem política por site equivalente a nenhuma das duas.
    * Com o serviço em 127.0.0.1 ou localhost (o padrão), não há o que
      configurar: o Firefox trata esses endereços como seguros.
    * Com o serviço em outro IP ou nome de máquina, a única saída por política
      é desligar o bloqueio de conteúdo misto ativo PARA TODOS OS SITES. Isso
      enfraquece o navegador inteiro, por isso só acontece com
      -FirefoxPermitirConteudoMisto, e só faz sentido num PDV dedicado.
    * A permissão de acesso à rede local, nas versões que a pedem, é concedida
      pelo operador no aviso do próprio Firefox - não há política por site.

  Precisa de PowerShell como administrador. Depois de rodar, feche e abra o
  navegador (ou recarregue as políticas em edge://policy / about:policies).

.PARAMETER Origem
  Endereço do Checkout, sem barra no final.

.PARAMETER Navegador
  Edge, Firefox ou Ambos (padrão).

.PARAMETER FirefoxPermitirConteudoMisto
  Desliga, no Firefox inteiro, o bloqueio de conteúdo misto ativo. Use apenas
  quando o serviço de impressão não estiver em 127.0.0.1/localhost.

.EXAMPLE
  .\liberar-impressao-edge-firefox.ps1

.EXAMPLE
  .\liberar-impressao-edge-firefox.ps1 -Navegador Edge -WhatIf

.EXAMPLE
  .\liberar-impressao-edge-firefox.ps1 -Navegador Firefox -FirefoxPermitirConteudoMisto
#>
[CmdletBinding(SupportsShouldProcess)]
param(
  [ValidatePattern('^https://[^/\s]+$')]
  [string]$Origem = 'https://checkout.centrium.inf.br',

  [ValidateSet('Edge', 'Firefox', 'Ambos')]
  [string]$Navegador = 'Ambos',

  [switch]$FirefoxPermitirConteudoMisto
)

$ErrorActionPreference = 'Stop'

$RAIZ_EDGE = 'HKLM:\SOFTWARE\Policies\Microsoft\Edge'
$RAIZ_FIREFOX = 'HKLM:\SOFTWARE\Policies\Mozilla\Firefox'
$POLITICAS_EDGE = 'LocalNetworkAccessAllowedForUrls', 'InsecureContentAllowedForUrls'
$PREF_CONTEUDO_MISTO = 'security.mixed_content.block_active_content'

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

# A política "Preferences" do Firefox é um único valor de texto com um JSON;
# as preferências que já estiverem lá são mantidas.
function Set-PreferenciaFirefox {
  param([string]$Nome, [bool]$Valor)

  $preferencias = [ordered]@{}
  if (Test-Path $RAIZ_FIREFOX) {
    $atual = (Get-Item $RAIZ_FIREFOX).GetValue('Preferences')
    if ($atual) {
      $lido = "$atual" | ConvertFrom-Json
      foreach ($p in $lido.PSObject.Properties) { $preferencias[$p.Name] = $p.Value }
    }
  }
  $preferencias[$Nome] = [ordered]@{ Value = $Valor; Status = 'locked' }
  $json = $preferencias | ConvertTo-Json -Depth 5 -Compress

  if ($PSCmdlet.ShouldProcess("$RAIZ_FIREFOX\Preferences", "Gravar $Nome = $Valor")) {
    if (-not (Test-Path $RAIZ_FIREFOX)) { New-Item -Path $RAIZ_FIREFOX -Force | Out-Null }
    New-ItemProperty -Path $RAIZ_FIREFOX -Name 'Preferences' -Value $json -PropertyType String -Force | Out-Null
    Write-Host "  gravado:     $Nome = $Valor (vale para todos os sites)"
  }
}

if (-not $WhatIfPreference -and -not (Test-Administrador)) {
  throw 'Abra o PowerShell como administrador: as políticas ficam em HKLM.'
}

if ($Navegador -in 'Edge', 'Ambos') {
  Write-Host "Edge - liberando $Origem"
  foreach ($politica in $POLITICAS_EDGE) {
    Add-UrlNaPolitica -Chave (Join-Path $RAIZ_EDGE $politica) -Url $Origem
  }
  Write-Host '  Abra edge://policy, clique em "Recarregar políticas" e recarregue o Checkout.'
  Write-Host ''
}

if ($Navegador -in 'Firefox', 'Ambos') {
  Write-Host 'Firefox'
  if ($FirefoxPermitirConteudoMisto) {
    Set-PreferenciaFirefox -Nome $PREF_CONTEUDO_MISTO -Valor $false
    Write-Host '  Feche e abra o Firefox; confira em about:policies.'
  }
  else {
    Write-Host '  Nada a gravar: com o serviço de impressão em 127.0.0.1/localhost o Firefox já permite.'
    Write-Host '  Se o serviço estiver em outro endereço, rode de novo com -FirefoxPermitirConteudoMisto.'
  }
  Write-Host '  Se o Firefox pedir permissão de acesso à rede local, o operador precisa aceitar no aviso.'
}
