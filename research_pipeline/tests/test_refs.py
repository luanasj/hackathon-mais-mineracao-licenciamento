"""O critério de aceite 8, medido: as referências carregam e as invariantes valem.

Três blocos, com propósitos diferentes:

1. **Positivos** — travam os números do snapshot atual. Se o coletor rodar de novo e a Bahia
   ganhar um município, estes testes quebram, que é o comportamento certo: o número muda em
   `ref_mapping.yaml` de propósito, não por acidente.
2. **Negativos** — copiam os dois JSONs para `tmp_path`, corrompem **um** campo por vez e exigem
   `RefLoadError`. Sem eles um `_check_invariants` que só faz `pass` passaria nos positivos.
3. **Cruzamento com o IBGE** — a conferência que o patch 2 mediu e adiou por não existir
   `load_reference_data`. Fecha o laço `common/` ↔ `research_pipeline/`.
"""

from __future__ import annotations

import collections
import dataclasses
import json
from pathlib import Path
from typing import Any, Callable

import pytest

from common.dbf import read_dbf
from common.text import fold
from research_pipeline import REPO_ROOT
from research_pipeline.refs import (
    Municipio,
    RefLoadError,
    ReferenceData,
    _coerce_nivel,
    load_reference_data,
)

DBF_IBGE = REPO_ROOT / "data_source" / "Malha municipal IBGE-BA" / "BA_Municipios_2025.dbf"
ORIGEM_MUNICIPIOS = REPO_ROOT / "data" / "processed" / "municipios_habilitados.json"
ORIGEM_CONSORCIOS = REPO_ROOT / "data" / "processed" / "consorcios.json"


@pytest.fixture(scope="module")
def refs() -> ReferenceData:
    return load_reference_data()


# --------------------------------------------------------------------------- positivos


def test_ac8_contagens(refs: ReferenceData) -> None:
    """417 / 29 / 386 — os três números do bloco `invariantes:` do mapeamento."""
    assert len(refs.municipios) == 417
    assert len(refs.consorcios) == 29
    assert sum(c.total_municipios for c in refs.consorcios.values()) == 386


def test_habilitacao_e_apto_licenciar(refs: ReferenceData) -> None:
    """`apto_licenciar` é derivado de `status`, nunca do nome do arquivo (§7)."""
    aptos = [m for m in refs.municipios.values() if m.apto_licenciar]
    assert len(aptos) == 367
    assert len(refs.municipios) - len(aptos) == 50
    assert all(m.apto_licenciar == (m.status == "habilitado") for m in refs.municipios.values())
    assert all(
        m.apto_licenciar == (m.situacao_gac == "CAPAZ") for m in refs.municipios.values()
    )


def test_histograma_de_nivel(refs: ReferenceData) -> None:
    """Coerção `"3"` -> `3` aplicada, e nível nulo exatamente nos 50 não habilitados."""
    histograma = collections.Counter(m.nivel_habilitacao for m in refs.municipios.values())
    assert dict(histograma) == {3: 333, 2: 28, 1: 6, None: 50}


def test_vinculo_com_consorcio(refs: ReferenceData) -> None:
    """A população `municipio_proprio` pura do §7.1: 27 habilitados sem consórcio."""
    sem = [m for m in refs.municipios.values() if m.consorcio_id is None]
    assert len(sem) == 31
    assert sum(1 for m in sem if m.apto_licenciar) == 27
    assert len(refs.municipios) - len(sem) == 386


def test_membros_sao_1_para_1(refs: ReferenceData) -> None:
    """O §7.1 afirma vínculo 1:1 — nenhum município em dois consórcios."""
    membros = [codigo for c in refs.consorcios.values() for codigo in c.membros]
    assert len(membros) == 386
    assert len(set(membros)) == 386
    assert set(membros) <= set(refs.municipios)


def test_procedencia(refs: ReferenceData) -> None:
    """`data_consulta` e `fonte_urls` alimentam `meta.refs_data_consulta` no manifesto (§11)."""
    assert refs.data_consulta == "2026-08-01"
    assert refs.fonte_urls == ("https://gestor.meioambiente.ba.gov.br/Consultas/ConsultaGAC/",)


def test_vocabularios_entram_no_mesmo_carregamento(refs: ReferenceData) -> None:
    """O AC8 cobre o vocabulário também: XLSX e DBF carregam junto, não sob demanda.

    Substitui o `test_vocabularios_vazios_ate_o_patch_4` do patch 3, que existia para travar o
    contrato *deste* patch e era para morrer aqui. O detalhe de cada carregador está em
    `test_vocab.py`; o que se afirma aqui é só que `load_reference_data` os liga.
    """
    assert len(refs.tipologias) == 17
    assert len(refs.minerais) == 169
    assert len(refs.indice_substancias) == 128
    assert len(refs.indice_minerais) == 169
    assert refs.avisos == (
        "tipologia_porte_ausente:B4.2:porte_pequeno",
        "tipologia_porte_ausente:B4.2:porte_medio",
    )


def test_mapeamento_e_projecao_nao_esquema(refs: ReferenceData) -> None:
    """`data_publicacao` existe nos 417 e não está mapeado: não vira campo e não quebra a carga.

    O inverso do `extra="forbid"` dos schemas do patch 7. A fonte é de terceiro — ganhar coluna
    não pode derrubar o carregador.
    """
    bruto = json.loads(ORIGEM_MUNICIPIOS.read_text(encoding="utf-8"))["municipios"]
    assert all("data_publicacao" in registro for registro in bruto.values())
    nomes = {campo.name for campo in dataclasses.fields(Municipio)}
    assert "data_publicacao" not in nomes


def test_campo_de_origem_novo_nao_quebra(tmp_path: Path) -> None:
    """Continuação do anterior, pelo lado ativo: um campo inédito na fonte é ignorado."""

    def mutar(municipios: dict, _consorcios: dict) -> None:
        for registro in municipios["municipios"].values():
            registro["campo_que_nao_existia"] = "x"

    refs = load_reference_data(root=_raiz_corrompida(tmp_path, mutar))
    assert len(refs.municipios) == 417


# --------------------------------------------------------------------------- negativos


def _raiz_corrompida(tmp_path: Path, mutacao: Callable[[dict, dict], None]) -> Path:
    """Copia os dois JSONs para `tmp_path`, aplica `mutacao` e devolve a raiz resultante.

    O mapeamento continua sendo o real — só a raiz de resolução dos `path:` muda. Assim o teste
    exercita exatamente o carregador de produção, não uma configuração paralela.

    `data_source/` entra por symlink porque desde o patch 4 `load_reference_data` também carrega o
    XLSX e o `BA.dbf` — 13 MB que não faz sentido copiar 16 vezes para corromper um campo de JSON.
    """
    (tmp_path / "data_source").symlink_to(REPO_ROOT / "data_source")
    destino = tmp_path / "data" / "processed"
    destino.mkdir(parents=True)
    municipios = json.loads(ORIGEM_MUNICIPIOS.read_text(encoding="utf-8"))
    consorcios = json.loads(ORIGEM_CONSORCIOS.read_text(encoding="utf-8"))
    mutacao(municipios, consorcios)
    (destino / ORIGEM_MUNICIPIOS.name).write_text(
        json.dumps(municipios, ensure_ascii=False), encoding="utf-8"
    )
    (destino / ORIGEM_CONSORCIOS.name).write_text(
        json.dumps(consorcios, ensure_ascii=False), encoding="utf-8"
    )
    return tmp_path


def _primeiro(registros: dict[str, Any], **filtros: Any) -> dict[str, Any]:
    for registro in registros.values():
        if all(registro[campo] == valor for campo, valor in filtros.items()):
            return registro
    raise AssertionError(f"nenhum registro com {filtros} — a premissa do teste mudou")


def _remover_municipio_sem_consorcio(municipios: dict, _consorcios: dict) -> None:
    alvo = _primeiro(municipios["municipios"], consorcio_id=None)
    del municipios["municipios"][alvo["codigo_ibge"]]


def _nivel_invalido(municipios: dict, _consorcios: dict) -> None:
    _primeiro(municipios["municipios"], status="habilitado")["nivel"] = "4"


def _nivel_inteiro(municipios: dict, _consorcios: dict) -> None:
    _primeiro(municipios["municipios"], status="habilitado")["nivel"] = 3


def _nivel_nulo_em_habilitado(municipios: dict, _consorcios: dict) -> None:
    _primeiro(municipios["municipios"], status="habilitado")["nivel"] = None


def _situacao_gac_discordante(municipios: dict, _consorcios: dict) -> None:
    _primeiro(municipios["municipios"], status="nao_habilitado")["situacao_gac"] = "CAPAZ"


def _campo_mapeado_ausente(municipios: dict, _consorcios: dict) -> None:
    del _primeiro(municipios["municipios"], status="habilitado")["municipio"]


def _chave_diferente_do_id(municipios: dict, _consorcios: dict) -> None:
    registros = municipios["municipios"]
    codigo = next(iter(registros))
    registros["9" + codigo[1:]] = registros.pop(codigo)


def _consorcio_id_inexistente(municipios: dict, _consorcios: dict) -> None:
    alvo = next(r for r in municipios["municipios"].values() if r["consorcio_id"] is not None)
    alvo["consorcio_id"] = "99999"


def _consorcio_nome_divergente(municipios: dict, _consorcios: dict) -> None:
    alvo = next(r for r in municipios["municipios"].values() if r["consorcio_nome"] is not None)
    alvo["consorcio_nome"] = "CONSORCIO QUE NAO EXISTE"


def _data_consulta_divergente_nos_municipios(municipios: dict, _consorcios: dict) -> None:
    next(iter(municipios["municipios"].values()))["data_consulta"] = "2020-01-01"


def _data_consulta_divergente_entre_arquivos(_municipios: dict, consorcios: dict) -> None:
    consorcios["data_consulta"] = "2020-01-01"


def _total_municipios_inflado(_municipios: dict, consorcios: dict) -> None:
    next(iter(consorcios["consorcios"].values()))["total_municipios"] += 1


def _membro_em_dois_consorcios(_municipios: dict, consorcios: dict) -> None:
    primeiro, segundo = list(consorcios["consorcios"].values())[:2]
    segundo["municipios"].append(primeiro["municipios"][0])
    segundo["total_municipios"] += 1


def _membro_com_nome_divergente(_municipios: dict, consorcios: dict) -> None:
    next(iter(consorcios["consorcios"].values()))["municipios"][0]["municipio"] = "Outro Nome"


def _membro_sem_codigo_ibge(_municipios: dict, consorcios: dict) -> None:
    del next(iter(consorcios["consorcios"].values()))["municipios"][0]["codigo_ibge"]


CORRUPCOES = [
    (_remover_municipio_sem_consorcio, "municípios: 416"),
    (_nivel_invalido, "nivel '4' fora de"),
    (_nivel_inteiro, "nivel 3 fora de"),
    (_nivel_nulo_em_habilitado, "nivel é nulo exatamente nos não habilitados"),
    (_situacao_gac_discordante, "discorda de status"),
    (_campo_mapeado_ausente, "não tem o campo mapeado 'municipio'"),
    (_chave_diferente_do_id, "chave do container"),
    (_consorcio_id_inexistente, "não está entre os 29 consórcios"),
    (_consorcio_nome_divergente, "consorcio_nome"),
    (_data_consulta_divergente_nos_municipios, "divergente entre os municípios"),
    (_data_consulta_divergente_entre_arquivos, "vieram de coletas diferentes"),
    (_total_municipios_inflado, "total_municipios"),
    (_membro_em_dois_consorcios, "em mais de um consórcio"),
    (_membro_com_nome_divergente, "nome 'Outro Nome'"),
    (_membro_sem_codigo_ibge, "não tem o campo mapeado 'codigo_ibge'"),
]


@pytest.mark.parametrize(
    "mutacao,esperado", CORRUPCOES, ids=[m.__name__.lstrip("_") for m, _ in CORRUPCOES]
)
def test_corrupcao_falha_alto(
    tmp_path: Path, mutacao: Callable[[dict, dict], None], esperado: str
) -> None:
    """Uma corrupção por vez, cada uma com a mensagem que nomeia o defeito.

    Casar a mensagem, e não só o tipo, é o que impede que a invariante certa passe a ser pega
    por acidente pela invariante errada depois de um refactor.
    """
    raiz = _raiz_corrompida(tmp_path, mutacao)
    with pytest.raises(RefLoadError) as capturado:
        load_reference_data(root=raiz)
    assert esperado in str(capturado.value)


@pytest.mark.parametrize("valor", ["4", "03", "", " 3", 3, 0, True, None, ["3"]])
def test_coerce_nivel_rejeita_tudo_que_nao_e_a_forma_da_fonte(valor: Any) -> None:
    """A fonte usa `"1"|"2"|"3"|null`. Aceitar `3` ou `"03"` esconderia o coletor mudar de forma.

    `None` está na lista porque só é válido em não habilitado — a checagem cruzada com `status`
    é da invariante, não da coerção, e é por isso que aqui ele também passa reto.
    """
    if valor is None:
        assert _coerce_nivel(valor, "x") is None
        return
    with pytest.raises(RefLoadError, match="fora de"):
        _coerce_nivel(valor, "x")


def test_arquivo_ausente(tmp_path: Path) -> None:
    with pytest.raises(RefLoadError, match="arquivo de referência ausente"):
        load_reference_data(root=tmp_path)


def test_mapeamento_ausente(tmp_path: Path) -> None:
    with pytest.raises(RefLoadError, match="mapeamento ausente"):
        load_reference_data(mapping_path=tmp_path / "nao_existe.yaml")


# --------------------------------------------------------------------- cruzamento IBGE


@pytest.fixture(scope="module")
def ibge() -> dict[str, str]:
    return {r["CD_MUN"]: r["NM_MUN"] for r in read_dbf(DBF_IBGE)}


def test_codigos_ibge_batem_com_a_malha(refs: ReferenceData, ibge: dict[str, str]) -> None:
    """A conferência que o §7 chama de opcional, feita: os dois conjuntos são o mesmo."""
    assert set(refs.municipios) == set(ibge)


def test_nomes_gac_batem_com_os_do_ibge(refs: ReferenceData, ibge: dict[str, str]) -> None:
    """Medido no patch 2 e adiado para cá: **0** divergências, cruas e dobradas.

    Consequência que o `GOAL.md` §7.2 registra ao contrário: o GAC **não** escreve
    `Santa Teresinha`. Escreve `Santa Terezinha`, com z, igual ao IBGE. O `ALIASES` de
    `scripts/lib/municipios_ba.py:67` não corrige divergência entre as duas fontes — é alias
    para a grafia com s que aparece em texto de terceiro, e é por esse motivo que o patch 5
    precisa mantê-lo.
    """
    cruas = {c: (m.nome, ibge[c]) for c, m in refs.municipios.items() if m.nome != ibge[c]}
    assert cruas == {}
    dobradas = {
        c: (m.nome, ibge[c]) for c, m in refs.municipios.items() if fold(m.nome) != fold(ibge[c])
    }
    assert dobradas == {}
    assert refs.municipios["2928505"].nome == "Santa Terezinha"


def test_nomes_dobrados_nao_colidem(refs: ReferenceData) -> None:
    """Premissa do match exato do patch 6, agora afirmada sobre o objeto que ele vai consumir."""
    dobrados = [fold(m.nome) for m in refs.municipios.values()]
    assert len(set(dobrados)) == 417
    dobrados_consorcio = [fold(c.nome) for c in refs.consorcios.values()]
    assert len(set(dobrados_consorcio)) == 29
