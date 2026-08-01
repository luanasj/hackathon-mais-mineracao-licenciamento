"""Ranking e manifesto (patch 10) contra licenças sintéticas — sem fixture nem golden: ranking é
Python puro (§8), não há LLM neste nó para verificar contra semente.

`_licenca()` constrói um `LicencaNormalizada` mínimo válido, um campo trocado por vez — o mesmo
padrão de `_licenca()` em `test_validate.py`, sem herdar o exemplo do §8 porque aqui o interesse
é o comportamento do ranking, não a fidelidade de um caso real.
"""

from __future__ import annotations

import json
import random
from typing import Any

import pytest

from research_pipeline.nodes.emit import build_manifest, emit, rank_consorcios, rank_municipios
from research_pipeline.refs import ReferenceData, load_reference_data
from research_pipeline.schemas import LicencaNormalizada

_CONTADOR = iter(range(10_000))


def _licenca(**overrides: Any) -> LicencaNormalizada:
    n = next(_CONTADOR)
    base: dict[str, Any] = {
        "id": f"2025-sintetica-lau-{n:02d}",
        "municipio_id": "1",
        "municipio_nome": "Município Um",
        "municipio_raw": "Município Um",
        "municipio_match_metodo": "exato",
        "municipio_match_confianca": 1.0,
        "consorcio_id": None,
        "consorcio_nome": None,
        "consorcio_raw": None,
        "consorcio_match_metodo": "nenhum",
        "consorcio_match_confianca": 0.0,
        "licenciado_por": "municipio_proprio",
        "orgao_emissor_raw": None,
        "licenciado_por_evidencia": None,
        "licenciado_por_confianca": 0.9,
        "titular": None,
        "mineral": None,
        "substancia_raw": None,
        "tipologia_codigo": None,
        "tipologia_nome": None,
        "potencial_poluidor": None,
        "nivel_licenciamento": None,
        "modalidade": "LAU",
        "numero_licenca": f"{n:02d}/2025",
        "data_concessao": None,
        "fonte_urls": ["https://exemplo.invalid/x"],
        "trecho_citado": "trecho",
        "data_consulta": "2026-08-01",
        "verificado": False,
    }
    base.update(overrides)
    return LicencaNormalizada.model_validate(base)


@pytest.fixture(scope="module")
def refs() -> ReferenceData:
    return load_reference_data()


# --------------------------------------------------------------------------- rank_consorcios


def test_ranking_consorcios_ignora_municipio_proprio() -> None:
    """§8: `ranking_consorcios` conta só `licenciado_por == "consorcio"` — a licença que o
    município emitiu sozinho, mesmo com `consorcio_id` presente, não pode inflar o consórcio."""
    licencas = [
        _licenca(licenciado_por="consorcio", consorcio_id="C1", consorcio_nome="Consórcio Um"),
        _licenca(
            licenciado_por="municipio_proprio",
            municipio_id="2",
            consorcio_id="C1",
            consorcio_nome="Consórcio Um",
        ),
    ]
    ranking = rank_consorcios(licencas)
    assert len(ranking) == 1
    assert ranking[0].consorcio_id == "C1"
    assert ranking[0].total_licencas == 1
    assert ranking[0].municipios_atendidos == 1


def test_ranking_consorcios_conta_municipios_distintos() -> None:
    licencas = [
        _licenca(licenciado_por="consorcio", consorcio_id="C1", municipio_id="1"),
        _licenca(licenciado_por="consorcio", consorcio_id="C1", municipio_id="1"),
        _licenca(licenciado_por="consorcio", consorcio_id="C1", municipio_id="2"),
    ]
    ranking = rank_consorcios(licencas)
    assert ranking[0].total_licencas == 3
    assert ranking[0].municipios_atendidos == 2


# --------------------------------------------------------------------------- rank_municipios / decisão F


def test_empate_sai_posicao_unica_em_ordem_alfabetica_de_nome_dobrado() -> None:
    """Decisão 17/F: 3 municípios empatados em `total_licencas` recebem posições 1, 2, 3 — nunca
    repetidas — ordenadas por `fold(nome)`."""
    licencas = [
        _licenca(municipio_id="z", municipio_nome="Zeta"),
        _licenca(municipio_id="a", municipio_nome="Alfa"),
        _licenca(municipio_id="e", municipio_nome="Éden"),
    ]
    ranking = rank_municipios(licencas)
    assert [r.municipio_nome for r in ranking] == ["Alfa", "Éden", "Zeta"]
    assert [r.posicao for r in ranking] == [1, 2, 3]
    assert all(r.total_licencas == 1 for r in ranking)


def test_modo_predominante_e_o_de_maior_contagem() -> None:
    licencas = [
        _licenca(municipio_id="1", licenciado_por="consorcio", consorcio_id="C1"),
        _licenca(municipio_id="1", licenciado_por="consorcio", consorcio_id="C1"),
        _licenca(municipio_id="1", licenciado_por="municipio_proprio"),
    ]
    ranking = rank_municipios(licencas)
    assert ranking[0].modo_predominante == "consorcio"
    assert ranking[0].licencas_via_consorcio == 2
    assert ranking[0].licencas_gestao_propria == 1


def test_licenca_sem_municipio_id_fica_fora_do_ranking() -> None:
    licencas = [_licenca(municipio_id=None, municipio_match_metodo="nenhum")]
    assert rank_municipios(licencas) == []


# --------------------------------------------------------------------------- AC5/AC6: ordem de entrada não importa


def test_embaralhar_entrada_produz_json_identico() -> None:
    """AC5/AC6 como teste unitário: o ranking não pode depender da ordem em que as licenças
    chegam. 20 embaralhamentos, mesmo JSON byte a byte."""
    licencas = [
        _licenca(municipio_id="1", municipio_nome="Alfa", licenciado_por="consorcio", consorcio_id="C1"),
        _licenca(municipio_id="1", municipio_nome="Alfa", licenciado_por="municipio_proprio"),
        _licenca(municipio_id="2", municipio_nome="Beta", licenciado_por="indeterminado"),
        _licenca(municipio_id="3", municipio_nome="Gama", licenciado_por="consorcio", consorcio_id="C1"),
        _licenca(municipio_id="3", municipio_nome="Gama", licenciado_por="consorcio", consorcio_id="C2"),
    ]

    referencia = None
    rng = random.Random(42)
    for _ in range(20):
        embaralhada = list(licencas)
        rng.shuffle(embaralhada)
        municipios = [r.model_dump(mode="json") for r in rank_municipios(embaralhada)]
        consorcios = [r.model_dump(mode="json") for r in rank_consorcios(embaralhada)]
        atual = json.dumps([municipios, consorcios], sort_keys=True)
        if referencia is None:
            referencia = atual
        assert atual == referencia


# --------------------------------------------------------------------------- build_manifest


def test_build_manifest_agrega_avisos_por_codigo_com_contagem() -> None:
    meta = build_manifest(
        [_licenca()],
        avisos=[
            "consorcio_divergente:2025-x-lau-01:C1!=C2",
            "consorcio_divergente:2025-y-lau-01:C1!=C3",
            "municipio_nao_resolvido:2025-z-lau-01:Região X",
        ],
        ano=2025,
        run_id="2025_20260801T143200Z",
        prompt_version="deep_research_v1",
        modelo_pesquisa="deep-research-preview-04-2026",
        modelo_estruturacao="deepseek-v4-flash",
        refs_data_consulta="2026-08-01",
    )
    assert meta.avisos == [
        "consorcio_divergente em 2 registro(s)",
        "municipio_nao_resolvido em 1 registro(s)",
    ]


def test_build_manifest_gerado_em_vem_do_run_id() -> None:
    meta = build_manifest(
        [],
        [],
        ano=2025,
        run_id="2025_20260801T143200Z",
        prompt_version="deep_research_v1",
        modelo_pesquisa="m1",
        modelo_estruturacao="m2",
        refs_data_consulta="2026-08-01",
    )
    assert meta.gerado_em == "2026-08-01T14:32:00Z"
    assert meta.total_licencas == 0
    assert meta.municipios_com_licenca == 0


def test_build_manifest_totais_por_licenciado_por_tem_sempre_as_tres_chaves() -> None:
    meta = build_manifest(
        [_licenca(licenciado_por="consorcio", consorcio_id="C1")],
        [],
        ano=2025,
        run_id="2025_20260801T000000Z",
        prompt_version="deep_research_v1",
        modelo_pesquisa="m1",
        modelo_estruturacao="m2",
        refs_data_consulta="2026-08-01",
    )
    dump = meta.total_por_licenciado_por.model_dump()
    assert dump == {"municipio_proprio": 0, "consorcio": 1, "indeterminado": 0}


# --------------------------------------------------------------------------- emit(): integração


def test_emit_escreve_licencas_e_manifest(tmp_path: Any, refs: ReferenceData) -> None:
    state = {
        "ano": 2025,
        "run_id": "2025_20260801T143200Z",
        "prompt_version": "deep_research_v1",
        "licencas_normalizadas": [_licenca().model_dump(mode="json")],
        "avisos": [],
    }
    config = {
        "configurable": {
            "refs": refs,
            "run_dir": tmp_path,
            "modelo_pesquisa": "deep-research-preview-04-2026",
            "modelo_estruturacao": "deepseek-v4-flash",
        }
    }

    resultado = emit(state, config)

    output_path = tmp_path / "licencas_2025.json"
    manifest_path = tmp_path / "manifest.json"
    assert resultado == {"output_path": str(output_path), "manifest_path": str(manifest_path)}
    assert output_path.exists()
    assert manifest_path.exists()

    produto = json.loads(output_path.read_text(encoding="utf-8"))
    assert produto["meta"]["run_id"] == "2025_20260801T143200Z"
    assert produto["meta"]["refs_data_consulta"] == refs.data_consulta
    assert len(produto["licencas"]) == 1

    manifest = json.loads(manifest_path.read_text(encoding="utf-8"))
    assert manifest == produto["meta"]
