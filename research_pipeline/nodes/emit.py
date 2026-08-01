"""Nó `emit` — `LicencaNormalizada[]` -> ranking + manifesto + arquivos em disco (§8, §9).

Ranking é Python puro, nunca pedido ao LLM (§8): `rank_municipios` conta toda licença por
município, discriminada por `licenciado_por`; `rank_consorcios` conta **só**
`licenciado_por == "consorcio"` — senão infla o consórcio com licenças que o próprio município
emitiu sozinho (a mesma regra, dita duas vezes no §8 porque é o erro óbvio de implementar ao
contrário).

**Decisão F** (§8, decisão 17): ordenação `(-total_licencas, fold(nome), id)`, posição `1,2,3…`
nunca repetida — dar a mesma posição a empatados e desempatar por nome são coisas incompatíveis, e
a escolha é posição única com o empate visível em `total_licencas`. `RankingConsorcio` não carrega
`nome` (§8 não o lista); o desempate ainda usa o `consorcio_nome` de alguma licença do grupo, só
não o persiste no registro final — quem fecha o desempate no JSON é o próprio `consorcio_id`.

`id` de cada licença já chegou pronto de `nodes/normalize.py` (patch 9, achado de escopo): o slug
é atribuído lá porque `validate_licencas` (patch 7) já exige unicidade antes deste nó existir.
Recalculá-lo aqui duplicaria a mesma função sem motivo — `emit.py` só lê `id`, nunca o gera.

`gerado_em` vem do `run_id`, nunca do relógio — mesmo padrão de `data_consulta` no patch 9: dois
runs com o mesmo `run_id` produzem o mesmo manifesto, byte a byte (AC6).

`manifest.json` guarda hoje só o que já existe para computar: parâmetros, versões, contagens e
avisos agregados. Custo e tempo de execução (§9) chegam com o nó de Deep Research real (patch
13/14); um `custo_estimado_usd: null` sem nó que o meça seria scaffolding sem uso.
"""

from __future__ import annotations

import collections
import json
import re
from pathlib import Path
from typing import Any, Sequence

from common.text import fold
from research_pipeline.refs import ReferenceData
from research_pipeline.schemas import (
    LicencaNormalizada,
    LicenciadoPor,
    Meta,
    Produto,
    RankingConsorcio,
    RankingMunicipio,
    TotaisLicenciadoPor,
)

__all__ = ["build_manifest", "emit", "rank_consorcios", "rank_municipios"]

_RUN_ID_TS_RE = re.compile(r"_(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})Z")

_ORDEM_LICENCIADO_POR: tuple[LicenciadoPor, ...] = ("municipio_proprio", "consorcio", "indeterminado")
"""Ordem de desempate de `modo_predominante`: `max()` devolve o primeiro máximo em empate, então
esta ordem é a prioridade quando duas categorias empatam na contagem de um município."""


def _gerado_em(run_id: str) -> str:
    """`"2025_20260801T143200Z"` -> `"2026-08-01T14:32:00Z"` — o mesmo `run_id` que gera
    `data_consulta` no patch 9 já traz a hora, não só a data."""
    achado = _RUN_ID_TS_RE.search(run_id)
    if achado is None:
        raise ValueError(f"run_id {run_id!r} não traz timestamp AAAAMMDDTHHMMSSZ reconhecível")
    ano, mes, dia, hora, minuto, segundo = achado.groups()
    return f"{ano}-{mes}-{dia}T{hora}:{minuto}:{segundo}Z"


def rank_municipios(licencas: Sequence[LicencaNormalizada]) -> list[RankingMunicipio]:
    """Conta toda licença com `municipio_id` resolvido, discriminada por `licenciado_por`. Linha
    com `municipio_id is None` fica de fora — não há o que ranquear sem id, e o aviso
    `municipio_nao_resolvido` já a sinalizou em `normalize.py`."""
    grupos: dict[str, dict[str, Any]] = {}
    for licenca in licencas:
        if licenca.municipio_id is None:
            continue
        grupo = grupos.setdefault(
            licenca.municipio_id,
            {
                "municipio_nome": licenca.municipio_nome,
                "consorcio_nome": None,
                "contagem": dict.fromkeys(_ORDEM_LICENCIADO_POR, 0),
            },
        )
        grupo["contagem"][licenca.licenciado_por] += 1
        if grupo["consorcio_nome"] is None and licenca.consorcio_nome is not None:
            grupo["consorcio_nome"] = licenca.consorcio_nome

    linhas = []
    for municipio_id, grupo in grupos.items():
        contagem = grupo["contagem"]
        total = sum(contagem.values())
        modo_predominante = max(_ORDEM_LICENCIADO_POR, key=lambda chave: contagem[chave])
        linhas.append((municipio_id, grupo["municipio_nome"], grupo["consorcio_nome"], total, contagem, modo_predominante))

    linhas.sort(key=lambda linha: (-linha[3], fold(linha[1]), linha[0]))
    return [
        RankingMunicipio(
            posicao=posicao,
            municipio_id=municipio_id,
            municipio_nome=municipio_nome,
            consorcio_nome=consorcio_nome,
            total_licencas=total,
            licencas_gestao_propria=contagem["municipio_proprio"],
            licencas_via_consorcio=contagem["consorcio"],
            licencas_indeterminado=contagem["indeterminado"],
            modo_predominante=modo_predominante,
        )
        for posicao, (municipio_id, municipio_nome, consorcio_nome, total, contagem, modo_predominante) in enumerate(
            linhas, start=1
        )
    ]


def rank_consorcios(licencas: Sequence[LicencaNormalizada]) -> list[RankingConsorcio]:
    """Conta **só** `licenciado_por == "consorcio"` (§8) — senão o consórcio fica inflado com
    licenças que o município emitiu por conta própria."""
    grupos: dict[str, dict[str, Any]] = {}
    for licenca in licencas:
        if licenca.licenciado_por != "consorcio" or licenca.consorcio_id is None:
            continue
        grupo = grupos.setdefault(
            licenca.consorcio_id, {"nome": licenca.consorcio_nome, "total": 0, "municipios": set()}
        )
        grupo["total"] += 1
        if grupo["nome"] is None and licenca.consorcio_nome is not None:
            grupo["nome"] = licenca.consorcio_nome
        if licenca.municipio_id is not None:
            grupo["municipios"].add(licenca.municipio_id)

    linhas = sorted(
        grupos.items(), key=lambda item: (-item[1]["total"], fold(item[1]["nome"] or ""), item[0])
    )
    return [
        RankingConsorcio(
            posicao=posicao,
            consorcio_id=consorcio_id,
            total_licencas=grupo["total"],
            municipios_atendidos=len(grupo["municipios"]),
        )
        for posicao, (consorcio_id, grupo) in enumerate(linhas, start=1)
    ]


def build_manifest(
    licencas: Sequence[LicencaNormalizada],
    avisos: Sequence[str],
    *,
    ano: int,
    run_id: str,
    prompt_version: str,
    modelo_pesquisa: str,
    modelo_estruturacao: str,
    refs_data_consulta: str,
) -> Meta:
    """O manifesto embutido no produto (§8). `avisos` chega cru (`"codigo:id[:detalhe]"`, um por
    ocorrência, o formato que `normalize.py`/`validate.py` já emitem) e sai agregado por código —
    **deduplicado mas contado**: perder a contagem esconderia se um problema é isolado ou
    sistêmico no run."""
    totais = collections.Counter(licenca.licenciado_por for licenca in licencas)
    por_codigo = collections.Counter(aviso.split(":", 1)[0] for aviso in avisos)
    avisos_agregados = [f"{codigo} em {conta} registro(s)" for codigo, conta in sorted(por_codigo.items())]

    return Meta(
        ano_referencia=ano,
        gerado_em=_gerado_em(run_id),
        prompt_version=prompt_version,
        modelo_pesquisa=modelo_pesquisa,
        modelo_estruturacao=modelo_estruturacao,
        run_id=run_id,
        refs_data_consulta=refs_data_consulta,
        total_licencas=len(licencas),
        total_por_licenciado_por=TotaisLicenciadoPor(
            municipio_proprio=totais.get("municipio_proprio", 0),
            consorcio=totais.get("consorcio", 0),
            indeterminado=totais.get("indeterminado", 0),
        ),
        municipios_com_licenca=len({l.municipio_id for l in licencas if l.municipio_id is not None}),
        avisos=avisos_agregados,
    )


def emit(state: dict[str, Any], config: dict[str, Any]) -> dict[str, Any]:
    """`(state, config) -> {"output_path": ..., "manifest_path": ...}`. Escreve
    `licencas_<ano>.json` (o `Produto` do §8) e `manifest.json` no diretório do run
    (`config["configurable"]["run_dir"]`, o mesmo padrão de `refs`/`structurer` — decisão 18)."""
    configurable = config["configurable"]
    refs: ReferenceData = configurable["refs"]
    run_dir = Path(configurable["run_dir"])
    modelo_pesquisa: str = configurable["modelo_pesquisa"]
    modelo_estruturacao: str = configurable["modelo_estruturacao"]

    ano = state["ano"]
    run_id = state["run_id"]
    avisos = state.get("avisos", [])
    licencas = [LicencaNormalizada.model_validate(bruta) for bruta in state["licencas_normalizadas"]]

    meta = build_manifest(
        licencas,
        avisos,
        ano=ano,
        run_id=run_id,
        prompt_version=state["prompt_version"],
        modelo_pesquisa=modelo_pesquisa,
        modelo_estruturacao=modelo_estruturacao,
        refs_data_consulta=refs.data_consulta,
    )
    produto = Produto(
        meta=meta,
        licencas=licencas,
        ranking_municipios=rank_municipios(licencas),
        ranking_consorcios=rank_consorcios(licencas),
    )

    run_dir.mkdir(parents=True, exist_ok=True)
    output_path = run_dir / f"licencas_{ano}.json"
    manifest_path = run_dir / "manifest.json"
    output_path.write_text(
        json.dumps(produto.model_dump(mode="json"), ensure_ascii=False, indent=2, sort_keys=True),
        encoding="utf-8",
    )
    manifest_path.write_text(
        json.dumps(meta.model_dump(mode="json"), ensure_ascii=False, indent=2, sort_keys=True),
        encoding="utf-8",
    )
    return {"output_path": str(output_path), "manifest_path": str(manifest_path)}
