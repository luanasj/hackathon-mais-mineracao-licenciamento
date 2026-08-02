"""Os schemas do §8 e o validador duro, medidos contra as referências reais.

A fixture não é inventada: é o bloco `"licencas"[0]` do §8 do `GOAL.md`, **copiado**. Conferido que
ele fecha com os dados reais — `2907558` é Caturama, o consórcio cadastral dela é o `14618`, `B3.1`
existe com aquele nome e potencial `M`, e `"AREIA"` está entre os 169 `SUBS`. Se o schema divergir
do documento, `test_exemplo_do_goal_8_...` quebra, e é para quebrar: o §8 é o contrato.

Três blocos: positivos (o exemplo e o envelope inteiro), regras duras (uma por linha da tabela do
patch 7, cada uma casando a **mensagem**) e regras moles (uma por aviso, com ids reais). Mais os
dois casos "não pode rejeitar" do §6.4 e da decisão 16, que existem porque a leitura apressada do
AC3 rejeitaria os dois.
"""

from __future__ import annotations

import copy
from typing import Any

import pytest

from research_pipeline.matcher import load_matching_config
from research_pipeline.nodes.validate import NIVEL_UNIFORME_MINIMO, validate_licencas
from research_pipeline.refs import ReferenceData, load_reference_data
from research_pipeline.schemas import LicencaNormalizada, Produto

# --------------------------------------------------------------------------- fixtures

# Copiado do §8 do GOAL.md. Não parafrasear: é o contrato.
LICENCA_GOAL_8: dict[str, Any] = {
    "id": "2025-caturama-lau-01",
    "municipio_id": "2907558",
    "municipio_nome": "Caturama",
    "municipio_raw": "Caturama",
    "municipio_match_metodo": "exato",
    "municipio_match_confianca": 1.0,
    "consorcio_id": "14618",
    "consorcio_nome": (
        "CONSORCIO PÚBLICO DE DESENVOLVIMENTO SUSTENTÁVEL DO TERRITÓRIO BACIA DO PARAMIRIM"
    ),
    "consorcio_raw": "Consórcio Bacia do Paramirim",
    "consorcio_match_metodo": "alias",
    "consorcio_match_confianca": 0.92,
    "licenciado_por": "consorcio",
    "orgao_emissor_raw": "Consórcio Público Interfederativo da Bacia do Paramirim",
    "licenciado_por_evidencia": "Licença assinada pelo Diretor Técnico do Consórcio...",
    "licenciado_por_confianca": 0.95,
    "titular": "Empreendimento (Processo Técnico nº 013/2024)",
    "mineral": "AREIA",
    "substancia_raw": "areia",
    "tipologia_codigo": "B3.1",
    "tipologia_nome": "Areias, Arenoso, Cascalhos, Filitos e Saibro",
    "potencial_poluidor": "M",
    "nivel_licenciamento": None,
    "modalidade": "LAU",
    "modalidade_raw": "LAU",
    "numero_licenca": "01/2025",
    "data_concessao": "2025-02-04",
    "fonte_urls": ["https://exemplo.invalid/caturama/lau-01-2025"],
    "trecho_citado": "Licença Ambiental Unificada Nº 01/2025...",
    "data_consulta": "2026-08-01",
    "verificado": False,
}

META_GOAL_8: dict[str, Any] = {
    "ano_referencia": 2025,
    "gerado_em": "2026-08-01T14:32:00Z",
    "prompt_version": "deep_research_v1",
    "modelo_pesquisa": "deep-research-preview-04-2026",
    "modelo_estruturacao": "deepseek-v4-flash",
    "run_id": "2025_20260801T143200Z",
    "refs_data_consulta": "2026-08-01",
    "total_licencas": 8,
    "total_por_licenciado_por": {"municipio_proprio": 3, "consorcio": 4, "indeterminado": 1},
    "municipios_com_licenca": 6,
    "avisos": ["consorcio_match_confianca < 0.7 em 1 registro"],
}

PRODUTO_GOAL_8: dict[str, Any] = {
    "meta": META_GOAL_8,
    "licencas": [LICENCA_GOAL_8],
    "ranking_municipios": [
        {
            "posicao": 1,
            "municipio_id": "2907558",
            "municipio_nome": "Caturama",
            "consorcio_nome": (
                "CONSORCIO PÚBLICO DE DESENVOLVIMENTO SUSTENTÁVEL DO TERRITÓRIO BACIA DO PARAMIRIM"
            ),
            "total_licencas": 2,
            "licencas_gestao_propria": 0,
            "licencas_via_consorcio": 2,
            "licencas_indeterminado": 0,
            "modo_predominante": "consorcio",
        }
    ],
    "ranking_consorcios": [
        {"posicao": 1, "consorcio_id": "14618", "total_licencas": 2, "municipios_atendidos": 1}
    ],
}


@pytest.fixture(scope="module")
def refs() -> ReferenceData:
    return load_reference_data()


def _licenca(**overrides: Any) -> dict[str, Any]:
    """O exemplo do §8 com um campo trocado por vez — o padrão dos negativos do `test_refs.py`."""
    bruta = copy.deepcopy(LICENCA_GOAL_8)
    bruta.update(overrides)
    return bruta


def _lote(quantas: int, **overrides: Any) -> list[dict[str, Any]]:
    """`quantas` cópias com `id` distinto, para as regras que são do lote e não da linha."""
    return [_licenca(id=f"linha-{n}", **overrides) for n in range(quantas)]


# --------------------------------------------------------------------------- positivos


def test_exemplo_do_goal_8_valida_sem_erro_e_sem_aviso(refs: ReferenceData) -> None:
    """O exemplo do §8 fecha com as referências reais: município apto, consórcio igual ao
    cadastral, tipologia entre as 17, mineral entre os 169, confianças acima de 0,7."""
    validas, erros, avisos = validate_licencas([LICENCA_GOAL_8], refs)
    assert erros == []
    assert avisos == []
    assert len(validas) == 1
    assert validas[0].id == "2025-caturama-lau-01"
    assert validas[0].verificado is False


def test_produto_do_goal_8_valida_e_preserva_as_chaves(refs: ReferenceData) -> None:
    """AC5: mesmo formato e mesmas chaves. A ordem de declaração dos modelos é a ordem do §8, e o
    `model_dump` tem de devolver exatamente as chaves do documento, sem acrescentar nem faltar."""
    produto = Produto.model_validate(PRODUTO_GOAL_8)
    despejado = produto.model_dump(mode="json")
    assert list(despejado) == list(PRODUTO_GOAL_8)
    assert list(despejado["meta"]) == list(META_GOAL_8)
    assert list(despejado["licencas"][0]) == list(LICENCA_GOAL_8)
    assert list(despejado["ranking_municipios"][0]) == list(PRODUTO_GOAL_8["ranking_municipios"][0])
    assert list(despejado["ranking_consorcios"][0]) == list(PRODUTO_GOAL_8["ranking_consorcios"][0])
    assert despejado == PRODUTO_GOAL_8


def test_aceita_modelo_ja_construido(refs: ReferenceData) -> None:
    """A entrada normal é dicionário (§3), mas testar com objeto à mão tem de continuar valendo."""
    validas, erros, _ = validate_licencas([LicencaNormalizada.model_validate(LICENCA_GOAL_8)], refs)
    assert erros == []
    assert len(validas) == 1


def test_totais_por_licenciado_por_tem_sempre_as_tres_chaves(refs: ReferenceData) -> None:
    """Submodelo e não `dict[str, int]`: um run sem indeterminados ainda grava a chave zerada."""
    meta = copy.deepcopy(META_GOAL_8)
    meta["total_por_licenciado_por"] = {"consorcio": 4}
    produto = Produto.model_validate({**PRODUTO_GOAL_8, "meta": meta})
    assert produto.meta.total_por_licenciado_por.model_dump() == {
        "municipio_proprio": 0,
        "consorcio": 4,
        "indeterminado": 0,
    }


# --------------------------------------------------------------------------- não-regras


def test_consorcio_com_municipio_proprio_e_valido(refs: ReferenceData) -> None:
    """§6.4, final: "município X, integrante do consórcio Y, licenciou sozinho" é combinação
    válida e informativa. O validador **não** pode rejeitá-la."""
    validas, erros, _ = validate_licencas(
        [_licenca(licenciado_por="municipio_proprio")], refs
    )
    assert erros == []
    assert len(validas) == 1
    assert validas[0].consorcio_id == "14618"


def test_municipio_id_nulo_e_valido(refs: ReferenceData) -> None:
    """Decisão 16: o AC3 exige `municipio_id` **válido**, não `municipio_id` preenchido. É o caso
    real `Bacia do Paramirim (Região)`, que não é município."""
    validas, erros, _ = validate_licencas(
        [
            _licenca(
                municipio_id=None,
                municipio_nome=None,
                municipio_raw="Bacia do Paramirim (Região)",
                municipio_match_metodo="nenhum",
                municipio_match_confianca=0.58,
            )
        ],
        refs,
    )
    assert erros == []
    assert len(validas) == 1
    assert validas[0].municipio_id is None


# --------------------------------------------------------------------------- regras duras


@pytest.mark.parametrize(
    "overrides,trecho",
    [
        ({"fonte_urls": ["exemplo.invalid/sem-esquema"]}, "não começa com http://"),
        ({"fonte_urls": ["ftp://exemplo.invalid/a"]}, "não começa com http://"),
        ({"municipio_id": "9999999"}, "não está entre os 417 municípios"),
        ({"consorcio_id": "99999"}, "não está entre os 29 consórcios"),
        ({"tipologia_codigo": "B9.9"}, "não está entre as 17 tipologias"),
        ({"data_consulta": "01/08/2026"}, "data_consulta '01/08/2026' não é data ISO"),
    ],
)
def test_regra_dura_descarta_a_linha(
    refs: ReferenceData, overrides: dict[str, Any], trecho: str
) -> None:
    validas, erros, _ = validate_licencas([_licenca(**overrides)], refs)
    assert validas == []
    assert any(trecho in erro for erro in erros), erros
    assert all(erro.startswith("licença '2025-caturama-lau-01'") for erro in erros), erros


@pytest.mark.parametrize(
    "overrides,trecho",
    [
        ({"fonte_urls": []}, "fonte_urls"),
        ({"verificado": True}, "verificado"),
        ({"nivel_licenciamento": 4}, "nivel_licenciamento"),
        ({"municipio_match_confianca": 1.5}, "municipio_match_confianca"),
        ({"licenciado_por": "prefeitura"}, "licenciado_por"),
        ({"municipio_match_metodo": "chute"}, "municipio_match_metodo"),
    ],
)
def test_regra_de_tipo_descarta_a_linha(
    refs: ReferenceData, overrides: dict[str, Any], trecho: str
) -> None:
    """O que o Pydantic já pega vira erro **de texto**, não exceção: o laço de reparo do §3
    realimenta a mensagem no LLM."""
    validas, erros, _ = validate_licencas([_licenca(**overrides)], refs)
    assert validas == []
    assert any(trecho in erro for erro in erros), erros


def test_campo_desconhecido_e_erro_duro(refs: ReferenceData) -> None:
    """`extra="forbid"` é o inverso da política do `ref_mapping.yaml`, e de propósito: aqui o
    contrato é nosso e quem produz é um LLM, então chave nova é invenção."""
    validas, erros, _ = validate_licencas([_licenca(municipio_uf="BA")], refs)
    assert validas == []
    assert any("municipio_uf" in erro for erro in erros), erros


def test_linha_sem_id_e_localizada_pela_posicao(refs: ReferenceData) -> None:
    """A mensagem tem de localizar a linha mesmo quando o defeito é o próprio `id`."""
    bruta = _licenca()
    del bruta["id"]
    _, erros, _ = validate_licencas([_licenca(), bruta], refs)
    assert any(erro.startswith("licença na posição 1") for erro in erros), erros


def test_id_duplicado_derruba_a_segunda_ocorrencia(refs: ReferenceData) -> None:
    validas, erros, _ = validate_licencas([_licenca(), _licenca()], refs)
    assert len(validas) == 1
    assert any("duplicado no lote" in erro for erro in erros), erros


def test_acumula_todos_os_defeitos_da_linha(refs: ReferenceData) -> None:
    """Parar no primeiro esconde os outros e gasta uma das duas tentativas de reparo (§5)."""
    _, erros, _ = validate_licencas(
        [_licenca(municipio_id="9999999", consorcio_id="99999", tipologia_codigo="B9.9")], refs
    )
    assert len(erros) == 3


def test_linha_boa_sobrevive_a_linha_ruim(refs: ReferenceData) -> None:
    """Abortar o lote descartaria as válidas — o inverso do que o §6.2 pede."""
    validas, erros, _ = validate_licencas(
        [_licenca(id="ruim", municipio_id="9999999"), _licenca(id="boa")], refs
    )
    assert [licenca.id for licenca in validas] == ["boa"]
    assert len(erros) == 1


# --------------------------------------------------------------------------- datas


@pytest.mark.parametrize("valor", ["2025-02-04", None])
def test_data_concessao_aceita(refs: ReferenceData, valor: str | None) -> None:
    validas, erros, _ = validate_licencas([_licenca(data_concessao=valor)], refs)
    assert erros == []
    assert len(validas) == 1


@pytest.mark.parametrize(
    "valor",
    [
        "20250204",  # forma compacta: `date.fromisoformat` ACEITA, só o regex barra
        "2025-W05-1",  # data-semana ISO: idem, vira 2025-01-27 em silêncio
        "2025-02-30",  # dia inexistente: só o `fromisoformat` barra
        "2025-02-04T00:00:00",
        "Fevereiro/2025",
        "Ativa em 2026",
    ],
)
def test_data_concessao_rejeitada(refs: ReferenceData, valor: str) -> None:
    """As duas primeiras são a razão de o regex existir: medido no Python 3.12,
    `date.fromisoformat("20250204")` devolve `date(2025, 2, 4)` sem reclamar."""
    validas, erros, _ = validate_licencas([_licenca(data_concessao=valor)], refs)
    assert validas == []
    assert any("não é data ISO AAAA-MM-DD nem null" in erro for erro in erros), erros


# --------------------------------------------------------------------------- modalidade


@pytest.mark.parametrize(
    "bruta,canonica",
    [
        ("Renovação", "Renovacao"),  # a grafia que o §5 manda o prompt pedir
        ("renovacao", "Renovacao"),
        ("RENOVAÇÃO", "Renovacao"),
        ("lau", "LAU"),
        ("LAU", "LAU"),
        (" lp ", "LP"),
    ],
)
def test_modalidade_normaliza(refs: ReferenceData, bruta: str, canonica: str) -> None:
    """O §5 pede `Renovação` ao prompt de pesquisa e o §8 grava `Renovacao`. A coerção é da mesma
    classe do `fold()` do patch 6: mecânica e fechada, não inferência."""
    validas, erros, _ = validate_licencas([_licenca(modalidade=bruta)], refs)
    assert erros == []
    assert validas[0].modalidade == canonica


@pytest.mark.parametrize(
    "bruta", ["Licença Unificada", "LAU/2025", "Autorização", "Licença Específica", "Licença de Alteração"]
)
def test_modalidade_fora_do_vocabulario_vira_outra_e_preserva_o_raw(
    refs: ReferenceData, bruta: str
) -> None:
    """Antes era erro duro, e o relatório real de 2025 mostrou o preço: `Licença Específica` e
    `Licença de Alteração` derrubavam a linha inteira, que sumia do produto sem aparecer em
    `validation_errors` do JSON final. Perder a licença é pior que registrar `"Outra"` — e o
    documento continua legível por `modalidade_raw`."""
    validas, erros, _ = validate_licencas(
        [_licenca(modalidade=bruta, modalidade_raw=None)], refs
    )

    assert erros == []
    assert validas[0].modalidade == "Outra"
    assert validas[0].modalidade_raw == bruta


@pytest.mark.parametrize("bruta", ["", "   "])
def test_modalidade_vazia_e_nula_sem_raw(refs: ReferenceData, bruta: str) -> None:
    """String vazia não é "modalidade que não conhecemos", é campo ausente — vira `None` dos dois
    lados, e não uma `"Outra"` com `modalidade_raw` em branco."""
    validas, erros, _ = validate_licencas(
        [_licenca(modalidade=bruta, modalidade_raw=None)], refs
    )

    assert erros == []
    assert validas[0].modalidade is None
    assert validas[0].modalidade_raw is None


@pytest.mark.parametrize("bruta", [123, {}, []])
def test_modalidade_nao_textual_continua_erro_duro(refs: ReferenceData, bruta: Any) -> None:
    """Só *texto* fora do vocabulário vira `"Outra"`. Número ou objeto no campo é o LLM devolvendo
    lixo estrutural, e isso não tem licença real por trás para preservar."""
    validas, erros, _ = validate_licencas([_licenca(modalidade=bruta)], refs)

    assert validas == []
    assert any("modalidade" in erro for erro in erros), erros


# --------------------------------------------------------------------------- regras moles


def test_confianca_baixa_vira_aviso_sem_derrubar_a_linha(refs: ReferenceData) -> None:
    """O limiar vem do `confianca_aviso` de `config/matching.yaml`, que já declara este consumidor."""
    limiar = load_matching_config().confianca_aviso
    validas, erros, avisos = validate_licencas(
        [_licenca(consorcio_match_confianca=0.65, consorcio_match_metodo="fuzzy")], refs
    )
    assert limiar == 0.7
    assert erros == []
    assert len(validas) == 1
    assert avisos == ["consorcio_match_confianca:2025-caturama-lau-01:0.650"]


def test_municipio_nao_apto(refs: ReferenceData) -> None:
    """Aiquara (`2900603`) é um dos 50 `nao_habilitado`. Licença atribuída a ele não é rejeitada —
    é anomalia para olho humano, não dado inválido."""
    _, erros, avisos = validate_licencas(
        [_licenca(municipio_id="2900603", municipio_nome="Aiquara", consorcio_id="8801")], refs
    )
    assert erros == []
    assert "municipio_nao_apto:2025-caturama-lau-01:2900603" in avisos


def test_consorcio_divergente(refs: ReferenceData) -> None:
    """§6.2 regra 2: prevalece o do relatório, e o run avisa. Pode ser mudança de composição
    posterior ao snapshot do GAC ou erro do relatório."""
    _, erros, avisos = validate_licencas([_licenca(consorcio_id="10152")], refs)
    assert erros == []
    assert "consorcio_divergente:2025-caturama-lau-01:10152!=14618" in avisos


def test_consorcio_inesperado(refs: ReferenceData) -> None:
    """Baixa Grande (`2902609`) é um dos 27 habilitados sem vínculo consorcial."""
    _, erros, avisos = validate_licencas(
        [_licenca(municipio_id="2902609", municipio_nome="Baixa Grande")], refs
    )
    assert erros == []
    assert "consorcio_inesperado:2025-caturama-lau-01:14618" in avisos


def test_mineral_fora_vocabulario(refs: ReferenceData) -> None:
    _, erros, avisos = validate_licencas([_licenca(mineral="KRYPTONITA")], refs)
    assert erros == []
    assert "mineral_fora_vocabulario:2025-caturama-lau-01:KRYPTONITA" in avisos


def test_mineral_no_plural_resolve_pela_chave_e_nao_avisa(refs: ReferenceData) -> None:
    """`"AREIAS"` não está literal entre os 169 `SUBS`, mas `chave_substancia` o leva a `areia` —
    a mesma chave dos dois lados, o papel que `fold` tem no patch 6."""
    assert "AREIAS" not in set(refs.minerais)
    _, _, avisos = validate_licencas([_licenca(mineral="AREIAS")], refs)
    assert avisos == []


def test_mineral_nulo_nao_avisa(refs: ReferenceData) -> None:
    _, _, avisos = validate_licencas([_licenca(mineral=None)], refs)
    assert avisos == []


# --------------------------------------------------------------------------- nivel_uniforme


def test_nivel_uniforme_dispara_no_lote_todo_igual(refs: ReferenceData) -> None:
    """O caso real: as 8 linhas do PROMPT 2 vieram todas "Nível 3", suspeito de preenchimento por
    padrão (§11)."""
    _, erros, avisos = validate_licencas(_lote(8, nivel_licenciamento=3), refs)
    assert erros == []
    assert "nivel_uniforme:3:8/8" in avisos


@pytest.mark.parametrize("quantas", [1, 2, 4])
def test_nivel_uniforme_nao_dispara_abaixo_do_minimo(refs: ReferenceData, quantas: int) -> None:
    """Com poucas linhas, 100% de uniformidade é trivial e o aviso viraria ruído em todo run
    pequeno. Os tamanhos são literais de propósito: escrevê-los como `NIVEL_UNIFORME_MINIMO - 1`
    faria o teste seguir a constante e passar com qualquer valor dela."""
    assert NIVEL_UNIFORME_MINIMO == 5
    _, _, avisos = validate_licencas(_lote(quantas, nivel_licenciamento=3), refs)
    assert not [aviso for aviso in avisos if aviso.startswith("nivel_uniforme")]


def test_nivel_uniforme_dispara_exatamente_no_minimo(refs: ReferenceData) -> None:
    """Contraprova do teste acima: cinco linhas já bastam."""
    _, _, avisos = validate_licencas(_lote(5, nivel_licenciamento=3), refs)
    assert "nivel_uniforme:3:5/5" in avisos


def test_nivel_uniforme_nao_dispara_com_niveis_misturados(refs: ReferenceData) -> None:
    lote = _lote(8, nivel_licenciamento=3)
    for linha in lote[:4]:
        linha["nivel_licenciamento"] = 1
    _, _, avisos = validate_licencas(lote, refs)
    assert not [aviso for aviso in avisos if aviso.startswith("nivel_uniforme")]


def test_nivel_uniforme_nao_dispara_quando_quase_todos_sao_nulos(refs: ReferenceData) -> None:
    """Denominador é o total de linhas válidas, não só as com nível: senão um lote de 8 em que uma
    única linha traz nível daria 100%."""
    lote = _lote(8, nivel_licenciamento=None)
    lote[0]["nivel_licenciamento"] = 3
    _, _, avisos = validate_licencas(lote, refs)
    assert not [aviso for aviso in avisos if aviso.startswith("nivel_uniforme")]


def test_lote_vazio(refs: ReferenceData) -> None:
    assert validate_licencas([], refs) == ([], [], [])
