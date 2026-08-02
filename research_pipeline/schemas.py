"""O contrato do §8 em Pydantic v2 — os tipos contra os quais AC1–AC5 são medidos.

`extra="forbid"` em **todo** modelo, e é o inverso deliberado da política do `ref_mapping.yaml`
(`refs.py`, achado 1): lá a fonte é de terceiro e ganhar coluna não pode quebrar a carga; aqui o
contrato é nosso e quem produz é um LLM, então chave desconhecida é invenção, não evolução.

Este módulo importa **só** `pydantic` e a stdlib. Nada de `refs`, `vocab` ou `matcher` — o módulo
de contrato não pode arrastar `openpyxl` nem `rapidfuzz`. A dependência corre no sentido oposto:
`matcher.py` e `vocab.py` importam `MetodoMatch` e `PotencialPoluidor` daqui, para que os literais
tenham uma fonte só. Dois `Literal` iguais em dois módulos divergem em silêncio.

Duas decisões que o §8 impõe e que não são óbvias:

1. **Ordem de declaração é ordem de chave no JSON.** O AC5 é *mesmo formato e mesmas chaves entre
   execuções*, então os campos aparecem aqui na ordem em que o §8 os escreve, não agrupados por
   tipo ou por conveniência.
2. **Pertinência aos 417/29/17/169 não é tipo, é regra.** `municipio_id` é `str | None` e quem
   confere se ele está entre os 417 é `nodes/validate.py`. Um `Literal` com 417 valores daria uma
   mensagem de erro ilegível e amarraria o schema ao snapshot do GAC; o validador nomeia *qual* id
   estava fora e contra qual tabela.

`Modalidade` é o único campo com coerção. O §5 manda o prompt de pesquisa pedir `Renovação`, com
til, e o produto final grava `"Renovacao"`, sem: `_normalizar_modalidade` dobra caixa e acento e
mapeia as 6 formas conhecidas. É a mesma classe de operação que o `fold()` do patch 6 — mecânica,
fechada, e não inventa valor.

O que está **fora** dessas 6 formas vira `"Outra"`, com a grafia original preservada em
`modalidade_raw`. Antes era erro duro, e o relatório real de 2025 provou que isso perde dado em
silêncio: prefeituras escrevem `"Licença Específica"` e `"Licença de Alteração"`, o `Literal`
recusava a linha inteira em `extract`, ela queimava as 2 tentativas de reparo e sumia do produto —
sem aparecer em `validation_errors` do JSON final, porque o manifesto conta só o que sobreviveu.
Perder a licença é pior erro que registrar uma modalidade que a norma não nomeia.

`"Outra"` **não amplia o vocabulário**: o §5 do `GOAL.md` congelou a coluna como
`LP/LI/LO/LAU/LU/Renovação`, e pôr `"Licença Específica"` no `Literal` seria afirmar, sem fonte
normativa, que aquilo é uma modalidade — quando é a redação de uma prefeitura. `"Outra"` diz
exatamente o que se sabe (não é nenhuma das 6) e `modalidade_raw` guarda o que o documento disse.
"""

from __future__ import annotations

import unicodedata
from typing import Any, Literal

from pydantic import BaseModel, ConfigDict, Field, field_validator, model_validator

__all__ = [
    "Citation",
    "LicencaBruta",
    "LicencaNormalizada",
    "LicenciadoPor",
    "Meta",
    "MetodoMatch",
    "Modalidade",
    "NivelLicenciamento",
    "PotencialPoluidor",
    "Produto",
    "RankingConsorcio",
    "RankingMunicipio",
    "TotaisLicenciadoPor",
]

MetodoMatch = Literal["exato", "alias", "fuzzy", "inferido", "nenhum"]
"""Como o id foi resolvido (§6.2). `inferido` é a herança de consórcio cadastral (decisão 15) e
`nenhum` é o município abaixo do piso de 0.60 (decisão 16). `matcher.py` importa este literal."""

LicenciadoPor = Literal["municipio_proprio", "consorcio", "indeterminado"]
"""§6.4. Nunca deduzido do vínculo consorcial — exige evidência textual, e sem ela é
`indeterminado`."""

Modalidade = Literal["LP", "LI", "LO", "LAU", "LU", "Renovacao", "Outra"]
"""As 6 do §5 mais `"Outra"`, que é a ausência de classificação, não uma sétima modalidade — ver o
docstring do módulo. Quem lê `"Outra"` tem de ler `modalidade_raw` junto."""

PotencialPoluidor = Literal["P", "M", "A"]
"""Os três do Art. 109. As 17 folhas medidas usam só `M` e `A`; o literal acompanha a matriz, não o
snapshot. `vocab.Tipologia` importa este literal."""

NivelLicenciamento = Literal[1, 2, 3]
"""Só chega ao produto se estiver no documento citado — o §5 regra 6 proíbe inferi-lo, e o
`normalize` não vê o relatório, logo não pode preencher o que o `extract` devolveu `null`."""

_MODALIDADES_POR_DOBRA = {
    "lp": "LP",
    "li": "LI",
    "lo": "LO",
    "lau": "LAU",
    "lu": "LU",
    "renovacao": "Renovacao",
}
"""Chave é a dobra (minúscula, sem combinantes) da grafia canônica. Fechado: qualquer coisa fora
daqui não é variação de grafia, é modalidade que não existe no vocabulário."""


def _dobrar(texto: str) -> str:
    """Minúscula sem combinantes. Cópia local de propósito: `common.text.fold` faz mais (mojibake,
    espaços) e importá-lo aqui puxaria `common/` para dentro do módulo de contrato."""
    decomposto = unicodedata.normalize("NFD", texto.strip().lower())
    return "".join(c for c in decomposto if not unicodedata.combining(c))


def _normalizar_modalidade(valor: Any) -> Any:
    """`"Renovação"`, `"renovacao"`, `"lau"` -> a grafia canônica; string fora das 6 -> `"Outra"`.

    Não-string passa intacto para o `Literal` recusar com a mensagem de tipo do pydantic: `123` ou
    `{}` no campo é o LLM devolvendo lixo estrutural, e isso continua erro duro. Só *texto* que não
    está no vocabulário vira `"Outra"` — texto é o caso em que há uma licença real por trás.
    """
    if not isinstance(valor, str):
        return valor
    dobrado = _dobrar(valor)
    if not dobrado:
        return None
    return _MODALIDADES_POR_DOBRA.get(dobrado, "Outra")


def _preservar_modalidade_raw(dados: Any) -> Any:
    """Copia a grafia original para `modalidade_raw` antes de `_normalizar_modalidade` agir.

    `mode="before"` no **modelo**, não no campo: um `field_validator` só enxerga o próprio campo e
    não teria como escrever noutro. Só preenche quando `modalidade_raw` está ausente — recarregar
    um produto já emitido (o que `validate.py` e o carregador do banco fazem) não pode sobrescrever
    o raw que já foi gravado pela grafia canônica que veio junto.
    """
    if not isinstance(dados, dict):
        return dados
    bruta = dados.get("modalidade")
    if dados.get("modalidade_raw") is None and isinstance(bruta, str) and bruta.strip():
        dados = {**dados, "modalidade_raw": bruta}
    return dados


class _Base(BaseModel):
    model_config = ConfigDict(extra="forbid")


class Citation(_Base):
    """Citação do Deep Research (§3, `PipelineState.citations`)."""

    url: str
    titulo: str | None
    trecho: str | None
    indice: int


class LicencaBruta(_Base):
    """Saída do nó `extract` (§6.1) — transcrição fiel, nomes como aparecem no relatório.

    Campo ausente no relatório é `None`, nunca preenchido por padrão. `municipio_raw`,
    `fonte_urls` e `trecho_citado` são os três que não podem faltar: sem fonte verificável a linha
    não entra na tabela (§5 regra 5), e sem município não há o que normalizar.
    """

    municipio_raw: str = Field(min_length=1)
    consorcio_raw: str | None = None
    orgao_emissor_raw: str | None = None
    licenciado_por_raw: LicenciadoPor
    licenciado_por_evidencia: str | None = None
    licenciado_por_confianca: float = Field(ge=0.0, le=1.0)
    titular: str | None = None
    substancia_raw: str | None = None
    tipologia_raw: str | None = None
    nivel_licenciamento: NivelLicenciamento | None = None
    modalidade: Modalidade | None = None
    modalidade_raw: str | None = None
    numero_licenca: str | None = None
    data_concessao: str | None = None
    fonte_urls: list[str] = Field(min_length=1)
    trecho_citado: str = Field(min_length=1)

    _raw_modalidade = model_validator(mode="before")(_preservar_modalidade_raw)
    _norm_modalidade = field_validator("modalidade", mode="before")(_normalizar_modalidade)


class LicencaNormalizada(_Base):
    """Um registro do produto final (§8). Grão: **uma licença concedida**.

    `verificado` é `Literal[False]`, não `bool`: o §8 diz que é *sempre* a saída do pipeline, e
    travar isso no tipo custa menos que uma regra de validação com teste próprio. Fingir verificação
    humana que não houve é o defeito que a decisão 5 existe para impedir.
    """

    id: str = Field(min_length=1)
    municipio_id: str | None
    municipio_nome: str | None
    municipio_raw: str = Field(min_length=1)
    municipio_match_metodo: MetodoMatch
    municipio_match_confianca: float = Field(ge=0.0, le=1.0)
    consorcio_id: str | None
    consorcio_nome: str | None
    consorcio_raw: str | None
    consorcio_match_metodo: MetodoMatch
    consorcio_match_confianca: float = Field(ge=0.0, le=1.0)
    licenciado_por: LicenciadoPor
    orgao_emissor_raw: str | None
    licenciado_por_evidencia: str | None
    licenciado_por_confianca: float = Field(ge=0.0, le=1.0)
    titular: str | None
    mineral: str | None
    substancia_raw: str | None
    tipologia_codigo: str | None
    tipologia_nome: str | None
    potencial_poluidor: PotencialPoluidor | None
    nivel_licenciamento: NivelLicenciamento | None
    modalidade: Modalidade | None
    modalidade_raw: str | None
    numero_licenca: str | None
    data_concessao: str | None
    fonte_urls: list[str] = Field(min_length=1)
    trecho_citado: str = Field(min_length=1)
    data_consulta: str = Field(min_length=1)
    verificado: Literal[False]

    _raw_modalidade = model_validator(mode="before")(_preservar_modalidade_raw)
    _norm_modalidade = field_validator("modalidade", mode="before")(_normalizar_modalidade)


class TotaisLicenciadoPor(_Base):
    """As três chaves do `meta.total_por_licenciado_por` (§8).

    Submodelo em vez de `dict[str, int]` porque o AC5 é *mesmas chaves entre execuções*: um dict
    omitiria `indeterminado` num run em que ninguém ficou indeterminado, e o consumidor teria de
    tratar chave ausente e zero como a mesma coisa.
    """

    municipio_proprio: int = Field(default=0, ge=0)
    consorcio: int = Field(default=0, ge=0)
    indeterminado: int = Field(default=0, ge=0)


class RankingMunicipio(_Base):
    """§8. `posicao` é única mesmo com empate (decisão 17) — o empate fica visível em
    `total_licencas`, e a ordenação `(-total, fold(nome), id)` é do patch 10."""

    posicao: int = Field(ge=1)
    municipio_id: str
    municipio_nome: str
    consorcio_nome: str | None
    total_licencas: int = Field(ge=0)
    licencas_gestao_propria: int = Field(ge=0)
    licencas_via_consorcio: int = Field(ge=0)
    licencas_indeterminado: int = Field(ge=0)
    modo_predominante: LicenciadoPor


class RankingConsorcio(_Base):
    """§8. Conta **só** `licenciado_por = "consorcio"` — senão infla o consórcio com licenças que o
    município emitiu sozinho. Sem `consorcio_nome` porque o §8 não o tem."""

    posicao: int = Field(ge=1)
    consorcio_id: str
    total_licencas: int = Field(ge=0)
    municipios_atendidos: int = Field(ge=0)


class Meta(_Base):
    """O manifesto embutido no produto (§8). `refs_data_consulta` é a data do snapshot do GAC,
    propagada de `ReferenceData.data_consulta`; `data_consulta` da licença é a do run (§8)."""

    ano_referencia: int
    gerado_em: str
    prompt_version: str
    modelo_pesquisa: str
    modelo_estruturacao: str
    run_id: str
    refs_data_consulta: str
    total_licencas: int = Field(ge=0)
    total_por_licenciado_por: TotaisLicenciadoPor
    municipios_com_licenca: int = Field(ge=0)
    avisos: list[str] = Field(default_factory=list)


class Produto(_Base):
    """O envelope do §8 — o que vira `licencas_<ano>.json`."""

    meta: Meta
    licencas: list[LicencaNormalizada]
    ranking_municipios: list[RankingMunicipio]
    ranking_consorcios: list[RankingConsorcio]
