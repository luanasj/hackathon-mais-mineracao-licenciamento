"""Validador duro — onde AC1–AC4 deixam de ser prosa e viram medida.

`validate_licencas` devolve `(válidas, erros_duros, avisos)` e **nunca levanta**. O laço de reparo
do §3 realimenta a mensagem de validação no LLM, então erro tem de ser texto; e abortar o lote na
primeira linha ruim descartaria as outras, que é o inverso do que o §6.2 pede — lá até contradição
entre relatório e cadastro é aviso, nunca rejeição.

Três coisas que a forma do problema impôs e não são óbvias:

1. **A entrada é dicionário, não modelo.** O estado do grafo carrega `licencas_normalizadas:
   list[dict]` (§3) e é de lá que isto é chamado. `model_validate` aceita instância também, então
   testar com objeto à mão continua valendo — mas o caminho que importa é o do dicionário cru,
   porque é ele que pode trazer chave inventada pelo LLM (`extra="forbid"`).
2. **`date.fromisoformat` sozinho não valida data ISO.** No Python 3.12 ele aceita `"20250204"`
   (forma compacta) e `"2025-W05-1"` (data-semana), os dois virando datas plausíveis em silêncio.
   O §6.1 pede `AAAA-MM-DD`. Daí `_data_iso` casar o regex **antes** — e continuar chamando
   `fromisoformat` depois, porque só ele pega `"2025-02-30"`.
3. **Regra dura descarta a linha; regra mole não.** Duro é o que tornaria o registro inutilizável
   ou falso (id fora das 417, URL que não é URL, data que não é data). Mole é o que merece olho
   humano mas não invalida o dado — e vai para `meta.avisos` (§8) com o `id` da licença, para que
   ninguém descubra um join errado só quando o dado já está no banco.

Os avisos seguem o formato `codigo:<id>[:detalhe]`, o mesmo de
`tipologia_porte_ausente:B4.2:porte_pequeno` que `vocab.py` já emite. A agregação em
`"consorcio_match_confianca < 0.7 em 1 registro"` que o §8 mostra é do patch 10, não daqui: perder
o `id` na origem tornaria o aviso inauditável.
"""

from __future__ import annotations

import collections
import re
from collections.abc import Mapping, Sequence
from datetime import date
from typing import Any

from pydantic import ValidationError

from research_pipeline.matcher import MatchingConfig, load_matching_config
from research_pipeline.refs import ReferenceData
from research_pipeline.schemas import LicencaNormalizada
from research_pipeline.vocab import chave_substancia

__all__ = ["NIVEL_UNIFORME_MINIMO", "NIVEL_UNIFORME_FRACAO", "validate_licencas"]

_DATA_ISO_RE = re.compile(r"\d{4}-\d{2}-\d{2}")
"""Ver o achado 2 do docstring: sem isto, `"20250204"` entra como 4 de fevereiro."""

_ESQUEMAS_URL = ("http://", "https://")

NIVEL_UNIFORME_FRACAO = 0.90
"""§11: alerta quando mais de 90% das linhas compartilham o mesmo nível."""

NIVEL_UNIFORME_MINIMO = 5
"""Abaixo disto o aviso não é emitido. Com uma linha só, 100% de uniformidade é trivial e o aviso
apareceria em todo run pequeno — o que o §11 quer pegar é o padrão das 8 linhas "Nível 3" do
PROMPT 2, sinal de preenchimento por padrão, não uma amostra de tamanho 1."""


def _data_iso(valor: str) -> bool:
    if _DATA_ISO_RE.fullmatch(valor) is None:
        return False
    try:
        date.fromisoformat(valor)
    except ValueError:
        return False
    return True


def _rotulo(bruta: Mapping[str, Any] | LicencaNormalizada, posicao: int) -> str:
    """Como nomear uma linha que ainda não passou pelo Pydantic — o `id` pode faltar ou nem ser
    string, e é justamente aí que a mensagem precisa localizar a linha para o reparo."""
    ident = bruta.get("id") if isinstance(bruta, Mapping) else bruta.id
    if isinstance(ident, str) and ident:
        return f"licença {ident!r}"
    return f"licença na posição {posicao}"


def _formatar_erro_pydantic(erro: dict[str, Any]) -> str:
    caminho = ".".join(str(parte) for parte in erro["loc"]) or "(raiz)"
    return f"{caminho}: {erro['msg']}"


def _regras_duras(
    licenca: LicencaNormalizada, refs: ReferenceData, ids_vistos: set[str]
) -> list[str]:
    """Acumula **todos** os defeitos da linha antes de devolvê-la, no padrão de
    `refs._check_invariants`: parar no primeiro esconde os outros e transforma o reparo — que tem
    no máximo duas tentativas (§5) — em tentativa e erro."""
    problemas: list[str] = []

    if licenca.id in ids_vistos:
        problemas.append(f"id {licenca.id!r} duplicado no lote")

    for url in licenca.fonte_urls:
        if not url.startswith(_ESQUEMAS_URL):
            problemas.append(f"fonte_url {url!r} não começa com http:// nem https://")

    if not _data_iso(licenca.data_consulta):
        problemas.append(f"data_consulta {licenca.data_consulta!r} não é data ISO AAAA-MM-DD")
    if licenca.data_concessao is not None and not _data_iso(licenca.data_concessao):
        problemas.append(
            f"data_concessao {licenca.data_concessao!r} não é data ISO AAAA-MM-DD nem null"
        )

    if licenca.municipio_id is not None and licenca.municipio_id not in refs.municipios:
        problemas.append(
            f"municipio_id {licenca.municipio_id!r} não está entre os "
            f"{len(refs.municipios)} municípios"
        )
    if licenca.consorcio_id is not None and licenca.consorcio_id not in refs.consorcios:
        problemas.append(
            f"consorcio_id {licenca.consorcio_id!r} não está entre os "
            f"{len(refs.consorcios)} consórcios"
        )
    if licenca.tipologia_codigo is not None and licenca.tipologia_codigo not in refs.tipologias:
        problemas.append(
            f"tipologia_codigo {licenca.tipologia_codigo!r} não está entre as "
            f"{len(refs.tipologias)} tipologias do Anexo IV"
        )
    return problemas


def _regras_moles(
    licenca: LicencaNormalizada,
    refs: ReferenceData,
    config: MatchingConfig,
    minerais: frozenset[str],
) -> list[str]:
    """Nenhuma destas rejeita linha. Ver o achado 3 do docstring."""
    avisos: list[str] = []

    for campo in ("municipio_match_confianca", "consorcio_match_confianca"):
        confianca = getattr(licenca, campo)
        if confianca < config.confianca_aviso:
            avisos.append(f"{campo}:{licenca.id}:{confianca:.3f}")

    municipio = refs.municipios.get(licenca.municipio_id) if licenca.municipio_id else None
    if municipio is not None and not municipio.apto_licenciar:
        avisos.append(f"municipio_nao_apto:{licenca.id}:{municipio.id}")

    if municipio is not None and licenca.consorcio_id is not None:
        # §6.2 regra 3 fala nos 27 habilitados sem vínculo, mas a checagem é sobre o vínculo
        # cadastral e não sobre a habilitação: os 4 não habilitados sem consórcio caem aqui do
        # mesmo jeito, e já vieram acompanhados de `municipio_nao_apto`.
        if municipio.consorcio_id is None:
            avisos.append(f"consorcio_inesperado:{licenca.id}:{licenca.consorcio_id}")
        elif municipio.consorcio_id != licenca.consorcio_id:
            # Prevalece o do relatório (§6.2 regra 2): pode ser mudança de composição posterior ao
            # snapshot do GAC ou erro do relatório, e os dois merecem olho humano.
            avisos.append(
                f"consorcio_divergente:{licenca.id}:"
                f"{licenca.consorcio_id}!={municipio.consorcio_id}"
            )

    if licenca.mineral is not None:
        conhecido = (
            licenca.mineral in minerais
            or chave_substancia(licenca.mineral) in refs.indice_minerais
        )
        if not conhecido:
            avisos.append(f"mineral_fora_vocabulario:{licenca.id}:{licenca.mineral}")
    return avisos


def _aviso_nivel_uniforme(validas: Sequence[LicencaNormalizada]) -> list[str]:
    """§11. Denominador é o total de linhas válidas, não só as que têm nível: o que se quer detectar
    é *todas* as linhas virem com o mesmo nível, e contar só as preenchidas daria 100% para um lote
    em que uma única linha traz nível."""
    if len(validas) < NIVEL_UNIFORME_MINIMO:
        return []
    niveis = collections.Counter(
        licenca.nivel_licenciamento for licenca in validas if licenca.nivel_licenciamento is not None
    )
    if not niveis:
        return []
    nivel, quantas = niveis.most_common(1)[0]
    if quantas / len(validas) <= NIVEL_UNIFORME_FRACAO:
        return []
    return [f"nivel_uniforme:{nivel}:{quantas}/{len(validas)}"]


def validate_licencas(
    licencas: Sequence[Mapping[str, Any] | LicencaNormalizada],
    refs: ReferenceData,
    config: MatchingConfig | None = None,
) -> tuple[list[LicencaNormalizada], list[str], list[str]]:
    """`(válidas, erros_duros, avisos)`. Nunca levanta — ver o docstring do módulo."""
    config = config if config is not None else load_matching_config()
    minerais = frozenset(refs.minerais)

    validas: list[LicencaNormalizada] = []
    erros: list[str] = []
    avisos: list[str] = []
    ids_vistos: set[str] = set()

    for posicao, bruta in enumerate(licencas):
        rotulo = _rotulo(bruta, posicao)
        try:
            licenca = LicencaNormalizada.model_validate(bruta)
        except ValidationError as erro:
            erros.extend(f"{rotulo}: {_formatar_erro_pydantic(e)}" for e in erro.errors())
            continue

        problemas = _regras_duras(licenca, refs, ids_vistos)
        if problemas:
            erros.extend(f"licença {licenca.id!r}: {problema}" for problema in problemas)
            continue

        ids_vistos.add(licenca.id)
        validas.append(licenca)
        avisos.extend(_regras_moles(licenca, refs, config, minerais))

    avisos.extend(_aviso_nivel_uniforme(validas))
    return validas, erros, avisos
