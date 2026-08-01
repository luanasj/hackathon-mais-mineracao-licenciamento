"""Testa `llm.py` (patch 8) — mecânica de `FixtureStructurer`, sem tocar as fixtures reais do
`extract`. Cada teste escreve seu próprio JSON em `tmp_path`, para que a suíte não dependa do
conteúdo de `tests/fixtures/llm_responses/` e continue passando se ele mudar.
"""

from __future__ import annotations

import hashlib
import json
from pathlib import Path

import pytest

from research_pipeline.llm import FixtureMissing, FixtureStructurer, get_structurer

# --------------------------------------------------------------------------- FixtureStructurer


def _escrever(diretorio: Path, nome: str, corpo: dict) -> Path:
    caminho = diretorio / nome
    caminho.write_text(json.dumps(corpo), encoding="utf-8")
    return caminho


def test_le_fixture_por_tag(tmp_path: Path) -> None:
    _escrever(tmp_path, "extract.json", {"licencas": []})
    estruturador = FixtureStructurer(fixtures_dir=tmp_path)

    resposta = estruturador.complete_json(system="sys", user="user", tag="extract")

    assert resposta == {"licencas": []}


def test_le_fixture_por_tag_e_case(tmp_path: Path) -> None:
    _escrever(tmp_path, "normalize__ambiguo.json", {"licencas": ["x"]})
    estruturador = FixtureStructurer(fixtures_dir=tmp_path)

    resposta = estruturador.complete_json(
        system="sys", user="user", tag="normalize", case="ambiguo"
    )

    assert resposta == {"licencas": ["x"]}


def test_case_none_nao_usa_arquivo_com_sufixo(tmp_path: Path) -> None:
    _escrever(tmp_path, "extract.json", {"licencas": []})
    _escrever(tmp_path, "extract__outro.json", {"licencas": ["nao deveria vir"]})
    estruturador = FixtureStructurer(fixtures_dir=tmp_path)

    resposta = estruturador.complete_json(system="sys", user="user", tag="extract")

    assert resposta == {"licencas": []}


def test_fixture_ausente_nomeia_caminho(tmp_path: Path) -> None:
    estruturador = FixtureStructurer(fixtures_dir=tmp_path)

    with pytest.raises(FixtureMissing) as excinfo:
        estruturador.complete_json(system="sys", user="user", tag="nao_existe")

    assert str(tmp_path / "nao_existe.json") in str(excinfo.value)


def test_meta_e_removido_da_resposta(tmp_path: Path) -> None:
    _escrever(tmp_path, "extract.json", {"licencas": [], "_meta": {"prompt_sha": "qualquer"}})
    estruturador = FixtureStructurer(fixtures_dir=tmp_path)

    resposta = estruturador.complete_json(system="sys", user="user", tag="extract")

    assert "_meta" not in resposta


def test_prompt_sha_correto_nao_loga(
    tmp_path: Path, caplog: pytest.LogCaptureFixture
) -> None:
    sha = hashlib.sha256(b"sys\nuser").hexdigest()
    _escrever(tmp_path, "extract.json", {"licencas": [], "_meta": {"prompt_sha": sha}})
    estruturador = FixtureStructurer(fixtures_dir=tmp_path)

    with caplog.at_level("WARNING"):
        estruturador.complete_json(system="sys", user="user", tag="extract")

    assert caplog.records == []


def test_prompt_sha_divergente_loga_mas_nao_levanta(
    tmp_path: Path, caplog: pytest.LogCaptureFixture
) -> None:
    _escrever(tmp_path, "extract.json", {"licencas": [], "_meta": {"prompt_sha": "sha_antigo"}})
    estruturador = FixtureStructurer(fixtures_dir=tmp_path)

    with caplog.at_level("WARNING"):
        resposta = estruturador.complete_json(system="sys", user="user diferente", tag="extract")

    assert resposta == {"licencas": []}
    assert len(caplog.records) == 1
    assert "sha_antigo" in caplog.records[0].message


# --------------------------------------------------------------------------- get_structurer


def test_get_structurer_fixture() -> None:
    assert isinstance(get_structurer("fixture"), FixtureStructurer)


def test_get_structurer_deepseek_nao_implementado() -> None:
    with pytest.raises(NotImplementedError, match="patch 13"):
        get_structurer("deepseek")


def test_get_structurer_desconhecido() -> None:
    with pytest.raises(ValueError, match="bogus"):
        get_structurer("bogus")
