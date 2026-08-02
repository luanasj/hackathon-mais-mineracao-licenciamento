"""
Adaptador C -> fixtures (gap #1 do ENTENDIMENTO_PROJETO.md).

Le as fontes reais em data/processed/ e data_source/ e gera o conteudo
de frontend/src/data/fixtures.ts (TIPOLOGIAS, MUNICIPIOS, REGRAS), na forma
que os schemas congelados (frontend/src/lib/schemas.ts) exigem.

Duas fontes de tipologia, NAO equivalentes:
  - data/processed/cepram_divisao_b_mineracao.json: extraido do PDF oficial
    (Resolucao CEPRAM 4.327/2013), verificado. So cobre B3 (5) e B4.1-B4.4 (4)
    -- 9 tipologias. B1/B2 estao ausentes do PDF (paginas em branco, confirmado).
  - data_source/Anexo_IV_Divisao_B_Mineracao_Bahia.xlsx: cobre B1/B2 tambem,
    mas o proprio JSON acima documenta que a planilha DIVERGE do PDF nos itens
    que da para comparar (B3/B4) -- checada e descartada como fonte para esses
    grupos. Usada aqui SO para B1/B2 (onde e a unica fonte disponivel), e para
    B4.5/B4.6 (que nao aparecem no PDF), sempre com verificado=False e nota
    explicita de divergencia conhecida.

Uso: .venv/Scripts/python.exe scripts/build_fixtures.py > frontend/src/data/fixtures.ts
"""
import json
import re
import sys

import openpyxl

XLSX_SRC = "data_source/Anexo_IV_Divisao_B_Mineracao_Bahia.xlsx"
CEPRAM_JSON = "data/processed/cepram_divisao_b_mineracao.json"
MUNICIPIOS_JSON = "data/processed/municipios_habilitados.json"

POTENCIAL = {"A": "grande", "M": "medio", "P": "pequeno"}

NORMA_CORRETA = "Resolução CEPRAM 4.327/2013"
SECAO_CORRETA = "Anexo Único — Divisão B: Mineração"


def slug_codigo(codigo: str) -> str:
    return "b" + codigo[1:].replace(".", "-")


def ts_string(s: str) -> str:
    return "'" + s.replace("\\", "\\\\").replace("'", "\\'") + "'"


def num(s: str) -> int:
    return int(re.search(r"[\d.]+", s).group().replace(".", ""))


# ---------------------------------------------------------------------------
# Fonte 1 (nao verificada) -- xlsx, so para B1/B2/B4.5/B4.6
# ---------------------------------------------------------------------------

def parse_faixas_xlsx(pequeno, medio, grande, codigo):
    if codigo == "B4.2":
        g = num(grande)
        return [
            {"faixa": "medio", "min": 0, "max": g},
            {"faixa": "grande", "min": g, "max": None},
        ]
    p = num(pequeno)
    m_matches = re.findall(r"[\d.]+", medio)
    m_min, m_max = int(m_matches[0].replace(".", "")), int(m_matches[1].replace(".", ""))
    g = num(grande)
    assert p == m_min and m_max == g, (pequeno, medio, grande)
    return [
        {"faixa": "pequeno", "min": 0, "max": p},
        {"faixa": "medio", "min": p, "max": g},
        {"faixa": "grande", "min": g, "max": None},
    ]


def campos_condicionais(atividade):
    campos = ["supressao_vegetacao", "explosivos"]
    if "Recursos Hídricos" in atividade:
        campos.insert(1, "recurso_hidrico")
    return campos


def carregar_xlsx():
    wb = openpyxl.load_workbook(XLSX_SRC, data_only=True)
    ws = wb["Divisão B - Mineração"]
    grupo_atual = None
    entradas = {}
    for row in ws.iter_rows(min_row=2, max_row=25, values_only=True):
        codigo = row[0]
        if codigo is None:
            continue
        if codigo.startswith("Grupo"):
            grupo_atual = codigo
            continue
        if re.match(r"^B\d\.\d ", codigo):
            continue
        (_, atividade, unidade, pequeno, medio, grande, pp, *_) = row
        try:
            faixas = parse_faixas_xlsx(pequeno, medio, grande, codigo)
        except (AttributeError, AssertionError):
            # B4.2 tem celula '#ERROR!' em pequeno -- so a fronteira grande e util
            g = num(grande)
            faixas = [
                {"faixa": "medio", "min": 0, "max": g},
                {"faixa": "grande", "min": g, "max": None},
            ]
        entradas[codigo] = {
            "id": slug_codigo(codigo),
            "codigo": codigo,
            "atividade": atividade,
            "grupo": grupo_atual,
            "faixas": faixas,
            "potencial": POTENCIAL[pp],
            "campos": campos_condicionais(atividade),
        }
    return entradas


# ---------------------------------------------------------------------------
# Fonte 2 (verificada) -- PDF oficial via JSON extraido
# ---------------------------------------------------------------------------

def parse_faixas_pdf(porte):
    p = num(porte["pequeno"])
    partes = re.findall(r"[\d.]+", porte["medio"])
    m_min = int(partes[0].replace(".", ""))
    m_max = int(partes[1].replace(".", ""))
    g = num(porte["grande"])
    assert p == m_min and m_max == g, porte
    return [
        {"faixa": "pequeno", "min": 0, "max": p},
        {"faixa": "medio", "min": p, "max": g},
        {"faixa": "grande", "min": g, "max": None},
    ]


def carregar_cepram_json():
    d = json.load(open(CEPRAM_JSON, encoding="utf-8"))
    tipologias = {}
    niveis_por_tipologia = {}
    for g in d["grupos"]:
        for t in g["tipologias"]:
            codigo = t["codigo"]
            faixas = parse_faixas_pdf(t["porte"])
            tipologias[codigo] = {
                "id": slug_codigo(codigo),
                "codigo": codigo,
                "atividade": t["tipologia"],
                "grupo": f"Divisão B — Mineração · {g['nome']} ({g['grupo']})",
                "faixas": faixas,
                "potencial": POTENCIAL[t["potencial_poluidor"]],
                "campos": campos_condicionais(t["tipologia"]),
                "pagina": t["pagina_fonte"],
            }
            niveis_por_tipologia[codigo] = t["nivel_gestao_municipal"]
    return tipologias, niveis_por_tipologia


# ---------------------------------------------------------------------------
# Emissao TS
# ---------------------------------------------------------------------------

def ts_faixas(faixas):
    linhas = []
    for f in faixas:
        maxv = "null" if f["max"] is None else f["max"]
        linhas.append(f"      {{ faixa: '{f['faixa']}', min: {f['min']}, max: {maxv} }},")
    return "\n".join(linhas)


def emitir_tipologia(e, verificado, dispositivo, norma=None):
    out = []
    out.append("  {")
    out.append(f"    id: {ts_string(e['id'])},")
    out.append(f"    codigo: {ts_string(e['codigo'])},")
    out.append(f"    atividade: {ts_string(e['atividade'])},")
    out.append(f"    grupo: {ts_string(e['grupo'])},")
    out.append("    parametro_porte: 'produção bruta',")
    out.append("    unidade_porte: 't/ano',")
    out.append("    faixas: [")
    out.append(ts_faixas(e["faixas"]))
    out.append("    ],")
    out.append(f"    potencial_poluente: {ts_string(e['potencial'])},")
    campos_ts = ", ".join(ts_string(c) for c in e["campos"])
    out.append(f"    campos_condicionais: [{campos_ts}],")
    if verificado:
        out.append("    fundamento: {")
        out.append(f"      norma: {ts_string(norma)},")
        out.append(f"      dispositivo: {ts_string(dispositivo)},")
        out.append("      verificado: true,")
        out.append("      data_conferencia: '2026-08-01',")
        out.append("    },")
    else:
        out.append("    fundamento: pendente(")
        out.append(f"      {ts_string(norma or 'fonte divergente — ver nota no cabeçalho do arquivo')},")
        out.append(f"      {ts_string(dispositivo)},")
        out.append("    ),")
    out.append("  },")
    return "\n".join(out)


HEADER = '''/**
 * ESCOPO C — dado real, gerado por scripts/build_fixtures.py.
 *
 * NÃO EDITAR À MÃO. Para atualizar, rode:
 *   .venv/Scripts/python.exe scripts/build_fixtures.py
 *
 * Fontes:
 *   TIPOLOGIAS B3/B4 — data/processed/cepram_divisao_b_mineracao.json,
 *     extração verificada do PDF oficial (Resolução CEPRAM 4.327/2013,
 *     Anexo Único, Divisão B). `fundamento.verificado: true`.
 *   TIPOLOGIAS B1/B2 (+ B4.5/B4.6) — data_source/Anexo_IV_Divisao_B_Mineracao_Bahia.xlsx.
 *     Única fonte disponível para esses itens (ausentes do PDF oficial), mas
 *     essa MESMA planilha já divergiu do PDF oficial nos itens onde dava pra
 *     comparar (B3/B4) — por isso `fundamento.verificado: false` aqui, sempre,
 *     com nota explícita da divergência conhecida. Não inventamos confiança
 *     que a fonte não sustenta.
 *   MUNICIPIOS — data/processed/municipios_habilitados.json (GAC/SEMA-BA,
 *     417 municípios). `tipologias_delegadas` é cruzamento do nível GAC do
 *     município com `nivel_gestao_municipal` de cada tipologia B3/B4 (única
 *     tipologia com esse dado no PDF — B1/B2 nunca aparecem delegadas).
 *   REGRAS — fundamentadas em LC 140/2011 (arts. 7º, 8º, 9º) e Resolução
 *     CEPRAM 4.327/2013 (arts. 2º §2º e 7º). Citação real, mas
 *     `fundamento.verificado: false`: confirmação humana contra a fonte
 *     primária (C.6) ainda não ocorreu.
 */

import type {
  MunicipioHabilitacao,
  Parecer,
  Regra,
  Tipologia,
} from '@/lib/schemas'

/** Marca única para varrer o repo antes do congelamento e não sobrar nada. */
export const FIXTURE = 'C-INTEGRADO-0.1' as const

const pendente = (norma: string, dispositivo: string) => ({
  norma,
  dispositivo,
  verificado: false as const,
})
'''

REGRAS_TS = '''// ---------------------------------------------------------------------------
// REGRAS (C.4) — fundamentadas em LC 140/2011 e CEPRAM 4.327/2013.
// Citação real; verificado:false até confirmação humana contra a fonte (C.6).
// ---------------------------------------------------------------------------

export const REGRAS: Regra[] = [
  // Três regras, não uma com OR: o motor não tem operador OR de propósito
  // (ver lib/motor.ts) — disjunção vira regras separadas, pra cada substância
  // radioativa aparecer como caminho isolado no rastro de execução. Mesmo
  // efeito e mesmo fundamento nas três: LC 140/2011 Art. 7º, XIV, "g" fala em
  // "material radioativo, em qualquer estágio" — não só urânio.
  {
    id: 'federal-substancia-nuclear',
    descricao: 'Minério de urânio atrai a competência federal, qualquer que seja o porte',
    condicoes: [
      { fato: 'substancia', operador: 'contem', valor: 'URÂNIO' },
    ],
    efeito: {
      instancia: 'UNIAO',
      orgao: 'IBAMA',
      alertas: [
        {
          id: 'nuclear-cnen',
          severidade: 'critico',
          titulo: 'Atividade nuclear',
          detalhe:
            'Além do licenciamento ambiental federal, há regime próprio de controle nuclear.',
        },
      ],
    },
    fundamento: pendente(
      'LC 140/2011',
      'Art. 7º, XIV, "g" — compete à União licenciar empreendimentos "destinados a pesquisar, lavrar, produzir, beneficiar, transportar, armazenar e dispor material radioativo, em qualquer estágio, ou que utilizem energia nuclear em qualquer de suas formas e aplicações, mediante parecer da Comissão Nacional de Energia Nuclear (Cnen)"',
    ),
    prioridade: 'P0',
  },
  {
    id: 'federal-substancia-radioativa-torio',
    descricao: 'Minério de tório atrai a competência federal, qualquer que seja o porte',
    condicoes: [
      { fato: 'substancia', operador: 'contem', valor: 'TÓRIO' },
    ],
    efeito: {
      instancia: 'UNIAO',
      orgao: 'IBAMA',
      alertas: [
        {
          id: 'nuclear-cnen',
          severidade: 'critico',
          titulo: 'Atividade nuclear',
          detalhe:
            'Além do licenciamento ambiental federal, há regime próprio de controle nuclear.',
        },
      ],
    },
    fundamento: pendente(
      'LC 140/2011',
      'Art. 7º, XIV, "g" — compete à União licenciar empreendimentos "destinados a pesquisar, lavrar, produzir, beneficiar, transportar, armazenar e dispor material radioativo, em qualquer estágio, ou que utilizem energia nuclear em qualquer de suas formas e aplicações, mediante parecer da Comissão Nacional de Energia Nuclear (Cnen)"',
    ),
    prioridade: 'P0',
  },
  {
    id: 'federal-substancia-radioativa-monazita',
    descricao:
      'Monazita (areia monazítica, radioativa por conter tório/urânio associados) atrai a competência federal, qualquer que seja o porte',
    condicoes: [
      { fato: 'substancia', operador: 'contem', valor: 'MONAZITA' },
    ],
    efeito: {
      instancia: 'UNIAO',
      orgao: 'IBAMA',
      alertas: [
        {
          id: 'nuclear-cnen',
          severidade: 'critico',
          titulo: 'Atividade nuclear',
          detalhe:
            'Além do licenciamento ambiental federal, há regime próprio de controle nuclear.',
        },
      ],
    },
    fundamento: pendente(
      'LC 140/2011',
      'Art. 7º, XIV, "g" — compete à União licenciar empreendimentos "destinados a pesquisar, lavrar, produzir, beneficiar, transportar, armazenar e dispor material radioativo, em qualquer estágio, ou que utilizem energia nuclear em qualquer de suas formas e aplicações, mediante parecer da Comissão Nacional de Energia Nuclear (Cnen)"',
    ),
    prioridade: 'P0',
  },
  {
    id: 'municipal-habilitado-tipologia-delegada',
    descricao:
      'Município habilitado, com a tipologia entre as delegadas e porte dentro da faixa local',
    condicoes: [
      { fato: 'municipio_status', operador: 'igual', valor: 'habilitado' },
      { fato: 'tipologia_delegada_ao_municipio', operador: 'igual', valor: true },
      { fato: 'faixa_porte', operador: 'em', valor: ['pequeno'] },
      { fato: 'cruza_divisa', operador: 'igual', valor: false },
    ],
    efeito: { instancia: 'MUNICIPAL', orgao: 'MUNICIPIO' },
    exige_fato: ['municipio_status', 'faixa_porte'],
    fundamento: pendente(
      'LC 140/2011 c/c Resolução CEPRAM 4.327/2013',
      'LC 140/2011 Art. 9º, XIV, "a" (competência municipal para impacto local, "conforme tipologia definida pelos respectivos Conselhos Estaduais de Meio Ambiente") c/c CEPRAM 4.327/2013 Art. 2º §2º e Art. 7º (delegação de níveis de gestão ambiental compartilhada ao município, condicionada à comunicação à SEMA)',
    ),
    prioridade: 'P0',
  },
  {
    // Sem esta regra a 2ª virada da demo não existe: acima da faixa delegada
    // ninguém assumia a competência e o motor caía em INDETERMINADO por
    // ausência de regra, que é diferente de ausência de fato.
    id: 'estadual-porte-acima-da-faixa-delegada',
    descricao:
      'Porte acima da faixa delegada ao município: a competência permanece com o Estado',
    condicoes: [
      { fato: 'faixa_porte', operador: 'em', valor: ['medio', 'grande'] },
      { fato: 'status_municipais_divergentes', operador: 'igual', valor: false },
    ],
    efeito: { instancia: 'ESTADUAL', orgao: 'INEMA' },
    exige_fato: ['faixa_porte'],
    fundamento: pendente(
      'LC 140/2011',
      'Art. 8º, XIV — compete aos Estados licenciar "atividades ou empreendimentos utilizadores de recursos ambientais, efetiva ou potencialmente poluidores ou capazes, sob qualquer forma, de causar degradação ambiental, ressalvado o disposto nos arts. 7º e 9º" — competência remanescente do Estado quando não há atribuição federal (Art. 7º) nem delegação municipal efetiva (Art. 9º)',
    ),
    prioridade: 'P0',
  },
  {
    id: 'condicional-divisa-status-divergente',
    descricao:
      'Poligonal repartida entre municípios com status de habilitação divergente',
    condicoes: [
      { fato: 'cruza_divisa', operador: 'igual', valor: true },
      { fato: 'status_municipais_divergentes', operador: 'igual', valor: true },
    ],
    efeito: {
      instancia: 'INDETERMINADA',
      orgao: 'INDETERMINADO',
      alertas: [
        {
          id: 'divisa-divergente',
          severidade: 'atencao',
          titulo: 'Competência não determinável com os fatos disponíveis',
          detalhe:
            'A poligonal atinge municípios com habilitação divergente ou desconhecida.',
        },
      ],
    },
    torna_condicional: true,
    fundamento: {
      norma: 'Critério interno do motor (D.5)',
      dispositivo:
        'Não é competência normativa externa — é a regra de honestidade do produto: ausência de habilitação uniforme sob a mesma poligonal nunca vira chute de competência, sempre INDETERMINADO + pedido LAI.',
      verificado: true,
      data_conferencia: '2026-08-01',
    },
    prioridade: 'P0',
  },
]

// ---------------------------------------------------------------------------
// 1 parecer — formato de saída completo, para F desenhar contra algo
// ---------------------------------------------------------------------------

export const PARECER: Parecer = {
  schema_versao: '1.0.0',
  gerado_em: '2026-08-01T12:00:00-03:00',
  estado: 'INDETERMINADO',
  instancia: 'INDETERMINADA',
  orgao: 'INDETERMINADO',
  fatos: {
    processo: { chave: 'processo', valor: '871.108/2018', origem: 'cadastro' },
    substancia: { chave: 'substancia', valor: 'MINÉRIO DE OURO', origem: 'cadastro' },
    cruza_divisa: { chave: 'cruza_divisa', valor: true, origem: 'derivado' },
    municipio_status: { chave: 'municipio_status', valor: null, origem: 'cadastro' },
  },
  trilha_selecionada: null,
  opcoes: [],
  prazo_legal_total_dias: null,
  n_licencas: null,
  anuencias: [],
  alertas: [
    {
      id: 'divisa-divergente',
      severidade: 'atencao',
      titulo: 'Competência não determinável com os fatos disponíveis',
      detalhe:
        'A poligonal se reparte entre Campo Formoso (36,7%), Jaguarari (35,2%) e Senhor do Bonfim (28,1%). Não há evidência pública de habilitação para Senhor do Bonfim.',
      origem_regra: 'condicional-divisa-status-divergente',
    },
  ],
  fatores_concorrentes: [],
  rastro: [
    {
      ordem: 1,
      regra_id: 'condicional-divisa-status-divergente',
      descricao:
        'Poligonal repartida entre municípios com status de habilitação divergente',
      disparou: true,
      avaliacoes: [
        {
          predicado: { fato: 'cruza_divisa', operador: 'igual', valor: true },
          valor_observado: true,
          resultado: true,
        },
      ],
      fundamento: {
        norma: 'Critério interno do motor (D.5)',
        dispositivo:
          'Ausência de habilitação uniforme sob a mesma poligonal nunca vira chute de competência.',
        verificado: true,
        data_conferencia: '2026-08-01',
      },
    },
  ],
  limiares: [],
  fatos_faltantes: [
    {
      chave: 'municipio_status',
      rotulo: 'Habilitação de Senhor do Bonfim para gestão ambiental compartilhada',
      destinatario_sugerido: 'Secretaria do Meio Ambiente do Estado da Bahia',
    },
  ],
  tem_fundamento_pendente: true,
}
'''


def main():
    xlsx = carregar_xlsx()
    pdf, niveis = carregar_cepram_json()

    linhas_tipologias = []
    ordem = [
        "B1.1.1", "B1.1.2", "B1.1.3", "B1.2.1",
        "B2.1", "B2.2",
        "B3.1", "B3.2", "B3.3", "B3.4", "B3.5",
        "B4.1", "B4.2", "B4.3", "B4.4", "B4.5", "B4.6",
    ]
    for codigo in ordem:
        if codigo in pdf:
            e = pdf[codigo]
            dispositivo = f"Anexo Único — Divisão B: Mineração, {codigo} (pág. {e['pagina']} do PDF oficial)"
            linhas_tipologias.append(emitir_tipologia(e, True, dispositivo, NORMA_CORRETA))
        elif codigo in xlsx:
            e = xlsx[codigo]
            dispositivo = (
                f"Anexo IV — Divisão B, {codigo} (planilha auxiliar, NÃO conferida contra "
                f"o PDF oficial da Resolução CEPRAM 4.327/2013 — que não cobre este grupo/"
                f"item; a planilha já divergiu do PDF em outros itens comparáveis, ver nota "
                f"no topo deste arquivo)"
            )
            linhas_tipologias.append(emitir_tipologia(e, False, dispositivo, None))
        else:
            print(f"// aviso: {codigo} não encontrado em nenhuma fonte", file=sys.stderr)

    out = [HEADER]
    out.append("// ---------------------------------------------------------------------------")
    out.append("// TIPOLOGIAS")
    out.append("// ---------------------------------------------------------------------------")
    out.append("")
    out.append("export const TIPOLOGIAS: Tipologia[] = [")
    out.append("\n".join(linhas_tipologias))
    out.append("]")
    out.append("")

    # -----------------------------------------------------------------
    # MUNICIPIOS
    # -----------------------------------------------------------------
    mun = json.load(open(MUNICIPIOS_JSON, encoding="utf-8"))["municipios"]

    def tipologias_delegadas(nivel):
        if nivel is None:
            return []
        chave = f"nivel_{nivel}"
        res = []
        for codigo, niveis_tip in niveis.items():
            if niveis_tip.get(chave):
                res.append(slug_codigo(codigo))
        return res

    out.append("// ---------------------------------------------------------------------------")
    out.append("// MUNICIPIOS — 417, de data/processed/municipios_habilitados.json (GAC real)")
    out.append("// tipologias_delegadas cruza o nivel do municipio com")
    out.append("// tipologia_nivel_gestao de cada tipologia B3/B4 (unicas com esse dado no PDF).")
    out.append("// B1/B2 nunca aparecem delegadas: o PDF nao publica nivel_gestao_municipal pra elas.")
    out.append("// ---------------------------------------------------------------------------")
    out.append("")
    out.append("export const MUNICIPIOS: MunicipioHabilitacao[] = [")
    for codigo_ibge, m in sorted(mun.items()):
        nivel = m["nivel"]
        delegadas = tipologias_delegadas(nivel)
        delegadas_ts = ", ".join(ts_string(d) for d in delegadas)
        nivel_ts = ts_string(nivel) if nivel else "null"
        consorcio = m.get("consorcio_nome") or "sem consórcio vinculado"
        out.append("  {")
        out.append(f"    cd_mun: {ts_string(codigo_ibge)},")
        out.append(f"    nm_mun: {ts_string(m['municipio'])},")
        out.append(f"    status: {ts_string(m['status'])},")
        out.append(f"    nivel: {nivel_ts},")
        out.append(f"    tipologias_delegadas: [{delegadas_ts}],")
        out.append("    ato: null,")
        out.append("    vigencia_desde: null,")
        out.append("    procedencia: {")
        out.append(f"      fonte: {ts_string('GAC/SEMA-BA — ' + consorcio)},")
        out.append(f"      url: {ts_string(m['fonte_url'])},")
        out.append(f"      data_consulta: {ts_string(m['data_consulta'])},")
        out.append("    },")
        out.append("  },")
    out.append("]")
    out.append("")
    out.append(REGRAS_TS)

    with open("frontend/src/data/fixtures.ts", "w", encoding="utf-8", newline="\n") as f:
        f.write("\n".join(out))
    print(
        f"escrito: frontend/src/data/fixtures.ts "
        f"({len(linhas_tipologias)} tipologias, {len(mun)} municípios)",
        file=sys.stderr,
    )


if __name__ == "__main__":
    main()
