"""Carregador das referências canônicas — 417 municípios, 29 consórcios e os vocabulários.

As tipologias e os minerais moram em `vocab.py` e são carregados **aqui**, junto das tabelas, em
vez de sob demanda: o AC8 é *falhar antes de gastar*, e um `BA.dbf` truncado descoberto no nó
`normalize` já custou o relatório. Medido: DBF 0,29 s, XLSX 0,05 s, tabelas 0,011 s — 0,35 s de
pré-voo antes de uma tarefa de US$ 3.


Este módulo **é** o critério de aceite 8: *falhar alto antes de qualquer gasto*. `run.py`
(patch 11) chama `load_reference_data()` como primeira instrução de `main()`, antes de qualquer
chave de API ser lida, justamente para que um JSON truncado custe zero em vez de custar uma
tarefa de Deep Research de US$ 3.

Três decisões que o formato dos arquivos impôs e que não são óbvias no `GOAL.md`:

1. **O `fields:` do YAML é projeção, não esquema.** Campo mapeado ausente é `RefLoadError`
   nomeando arquivo, campo e id; campo da fonte não mapeado é ignorado. Hoje o único ignorado é
   `data_publicacao` (presente nos 417). Inverso do `extra="forbid"` dos schemas do patch 7: lá
   o contrato é nosso, aqui a fonte é de terceiro e ganhar coluna não pode quebrar a carga.
2. **`data_consulta` não está simétrico.** `municipios_habilitados.json` só o traz por registro;
   `consorcios.json` só na raiz. Como `ReferenceData.data_consulta` é escalar e vira
   `meta.refs_data_consulta` no manifesto (§11), os dois lados têm de concordar — discordar é
   erro, não aviso: um manifesto com uma data quando as referências vieram de duas coletas é
   procedência falsa.
3. **Dataclass, não pydantic.** `refs` não entra no estado checkpointado (decisão G do plano: vai
   em `config["configurable"]`), então não há serialização a validar, e é caminho quente do
   matcher do patch 6. A validação aqui é imperativa porque precisa apontar *qual* dos 417
   registros está errado — `ValidationError` não dá isso de graça em invariante cruzada.

`_check_invariants` **acumula** todos os problemas antes de levantar, em vez de parar no
primeiro. Num arquivo recoletado com defeito sistemático, parar no primeiro esconderia os outros
416 e transformaria a conferência em laço de tentativa e erro.
"""

from __future__ import annotations

import json
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any

import yaml

from research_pipeline import MAPPING_PATH, REPO_ROOT
from research_pipeline.errors import RefLoadError
from research_pipeline.vocab import (
    Tipologia,
    build_substancia_index,
    load_minerais,
    load_tipologias,
)

__all__ = [
    "Consorcio",
    "Municipio",
    "RefLoadError",
    "ReferenceData",
    "load_reference_data",
]

STATUS_HABILITADO = "habilitado"
STATUS_NAO_HABILITADO = "nao_habilitado"

SITUACAO_POR_STATUS = {STATUS_HABILITADO: "CAPAZ", STATUS_NAO_HABILITADO: "NÃO CAPAZ"}
"""`situacao_gac` é redundante com `status` (§7). Discordar é falha de carregamento."""

NIVEIS_VALIDOS = {"1": 1, "2": 2, "3": 3}
"""O arquivo traz nível como string. Fora deste conjunto (ou `null`) é erro, não valor tolerado."""

_LIMITE_PROBLEMAS = 20
"""Quantos problemas de invariante entram na mensagem antes de virar contagem."""


@dataclass(frozen=True, slots=True)
class Municipio:
    """Um dos 417. `apto_licenciar` é derivado, não vem do arquivo."""

    id: str
    nome: str
    codigo_ibge: str
    consorcio_id: str | None
    consorcio_nome: str | None
    nivel_habilitacao: int | None
    situacao_gac: str
    status: str
    apto_licenciar: bool
    fonte_url: str
    data_consulta: str


@dataclass(frozen=True, slots=True)
class Consorcio:
    """Um dos 29. `membros` guarda só `codigo_ibge`.

    Os outros três campos do registro aninhado (`municipio`, `nivel`, `status`) são cópia do
    registro do município e não viram estado — duplicá-los seria criar duas fontes de verdade
    para o mesmo fato. Viram invariante de conferência em `_check_invariants`.
    """

    id: str
    nome: str
    total_municipios: int
    membros: tuple[str, ...]


@dataclass(frozen=True, slots=True)
class ReferenceData:
    """Tudo que o pipeline precisa saber antes de gastar o primeiro centavo.

    Os dois índices existem porque o patch 9 faz **duas buscas distintas** e não uma:
    `substancia_raw` contra `indice_substancias` (Anexo IV, 128 chaves) e `mineral` contra
    `indice_minerais` (SIGMINE, 169). Medido: só 69 dos 169 existem nos dois — o SIGMINE nomeia
    minério e rocha, o Anexo IV nomeia elemento e mineral. Colapsá-los num índice só perderia a
    distinção entre "não achei a tipologia" e "não achei o mineral".

    `avisos` deixa de ser vazio aqui: são os do vocabulário (porte ausente em B4.2). Nas
    referências canônicas toda anomalia continua sendo erro, não aviso.
    """

    municipios: dict[str, Municipio]
    consorcios: dict[str, Consorcio]
    data_consulta: str
    fonte_urls: tuple[str, ...]
    tipologias: dict[str, Tipologia] = field(default_factory=dict)
    minerais: tuple[str, ...] = ()
    indice_substancias: dict[str, tuple[str, ...]] = field(default_factory=dict)
    indice_minerais: dict[str, str] = field(default_factory=dict)
    avisos: tuple[str, ...] = ()


@dataclass(frozen=True, slots=True)
class _Registro:
    """Registro da fonte já projetado pelo `fields:`, com a chave do container preservada.

    A chave é preservada porque `container: dict` promete que ela é o id: um arquivo rechaveado
    por engano (por nome, por exemplo) passaria despercebido se só olhássemos os campos.
    """

    chave: str | None  # `None` quando `container: list`
    campos: dict[str, Any]


def _load_mapping(mapping_path: Path) -> dict[str, Any]:
    try:
        conteudo = yaml.safe_load(mapping_path.read_text(encoding="utf-8"))
    except FileNotFoundError as erro:
        raise RefLoadError(f"{mapping_path}: mapeamento ausente") from erro
    except yaml.YAMLError as erro:
        raise RefLoadError(f"{mapping_path}: YAML inválido ({erro})") from erro
    if not isinstance(conteudo, dict):
        raise RefLoadError(f"{mapping_path}: esperado mapeamento no topo, veio {type(conteudo).__name__}")
    for bloco in ("municipios", "consorcios", "tipologias", "minerais", "invariantes"):
        if bloco not in conteudo:
            raise RefLoadError(f"{mapping_path}: bloco {bloco!r} ausente")
    return conteudo


def _load_table(spec: dict[str, Any], root: Path) -> tuple[list[_Registro], dict[str, Any], Path]:
    """Lê um arquivo canônico e projeta cada registro pelo `fields:` do mapeamento."""
    caminho = root / spec["path"]
    try:
        bruto = json.loads(caminho.read_text(encoding="utf-8"))
    except FileNotFoundError as erro:
        raise RefLoadError(f"{caminho}: arquivo de referência ausente") from erro
    except json.JSONDecodeError as erro:
        raise RefLoadError(f"{caminho}: JSON inválido ({erro})") from erro

    chave_raiz = spec["root"]
    if not isinstance(bruto, dict) or chave_raiz not in bruto:
        raise RefLoadError(f"{caminho}: chave-raiz {chave_raiz!r} ausente")
    conteudo = bruto[chave_raiz]

    container = spec["container"]
    if container == "dict":
        if not isinstance(conteudo, dict):
            raise RefLoadError(
                f"{caminho}: `container: dict` mas {chave_raiz!r} é {type(conteudo).__name__}"
            )
        pares: list[tuple[str | None, Any]] = list(conteudo.items())
    elif container == "list":
        if not isinstance(conteudo, list):
            raise RefLoadError(
                f"{caminho}: `container: list` mas {chave_raiz!r} é {type(conteudo).__name__}"
            )
        pares = [(None, registro) for registro in conteudo]
    else:
        raise RefLoadError(f"{caminho}: `container: {container!r}` desconhecido; use dict ou list")

    campos = spec["fields"]
    registros: list[_Registro] = []
    for posicao, (chave, origem) in enumerate(pares):
        rotulo = chave if chave is not None else f"posição {posicao}"
        if not isinstance(origem, dict):
            raise RefLoadError(f"{caminho}: registro {rotulo} é {type(origem).__name__}, não objeto")
        projetado = {}
        for destino, fonte in campos.items():
            if fonte not in origem:
                raise RefLoadError(
                    f"{caminho}: registro {rotulo} não tem o campo mapeado {fonte!r} (-> {destino})"
                )
            projetado[destino] = origem[fonte]
        registros.append(_Registro(chave=chave, campos=projetado))

    meta: dict[str, Any] = {}
    for destino, fonte in (spec.get("meta") or {}).items():
        if fonte not in bruto:
            raise RefLoadError(f"{caminho}: chave de raiz mapeada {fonte!r} ausente (-> meta.{destino})")
        meta[destino] = bruto[fonte]

    return registros, meta, caminho


def _coerce_nivel(valor: Any, rotulo: str) -> int | None:
    """`"1"|"2"|"3"|null` -> `int|None`. Rejeita `int` de propósito: a fonte usa string, e aceitar
    os dois esconderia uma mudança de formato do coletor."""
    if valor is None:
        return None
    if isinstance(valor, str) and valor in NIVEIS_VALIDOS:
        return NIVEIS_VALIDOS[valor]
    raise RefLoadError(f"{rotulo}: nivel {valor!r} fora de {{\"1\", \"2\", \"3\", null}}")


def _exigir_chave_igual_id(registro: _Registro, ident: Any, rotulo: str) -> None:
    if registro.chave is not None and registro.chave != ident:
        raise RefLoadError(
            f"{rotulo}: chave do container {registro.chave!r} != campo id {ident!r} "
            "(`container: dict` promete que a chave é o id)"
        )


def _build_municipios(registros: list[_Registro], caminho: Path) -> dict[str, Municipio]:
    municipios: dict[str, Municipio] = {}
    for registro in registros:
        campos = registro.campos
        ident = campos["id"]
        rotulo = f"{caminho.name}: município {ident}"
        _exigir_chave_igual_id(registro, ident, rotulo)

        status = campos["status"]
        if status not in SITUACAO_POR_STATUS:
            raise RefLoadError(f"{rotulo}: status {status!r} fora de {sorted(SITUACAO_POR_STATUS)}")
        esperada = SITUACAO_POR_STATUS[status]
        if campos["situacao_gac"] != esperada:
            raise RefLoadError(
                f"{rotulo}: situacao_gac {campos['situacao_gac']!r} discorda de status "
                f"{status!r} (esperado {esperada!r})"
            )
        if ident in municipios:
            raise RefLoadError(f"{rotulo}: id duplicado")

        municipios[ident] = Municipio(
            id=ident,
            nome=campos["nome"],
            codigo_ibge=campos["codigo_ibge"],
            consorcio_id=campos["consorcio_id"],
            consorcio_nome=campos["consorcio_nome"],
            nivel_habilitacao=_coerce_nivel(campos["nivel_habilitacao"], rotulo),
            situacao_gac=campos["situacao_gac"],
            status=status,
            apto_licenciar=status == STATUS_HABILITADO,
            fonte_url=campos["fonte_url"],
            data_consulta=campos["data_consulta"],
        )
    return municipios


def _build_consorcios(
    registros: list[_Registro], membro_fields: dict[str, str], caminho: Path
) -> tuple[dict[str, Consorcio], dict[str, list[dict[str, Any]]]]:
    """Devolve os consórcios e, à parte, os membros brutos projetados — só para a conferência."""
    consorcios: dict[str, Consorcio] = {}
    membros_brutos: dict[str, list[dict[str, Any]]] = {}
    for registro in registros:
        campos = registro.campos
        ident = campos["id"]
        rotulo = f"{caminho.name}: consórcio {ident}"
        _exigir_chave_igual_id(registro, ident, rotulo)
        if ident in consorcios:
            raise RefLoadError(f"{rotulo}: id duplicado")

        crus = campos["municipios"]
        if not isinstance(crus, list):
            raise RefLoadError(f"{rotulo}: `municipios` é {type(crus).__name__}, não lista")
        projetados = []
        for posicao, membro in enumerate(crus):
            if not isinstance(membro, dict):
                raise RefLoadError(
                    f"{rotulo}: membro na posição {posicao} é {type(membro).__name__}, não objeto"
                )
            projetado = {}
            for destino, fonte in membro_fields.items():
                if fonte not in membro:
                    raise RefLoadError(
                        f"{rotulo}: membro na posição {posicao} não tem o campo mapeado "
                        f"{fonte!r} (-> {destino})"
                    )
                projetado[destino] = membro[fonte]
            projetados.append(projetado)

        total = campos["total_municipios"]
        if not isinstance(total, int) or isinstance(total, bool):
            raise RefLoadError(f"{rotulo}: total_municipios {total!r} não é inteiro")

        consorcios[ident] = Consorcio(
            id=ident,
            nome=campos["nome"],
            total_municipios=total,
            membros=tuple(m["codigo_ibge"] for m in projetados),
        )
        membros_brutos[ident] = projetados
    return consorcios, membros_brutos


def _check_invariants(
    municipios: dict[str, Municipio],
    consorcios: dict[str, Consorcio],
    membros_brutos: dict[str, list[dict[str, Any]]],
    esperado: dict[str, Any],
) -> None:
    """Acumula todos os problemas e levanta uma vez. Ver o docstring do módulo."""
    problemas: list[str] = []

    if len(municipios) != esperado["municipios_esperados"]:
        problemas.append(
            f"municípios: {len(municipios)}, esperado {esperado['municipios_esperados']}"
        )
    if len(consorcios) != esperado["consorcios_esperados"]:
        problemas.append(
            f"consórcios: {len(consorcios)}, esperado {esperado['consorcios_esperados']}"
        )
    soma = sum(c.total_municipios for c in consorcios.values())
    if soma != esperado["soma_total_municipios"]:
        problemas.append(
            f"soma de total_municipios: {soma}, esperado {esperado['soma_total_municipios']}"
        )

    for municipio in municipios.values():
        if (municipio.nivel_habilitacao is None) != (municipio.status == STATUS_NAO_HABILITADO):
            problemas.append(
                f"município {municipio.id}: nivel {municipio.nivel_habilitacao!r} com status "
                f"{municipio.status!r} — nivel é nulo exatamente nos não habilitados"
            )
        if (municipio.consorcio_nome is None) != (municipio.consorcio_id is None):
            problemas.append(
                f"município {municipio.id}: consorcio_id {municipio.consorcio_id!r} e "
                f"consorcio_nome {municipio.consorcio_nome!r} — nulos juntos ou nenhum"
            )
        if municipio.consorcio_id is None:
            continue
        consorcio = consorcios.get(municipio.consorcio_id)
        if consorcio is None:
            problemas.append(
                f"município {municipio.id}: consorcio_id {municipio.consorcio_id!r} não está "
                f"entre os {len(consorcios)} consórcios"
            )
        elif municipio.consorcio_nome != consorcio.nome:
            problemas.append(
                f"município {municipio.id}: consorcio_nome {municipio.consorcio_nome!r} != "
                f"nome do consórcio {municipio.consorcio_id} ({consorcio.nome!r})"
            )

    todos_membros = [codigo for c in consorcios.values() for codigo in c.membros]
    repetidos = sorted({c for c in todos_membros if todos_membros.count(c) > 1})
    if repetidos:
        problemas.append(f"municípios em mais de um consórcio: {repetidos}")
    ausentes = sorted(set(todos_membros) - set(municipios))
    if ausentes:
        problemas.append(f"membros que não estão entre os {len(municipios)} municípios: {ausentes}")

    for consorcio in consorcios.values():
        if consorcio.total_municipios != len(consorcio.membros):
            problemas.append(
                f"consórcio {consorcio.id}: total_municipios {consorcio.total_municipios} != "
                f"{len(consorcio.membros)} membros listados"
            )

    for consorcio_id, membros in membros_brutos.items():
        for membro in membros:
            municipio = municipios.get(membro["codigo_ibge"])
            if municipio is None:
                continue  # já reportado em `ausentes`
            if municipio.consorcio_id != consorcio_id:
                problemas.append(
                    f"consórcio {consorcio_id}: lista o município {municipio.id}, que aponta "
                    f"para {municipio.consorcio_id!r}"
                )
            rotulo = f"consórcio {consorcio_id}, membro {municipio.id}"
            if membro["nome"] != municipio.nome:
                problemas.append(f"{rotulo}: nome {membro['nome']!r} != {municipio.nome!r}")
            if membro["status"] != municipio.status:
                problemas.append(f"{rotulo}: status {membro['status']!r} != {municipio.status!r}")
            try:
                nivel = _coerce_nivel(membro["nivel_habilitacao"], rotulo)
            except RefLoadError as erro:
                problemas.append(str(erro))
            else:
                if nivel != municipio.nivel_habilitacao:
                    problemas.append(
                        f"{rotulo}: nivel {nivel!r} != {municipio.nivel_habilitacao!r}"
                    )

    if not problemas:
        return
    mostrados = problemas[:_LIMITE_PROBLEMAS]
    resto = len(problemas) - len(mostrados)
    detalhe = "\n  - ".join(mostrados)
    if resto:
        detalhe += f"\n  ... e mais {resto}"
    raise RefLoadError(f"invariantes de referência violadas:\n  - {detalhe}")


def _resolver_data_consulta(
    municipios: dict[str, Municipio], meta_consorcios: dict[str, Any]
) -> str:
    """Um único `data_consulta` para o `meta.refs_data_consulta` do manifesto (§11)."""
    datas = {m.data_consulta for m in municipios.values()}
    if len(datas) != 1:
        raise RefLoadError(f"data_consulta divergente entre os municípios: {sorted(datas)}")
    (data,) = datas
    outra = meta_consorcios.get("data_consulta")
    if outra is not None and outra != data:
        raise RefLoadError(
            f"data_consulta dos consórcios ({outra!r}) != a dos municípios ({data!r}); "
            "as referências vieram de coletas diferentes — recolete antes de usar"
        )
    return data


def load_reference_data(
    mapping_path: Path = MAPPING_PATH, root: Path = REPO_ROOT
) -> ReferenceData:
    """Carrega as referências canônicas e valida as invariantes. AC8.

    `root` é a raiz a partir da qual os `path:` do mapeamento resolvem — parametrizado para os
    testes negativos, que copiam os JSONs para `tmp_path` e corrompem um campo por vez.
    """
    mapeamento = _load_mapping(mapping_path)

    registros_m, meta_m, caminho_m = _load_table(mapeamento["municipios"], root)
    municipios = _build_municipios(registros_m, caminho_m)

    spec_c = mapeamento["consorcios"]
    registros_c, meta_c, caminho_c = _load_table(spec_c, root)
    membro_fields = spec_c.get("membro_fields") or {}
    if "codigo_ibge" not in membro_fields:
        raise RefLoadError(f"{mapping_path}: consorcios.membro_fields precisa mapear `codigo_ibge`")
    consorcios, membros_brutos = _build_consorcios(registros_c, membro_fields, caminho_c)

    _check_invariants(municipios, consorcios, membros_brutos, mapeamento["invariantes"])

    # Vocabulários depois das referências, e não em paralelo: as contagens 417/29/386 são o que
    # mais provavelmente muda entre coletas, e falhar nelas primeiro dá a mensagem mais útil.
    tipologias, avisos = load_tipologias(mapeamento["tipologias"], root)
    minerais, indice_minerais = load_minerais(mapeamento["minerais"], root)

    fonte_urls = {m.fonte_url for m in municipios.values()}
    fonte_urls |= {url for url in (meta_m.get("fonte_url"), meta_c.get("fonte_url")) if url}

    return ReferenceData(
        municipios=municipios,
        consorcios=consorcios,
        data_consulta=_resolver_data_consulta(municipios, meta_c),
        fonte_urls=tuple(sorted(fonte_urls)),
        tipologias=tipologias,
        minerais=minerais,
        indice_substancias=build_substancia_index(tipologias),
        indice_minerais=indice_minerais,
        avisos=avisos,
    )


if __name__ == "__main__":
    refs = load_reference_data()
    aptos = sum(1 for m in refs.municipios.values() if m.apto_licenciar)
    membros = {c for consorcio in refs.consorcios.values() for c in consorcio.membros}
    soma = sum(c.total_municipios for c in refs.consorcios.values())
    sem_consorcio_aptos = sum(
        1 for m in refs.municipios.values() if m.consorcio_id is None and m.apto_licenciar
    )
    print(f"{len(refs.municipios)} municípios ({aptos} aptos / {len(refs.municipios) - aptos} não aptos)")
    print(f"{len(refs.consorcios)} consórcios (soma={soma}, membros distintos={len(membros)})")
    print(f"{sem_consorcio_aptos} habilitados sem consórcio")
    ambiguas = sum(1 for codigos in refs.indice_substancias.values() if len(codigos) > 1)
    print(f"data_consulta: {refs.data_consulta}")
    print(
        f"{len(refs.tipologias)} tipologias · {len(refs.indice_substancias)} chaves de substância "
        f"({ambiguas} ambíguas) · {len(refs.minerais)} minerais"
    )
    for url in refs.fonte_urls:
        print(f"fonte: {url}")
    for aviso in refs.avisos:
        print(f"aviso: {aviso}")
    print("invariantes: OK")
