"""Coleta da habilitação GAC (Gestão Ambiental Compartilhada) por município.

CONTEXTO VERIFICADO (01/08/2026): a tabela pública não fica em
gac.meioambiente.ba.gov.br diretamente — essa página só embute, via <iframe>,
um sistema à parte:

    https://gestor.meioambiente.ba.gov.br/Consultas/ConsultaGAC/

Esse sistema é HTML puro servido por GET (sem JS, sem sessão, sem cookies) —
dá para automatizar de ponta a ponta:

  - Listagem paginada: ?PaginaMostrada={0..N}&muni=&situacao=&nivel=&juridico=
    (0-indexado, ~15 municípios por página, 417 municípios no total)
    Colunas: Nº, MUNICÍPIO, SITUAÇÃO (CAPAZ / NÃO CAPAZ / NÃO INFORMOU),
    NÍVEL (1/2/3 ou "-"), DATA DE PUBLICAÇÃO. Cada linha tem um id (`dado=`)
    que leva à página de detalhe.
  - Detalhe por município: Include/Inc_Registros.php?dado={id}
    Campos extra: TERRITÓRIO, DATA DE SOLICITAÇÃO, UNIDADE RESPONSÁVEL,
    CONSÓRCIO. NÃO traz tipologia delegada — "nível" é só o nível de gestão
    (1 a 3); o cruzamento nível → tipologias delegadas vem do Anexo Único da
    Resolução CEPRAM 4.327/2013 (Escopo C.1/C.4), não desta fonte.

Nomes de município aqui vêm em CAIXA ALTA sem acento (ex: "ABARE" em vez de
"Abaré") — o casamento com o código IBGE usa scripts/lib/municipios_ba.py,
que já normaliza acento/caixa dos dois lados.

Escopo (decisão do time): coletar para TODOS os municípios com SITUAÇÃO =
CAPAZ, não um recorte fixo de 10 nem uma amostra. NÃO CAPAZ e NÃO INFORMOU
também são salvos (para os dois primeiros ramos de competência: ESTADUAL por
falta de habilitação, e SEM_EVIDENCIA), só não entram na coleta de leis
municipais/contatos — essa é filtrada a CAPAZ pelos scripts seguintes.

Consórcios: o mesmo formulário tem um dropdown `juridico` com os ~29 consórcios
públicos (id + nome) e a listagem aceita filtrar por ele (`?juridico={id}`),
com paginação normal por cima do filtro. Isso é bem mais barato que abrir a
página de detalhe dos 417 municípios um a um: 29 consórcios × 1-2 páginas cada
já devolve o município-membro de cada um. Confirmado em 01/08/2026: soma dos
29 consórcios = 386 municípios: os outros 31 não pertencem a nenhum consórcio
listado (`juridico` vazio no formulário) — ficam com `consorcio: null`.

Uso:
  python scripts/collect_gac.py scrape                 # tabela completa, sem detalhe (rápido)
  python scripts/collect_gac.py scrape --com-detalhe    # + território/consórcio por município
  python scripts/collect_gac.py scrape --municipio Jacobina   # só 1, para conferência pontual
  python scripts/collect_gac.py consorcios              # lista de consórcios + municípios-membro
                                                          # e enriquece municipios_habilitados.json
"""

from __future__ import annotations

import argparse
import json
import re
import sys
from datetime import date
from pathlib import Path

from bs4 import BeautifulSoup

sys.path.insert(0, str(Path(__file__).resolve().parent))
from lib.http import build_session, polite_get  # noqa: E402
from lib.municipios_ba import by_nome  # noqa: E402

ROOT = Path(__file__).resolve().parents[1]
RAW_DIR = ROOT / "data" / "raw" / "gac"
PROCESSED_PATH = ROOT / "data" / "processed" / "municipios_habilitados.json"
CONSORCIOS_PATH = ROOT / "data" / "processed" / "consorcios.json"

BASE_URL = "https://gestor.meioambiente.ba.gov.br/Consultas/ConsultaGAC/"
DETALHE_URL = BASE_URL + "Include/Inc_Registros.php"

SITUACAO_PARA_STATUS = {
    "CAPAZ": "habilitado",
    "NÃO CAPAZ": "nao_habilitado",
    "NAO CAPAZ": "nao_habilitado",
    "NÃO INFORMOU": "sem_evidencia",
    "NAO INFORMOU": "sem_evidencia",
}

MAX_PAGINAS = 60  # trava de segurança; a tabela tem ~28 páginas hoje


def _parse_pagina(html: str) -> list[dict]:
    soup = BeautifulSoup(html, "lxml")
    linhas = soup.select("tr.dataField")
    registros = []
    for tr in linhas:
        onclick = tr.get("onclick", "")
        m = re.search(r"dado=(\d+)", onclick)
        if not m:
            continue
        celulas = [td.get_text(strip=True) for td in tr.find_all("td")]
        if len(celulas) < 5:
            continue
        _numero, municipio, situacao, nivel, data_publicacao = celulas[:5]
        registros.append(
            {
                "dado_id": m.group(1),
                "municipio_bruto": municipio,
                "situacao_bruta": situacao,
                "nivel": None if nivel.strip() == "-" else nivel.strip(),
                "data_publicacao": data_publicacao or None,
            }
        )
    return registros


def _parse_detalhe(html: str) -> dict:
    """Pareia cada linha de rótulo (`dataLabel`/`dataFim`) com a linha de valor
    seguinte (`dataField`) — os <td> de rótulo e valor usam a mesma classe CSS
    ('center'), então não dá pra distinguir por seletor, só pela ordem das <tr>.
    """
    soup = BeautifulSoup(html, "lxml")
    tabela = soup.select_one("table#resultado")
    if tabela is None:
        return {}

    campos: dict[str, str] = {}
    rotulos_pendentes: list[str] | None = None
    for tr in tabela.find_all("tr"):
        classes = tr.get("class") or []
        textos = [td.get_text(strip=True) for td in tr.find_all("td")]
        if "dataLabel" in classes or "dataFim" in classes:
            rotulos_pendentes = textos
        elif "dataField" in classes and rotulos_pendentes is not None:
            if len(rotulos_pendentes) == len(textos):
                campos.update(dict(zip(rotulos_pendentes, textos)))
            rotulos_pendentes = None

    return {
        "territorio": campos.get("TERRITÓRIO"),
        "data_solicitacao": campos.get("DATA DE SOLICITAÇÃO"),
        "unidade_responsavel": campos.get("UNIDADE RESPONSÁVEL"),
        "consorcio": campos.get("CONSÓRCIO"),
    }


def _buscar_pagina(session, pagina_idx: int, municipio_filtro: str = "", juridico_filtro: str = "") -> str:
    params = {
        "PaginaMostrada": pagina_idx,
        "muni": municipio_filtro,
        "situacao": "",
        "nivel": "",
        "juridico": juridico_filtro,
    }
    resp = polite_get(session, BASE_URL, params=params, delay=0.4)
    resp.raise_for_status()
    return resp.text


def _extrair_lista_consorcios(html: str) -> list[dict]:
    soup = BeautifulSoup(html, "lxml")
    select = soup.select_one("select#juridico")
    if select is None:
        return []
    return [
        {"consorcio_id": o.get("value"), "consorcio_nome": o.get_text(strip=True)}
        for o in select.find_all("option")
        if o.get("value")
    ]


def scrape_consorcios() -> dict:
    session = build_session()
    RAW_DIR.mkdir(parents=True, exist_ok=True)
    hoje = date.today().isoformat()

    html_inicial = _buscar_pagina(session, 0)
    consorcios_lista = _extrair_lista_consorcios(html_inicial)

    consorcios: dict[str, dict] = {}
    nao_casados: set[str] = set()
    for consorcio in consorcios_lista:
        cid = consorcio["consorcio_id"]
        membros = []
        for pagina_idx in range(MAX_PAGINAS):
            html = _buscar_pagina(session, pagina_idx, juridico_filtro=cid)
            (RAW_DIR / f"{hoje}_consorcio_{cid}_pagina_{pagina_idx:02d}.html").write_text(
                html, encoding="utf-8"
            )
            registros = _parse_pagina(html)
            if not registros:
                break
            membros.extend(registros)

        membros_resolvidos = []
        for registro in membros:
            match = by_nome(registro["municipio_bruto"])
            if match is None:
                nao_casados.add(registro["municipio_bruto"])
                continue
            membros_resolvidos.append(
                {
                    "codigo_ibge": match["codigo_ibge"],
                    "municipio": match["municipio"],
                    "status": SITUACAO_PARA_STATUS.get(registro["situacao_bruta"], "sem_evidencia"),
                    "nivel": registro["nivel"],
                }
            )

        consorcios[cid] = {
            "consorcio_id": cid,
            "nome": consorcio["consorcio_nome"],
            "total_municipios": len(membros_resolvidos),
            "municipios": membros_resolvidos,
        }
        print(f"[{cid}] {consorcio['consorcio_nome']} -> {len(membros_resolvidos)} município(s)")

    if nao_casados:
        print(f"AVISO: {len(nao_casados)} nome(s) não casaram com a malha IBGE-BA: {', '.join(sorted(nao_casados))}")

    return {
        "gerado_em": hoje,
        "fonte_url": BASE_URL,
        "data_consulta": hoje,
        "consorcios": consorcios,
    }


def enriquecer_municipios_com_consorcio(consorcios_payload: dict) -> None:
    """Adiciona consorcio_id/consorcio_nome em municipios_habilitados.json,
    sem precisar abrir a página de detalhe dos 417 municípios um a um."""
    if not PROCESSED_PATH.exists():
        print(f"AVISO: {PROCESSED_PATH.name} não existe ainda — rode `scrape` antes de `consorcios`.")
        return

    por_municipio: dict[str, dict] = {}
    for consorcio in consorcios_payload["consorcios"].values():
        for membro in consorcio["municipios"]:
            por_municipio[membro["codigo_ibge"]] = {
                "consorcio_id": consorcio["consorcio_id"],
                "consorcio_nome": consorcio["nome"],
            }

    lista = json.loads(PROCESSED_PATH.read_text(encoding="utf-8"))
    sem_consorcio = 0
    for codigo, dados in lista["municipios"].items():
        info = por_municipio.get(codigo)
        dados["consorcio_id"] = info["consorcio_id"] if info else None
        dados["consorcio_nome"] = info["consorcio_nome"] if info else None
        if info is None:
            sem_consorcio += 1

    PROCESSED_PATH.write_text(json.dumps(lista, ensure_ascii=False, indent=2, sort_keys=True), encoding="utf-8")
    print(f"{PROCESSED_PATH.name} enriquecido com consórcio ({sem_consorcio} município(s) sem consórcio).")


def scrape(com_detalhe: bool, municipio_filtro: str | None) -> dict:
    session = build_session()
    RAW_DIR.mkdir(parents=True, exist_ok=True)
    hoje = date.today().isoformat()

    brutos: list[dict] = []
    for pagina_idx in range(MAX_PAGINAS):
        html = _buscar_pagina(session, pagina_idx, municipio_filtro or "")
        (RAW_DIR / f"{hoje}_pagina_{pagina_idx:02d}.html").write_text(html, encoding="utf-8")
        registros = _parse_pagina(html)
        if not registros:
            break
        brutos.extend(registros)

    municipios: dict[str, dict] = {}
    nao_casados = []
    for registro in brutos:
        match = by_nome(registro["municipio_bruto"])
        if match is None:
            nao_casados.append(registro["municipio_bruto"])
            continue

        entrada = {
            "codigo_ibge": match["codigo_ibge"],
            "municipio": match["municipio"],
            "status": SITUACAO_PARA_STATUS.get(registro["situacao_bruta"], "sem_evidencia"),
            "situacao_gac": registro["situacao_bruta"],
            "nivel": registro["nivel"],
            "data_publicacao": registro["data_publicacao"],
            "fonte_url": BASE_URL,
            "data_consulta": hoje,
        }

        if com_detalhe:
            detalhe_html = polite_get(
                session, DETALHE_URL, params={"dado": registro["dado_id"]}, delay=0.3
            ).text
            (RAW_DIR / f"{hoje}_detalhe_{registro['dado_id']}.html").write_text(
                detalhe_html, encoding="utf-8"
            )
            entrada.update(_parse_detalhe(detalhe_html))
            entrada["fonte_url"] = f"{DETALHE_URL}?dado={registro['dado_id']}"

        municipios[match["codigo_ibge"]] = entrada

    if nao_casados:
        print(
            f"AVISO: {len(nao_casados)} nome(s) da tabela GAC não casaram com a malha IBGE-BA "
            f"(conferir manualmente): {', '.join(nao_casados)}"
        )

    return {"gerado_em": hoje, "fonte_url": BASE_URL, "municipios": municipios}


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    sub = parser.add_subparsers(dest="comando", required=True)

    p_scrape = sub.add_parser("scrape", help="raspa a tabela completa de capacidade dos municípios")
    p_scrape.add_argument("--com-detalhe", action="store_true", help="busca também território/consórcio")
    p_scrape.add_argument("--municipio", default=None, help="filtra por 1 município (usa o campo `muni` do site)")

    sub.add_parser("consorcios", help="lista consórcios + municípios-membro, enriquece municipios_habilitados.json")

    args = parser.parse_args()
    if args.comando == "scrape":
        resultado = scrape(args.com_detalhe, args.municipio)
        PROCESSED_PATH.parent.mkdir(parents=True, exist_ok=True)
        PROCESSED_PATH.write_text(
            json.dumps(resultado, ensure_ascii=False, indent=2, sort_keys=True), encoding="utf-8"
        )
        contagem = {}
        for m in resultado["municipios"].values():
            contagem[m["status"]] = contagem.get(m["status"], 0) + 1
        print(f"\n{len(resultado['municipios'])} município(s) -> {PROCESSED_PATH.relative_to(ROOT)}")
        print(f"por status: {contagem}")
    elif args.comando == "consorcios":
        resultado = scrape_consorcios()
        CONSORCIOS_PATH.parent.mkdir(parents=True, exist_ok=True)
        CONSORCIOS_PATH.write_text(
            json.dumps(resultado, ensure_ascii=False, indent=2, sort_keys=True), encoding="utf-8"
        )
        print(f"\n{len(resultado['consorcios'])} consórcio(s) -> {CONSORCIOS_PATH.relative_to(ROOT)}")
        enriquecer_municipios_com_consorcio(resultado)


if __name__ == "__main__":
    main()
