"""Leitor DBF mínimo para os dois shapefiles de `data_source/`.

Cópia da lógica de `scripts/lib/municipios_ba.py:25` (`_read_dbf`), não import: `scripts/`
não é pacote (sem `__init__.py`) e usa hack de `sys.path` — ver `scripts/collect_gac.py:60`.
Acoplar um script de coleta pontual ao produto de longa vida é pior que 40 linhas duplicadas
(decisão C do `research_pipeline/IMPLEMENTATION_PLAN.md`). `common/tests/test_dbf.py` afirma
paridade byte a byte com o original nos dois arquivos reais, para que ninguém derive um lado
sem quebrar o outro.

Por que um parser à mão em vez de `dbfread`/geopandas: decisão 19 do GOAL.md — este leitor já
lê os dois arquivos que o projeto precisa, e os dois são dBASE III sem campo memo.

**O `encoding` vem do `.cpg` ao lado do `.dbf`** — UTF-8 nos dois arquivos deste repo. Ler com
o encoding errado **não levanta erro**, só corrompe em silêncio os nomes acentuados; o
comentário em `scripts/lib/municipios_ba.py:26-28` registra que isso já aconteceu aqui.

**Todo valor volta como `str` stripado**, inclusive os campos numéricos (`N`) como `AREA_HA` e
`AREA_KM2`. Quem quiser número converte — o tipo declarado no header é ignorado de propósito,
porque nenhum consumidor atual precisa dele.
"""

from __future__ import annotations

import struct
from pathlib import Path

DBASE_III = 0x03
"""Único byte de versão aceito. `BA.dbf` e `BA_Municipios_2025.dbf` são os dois `0x03`."""

FLAG_ATIVO = 0x20
"""Primeiro byte do registro quando ele não está deletado. `0x2A` (`*`) é deletado."""


class DbfError(Exception):
    """Arquivo DBF fora do subconjunto que este leitor sabe ler."""


def read_dbf(path: Path, encoding: str = "utf-8") -> list[dict[str, str]]:
    """Lê `path` e devolve um dict por registro, todo valor `str` stripado.

    Levanta `DbfError` em vez de devolver dado errado em silêncio quando o arquivo sai do
    subconjunto suportado. Essas duas guardas são o único acréscimo sobre o `_read_dbf`
    original, que ignora as duas condições:

    - **versão diferente de dBASE III** — `0x83` (com memo) e `0x30` (Visual FoxPro) têm
      layout de header diferente e seriam lidos como lixo.
    - **registro marcado como deletado** — o original pula a flag de deleção sem olhá-la,
      então um `.dbf` regenerado com registros marcados devolveria contagem errada sem
      avisar. Hoje há zero deletados nos dois arquivos reais.
    """
    data = path.read_bytes()
    if not data:
        raise DbfError(f"{path}: arquivo vazio")

    versao = data[0]
    if versao != DBASE_III:
        raise DbfError(
            f"{path}: versão DBF 0x{versao:02x}, esperado 0x{DBASE_III:02x} (dBASE III). "
            "Layout de header diferente — ler assim devolveria lixo silencioso."
        )

    n_records = struct.unpack("<I", data[4:8])[0]
    header_size = struct.unpack("<H", data[8:10])[0]
    record_size = struct.unpack("<H", data[10:12])[0]

    fields = []
    pos = 32
    while data[pos] != 0x0D:
        name = data[pos : pos + 11].split(b"\x00")[0].decode("ascii")
        length = data[pos + 16]
        fields.append((name, length))
        pos += 32

    records = []
    for i in range(n_records):
        start = header_size + i * record_size
        rec = data[start : start + record_size]
        if rec[0] != FLAG_ATIVO:
            raise DbfError(
                f"{path}: registro {i} tem flag de deleção 0x{rec[0]:02x}, esperado "
                f"0x{FLAG_ATIVO:02x}. Este leitor não filtra deletados — a contagem sairia errada."
            )
        offset = 1  # primeiro byte é a flag de deleção
        row = {}
        for name, length in fields:
            row[name] = rec[offset : offset + length].decode(encoding).strip()
            offset += length
        records.append(row)
    return records
