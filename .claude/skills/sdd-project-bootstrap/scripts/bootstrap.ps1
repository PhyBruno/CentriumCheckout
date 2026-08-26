[CmdletBinding()]
param(
    [string]$ProjectRoot = (Get-Location).Path,
    [switch]$SkipPlugins,
    [switch]$WhatIf
)

$ErrorActionPreference = "Stop"
$skillRoot = Split-Path -Parent $PSScriptRoot
$assets = Join-Path $skillRoot "assets"

function Write-Step($msg) { Write-Host "==> $msg" -ForegroundColor Cyan }
function Write-Skip($msg) { Write-Host "    (ja existe) $msg" -ForegroundColor DarkGray }
function Write-Done($msg) { Write-Host "    OK: $msg" -ForegroundColor Green }
function Write-Warn2($msg) { Write-Host "    ATENCAO: $msg" -ForegroundColor Yellow }

# 1. Estrutura .specs/ (padrao SDD)
Write-Step "Estrutura .specs/ (padrao SDD)"
$specsDirs = @("project", "codebase", "features", "quick")
foreach ($dir in $specsDirs) {
    $path = Join-Path $ProjectRoot ".specs\$dir"
    if (-not (Test-Path $path)) {
        if ($WhatIf) {
            Write-Host "    [WhatIf] criaria $path"
        }
        else {
            New-Item -ItemType Directory -Path $path -Force | Out-Null
            $gitkeep = Join-Path $path ".gitkeep"
            New-Item -ItemType File -Path $gitkeep -Force | Out-Null
            Write-Done ".specs\$dir\.gitkeep"
        }
    }
    else {
        Write-Skip ".specs\$dir"
    }
}

# 2. rules.md
Write-Step "rules.md (regras de processo: git workflow, gates)"
$rulesPath = Join-Path $ProjectRoot "rules.md"
if (-not (Test-Path $rulesPath)) {
    if ($WhatIf) {
        Write-Host "    [WhatIf] criaria rules.md a partir do template"
    }
    else {
        $projectName = Split-Path $ProjectRoot -Leaf
        $repoDirName = $projectName
        $template = Get-Content (Join-Path $assets "rules.md.template") -Raw -Encoding UTF8
        $template = $template.Replace("{{PROJECT_NAME}}", $projectName).Replace("{{REPO_DIR_NAME}}", $repoDirName)
        Set-Content -Path $rulesPath -Value $template -Encoding utf8
        Write-Done "rules.md criado a partir do template — revisar placeholders {{...}} restantes"
    }
}
else {
    Write-Skip "rules.md"
}

# 3. CLAUDE.md - cria minimo se nao existir, injeta secoes ausentes (idempotente)
Write-Step "CLAUDE.md (secoes de processo)"
$claudePath = Join-Path $ProjectRoot "CLAUDE.md"
if (-not (Test-Path $claudePath)) {
    if ($WhatIf) {
        Write-Host "    [WhatIf] criaria CLAUDE.md minimo"
    }
    else {
        $projectName = Split-Path $ProjectRoot -Leaf
        $minimalLines = @(
            "# $projectName",
            "",
            "## Project Context",
            "",
            "TODO: descrever o projeto (uma frase de contexto de negocio, stack principal, estado atual).",
            "",
            "**Regras de processo (git workflow, gates obrigatorios):** ver ``rules.md`` na raiz do repo.",
            ""
        )
        Set-Content -Path $claudePath -Value ($minimalLines -join "`n") -Encoding utf8
        Write-Done "CLAUDE.md minimo criado"
    }
}

$claudeContent = ""
if (Test-Path $claudePath) {
    $claudeContent = Get-Content $claudePath -Raw -Encoding UTF8
}

$sectionMap = [ordered]@{
    "## Spec-Driven Development (Obrigatório)" = "spec-driven-section.md"
    "# Pre-Production Security Requirements"   = "security-section.md"
    "## Agent skills"                          = "agent-skills-section.md"
}

foreach ($marker in $sectionMap.Keys) {
    $alreadyPresent = $claudeContent -and ($claudeContent.Contains($marker))
    if (-not $alreadyPresent) {
        if ($WhatIf) {
            Write-Host "    [WhatIf] adicionaria secao '$marker'"
        }
        else {
            $fragment = Get-Content (Join-Path $assets $sectionMap[$marker]) -Raw -Encoding UTF8
            Add-Content -Path $claudePath -Value ("`n" + $fragment) -Encoding utf8
            $claudeContent = Get-Content $claudePath -Raw -Encoding UTF8
            Write-Done "secao '$marker' adicionada"
        }
    }
    else {
        Write-Skip "secao '$marker' (ja presente)"
    }
}

# 4. docs/agents/fluxo-ia.md
Write-Step "docs/agents/fluxo-ia.md (fluxo padrao de desenvolvimento com IA)"
$fluxoPath = Join-Path $ProjectRoot "docs\agents\fluxo-ia.md"
if (-not (Test-Path $fluxoPath)) {
    if ($WhatIf) {
        Write-Host "    [WhatIf] copiaria fluxo-ia.md"
    }
    else {
        $fluxoDir = Split-Path $fluxoPath
        New-Item -ItemType Directory -Path $fluxoDir -Force | Out-Null
        Copy-Item (Join-Path $assets "fluxo-ia.md") $fluxoPath
        Write-Done "docs/agents/fluxo-ia.md copiado — revisar secao 'Reaproveitamento' para este projeto"
    }
}
else {
    Write-Skip "docs\agents\fluxo-ia.md"
}

# 5. Plugins obrigatorios (escopo user)
if (-not $SkipPlugins) {
    Write-Step "Plugins obrigatorios (escopo user)"

    $required = @(
        [pscustomobject]@{ Id = "engram@engram"; Marketplace = "github:Gentleman-Programming/engram" },
        [pscustomobject]@{ Id = "context7@claude-plugins-official"; Marketplace = $null },
        [pscustomobject]@{ Id = "typescript-lsp@claude-plugins-official"; Marketplace = $null },
        [pscustomobject]@{ Id = "ecc@ecc"; Marketplace = "https://github.com/affaan-m/everything-claude-code.git" },
        [pscustomobject]@{ Id = "superpowers@claude-plugins-official"; Marketplace = $null },
        [pscustomobject]@{ Id = "mattpocock-skills@claude-plugins-official"; Marketplace = $null },
        [pscustomobject]@{ Id = "ui-ux-pro-max@ui-ux-pro-max-skill"; Marketplace = "https://github.com/nextlevelbuilder/ui-ux-pro-max-skill.git" }
    )

    $installedIds = @()
    $enabledIds = @()
    try {
        $listJson = & claude plugin list --json 2>$null
        if ($listJson) {
            $parsed = $listJson | ConvertFrom-Json
            $installedIds = @($parsed | ForEach-Object { $_.id })
            $enabledIds = @($parsed | Where-Object { $_.enabled } | ForEach-Object { $_.id })
        }
    }
    catch {
        Write-Warn2 "nao foi possivel rodar 'claude plugin list --json' — pulando checagem de plugins"
    }

    foreach ($plugin in $required) {
        $id = $plugin.Id
        if ($enabledIds -contains $id) {
            Write-Skip $id
            continue
        }
        if ($WhatIf) {
            Write-Host "    [WhatIf] instalaria/habilitaria $id"
            continue
        }
        if ($installedIds -contains $id) {
            & claude plugin enable $id | Out-Null
            Write-Done "habilitado $id"
            continue
        }
        if ($plugin.Marketplace) {
            & claude plugin marketplace add $plugin.Marketplace 2>$null | Out-Null
        }
        & claude plugin install $id -y --scope user
        Write-Done "instalado $id"
    }
}
else {
    Write-Step "Plugins obrigatorios: pulado (-SkipPlugins)"
}

# 6. Skills fora do marketplace oficial (nao ha CLI de instalacao confirmada - so verificacao)
Write-Step "Skills fora do marketplace (verificacao manual)"
$tlcPath = Join-Path $HOME ".claude\skills\tlc-spec-driven"
if (-not (Test-Path $tlcPath)) {
    Write-Warn2 "tlc-spec-driven nao encontrada em ~/.claude/skills/ - instalar manualmente a partir de https://skills.rest/skill/tlc-spec-driven"
}
else {
    Write-Skip "tlc-spec-driven"
}
$owaspPath = Join-Path $HOME ".claude\commands\owasp-security"
if (-not (Test-Path $owaspPath)) {
    Write-Warn2 "owasp-security nao encontrada em ~/.claude/commands/ - verificar instalacao manual (skill obrigatoria antes de deploy em producao)"
}
else {
    Write-Skip "owasp-security"
}

Write-Host ""
Write-Host "Bootstrap concluido. Revisar placeholders {{...}} em CLAUDE.md/rules.md e ajustar ao projeto." -ForegroundColor Cyan
