export const CORES = {
  fundo: '#FAF8F2',
  painel: '#FFFDF8',
  branco: '#FFFFFF',
  tinta: '#22201C',
  terra: '#6E4B2A',
  terraClara: '#8A6234',
  verde: '#4A5E36',
  linha: '#DFDACD',
  linhaForte: '#CBC4B4',
  linhaSuave: '#EDE8DC',
  cinza: '#6B6862',
  cinzaEscuro: '#55524C',
  cinzaClaro: '#8A8271',
  barra: '#E7E2D5',
  mar: '#E9EDF0',
  terraMapa: '#F1EEE6',
  brasilMapa: '#EFEDE3',
  bordaMapa: '#C9C2B2',
} as const

export const SERIF = "'Source Serif 4', Georgia, serif"
export const MONO = "'IBM Plex Mono', monospace"

export type Faixa = { nome: string; ate: number; pot: string }

export const FAIXAS: Faixa[] = [
  { nome: 'Mínimo', ate: 5000, pot: 'potencial poluente baixo' },
  { nome: 'Pequeno', ate: 50000, pot: 'potencial poluente médio' },
  { nome: 'Médio', ate: 150000, pot: 'potencial poluente alto' },
  { nome: 'Grande', ate: 350000, pot: 'potencial poluente alto' },
  { nome: 'Excepcional', ate: 500000, pot: 'potencial poluente alto' },
]

export const LIMIAR = 100000
export const PORTE_MAX = 500000

/** Municípios habilitados no programa GAC (competência municipal possível). */
export const HABILITADOS = ['Jacobina (BA)', 'Jaguarari (BA)', 'Maracás (BA)', 'Brumado (BA)']

export type Cidade = { n: string; c: [number, number]; i: number }

/** `i` é a importância: 1 aparece já no zoom Brasil, 3 só na aproximação máxima. */
export const CIDADES: Cidade[] = [
  { n: 'Salvador', c: [-38.501, -12.971], i: 1 },
  { n: 'Feira de Santana', c: [-38.966, -12.267], i: 1 },
  { n: 'Vitória da Conquista', c: [-40.839, -14.866], i: 1 },
  { n: 'Juazeiro', c: [-40.498, -9.416], i: 1 },
  { n: 'Barreiras', c: [-44.99, -12.153], i: 1 },
  { n: 'Ilhéus', c: [-39.049, -14.793], i: 2 },
  { n: 'Itabuna', c: [-39.28, -14.788], i: 2 },
  { n: 'Jequié', c: [-40.084, -13.859], i: 2 },
  { n: 'Alagoinhas', c: [-38.419, -12.135], i: 2 },
  { n: 'Paulo Afonso', c: [-38.221, -9.399], i: 2 },
  { n: 'Irecê', c: [-41.856, -11.304], i: 2 },
  { n: 'Senhor do Bonfim', c: [-40.19, -10.461], i: 2 },
  { n: 'Jacobina', c: [-40.518, -11.181], i: 2 },
  { n: 'Campo Formoso', c: [-40.321, -10.508], i: 3 },
  { n: 'Jaguarari', c: [-40.196, -10.263], i: 3 },
  { n: 'Miguel Calmon', c: [-40.594, -11.428], i: 3 },
  { n: 'Caém', c: [-40.428, -11.07], i: 3 },
  { n: 'Serrolândia', c: [-40.297, -11.416], i: 3 },
  { n: 'Várzea Nova', c: [-40.94, -11.219], i: 3 },
  { n: 'Ourolândia', c: [-41.079, -10.96], i: 3 },
  { n: 'Umburanas', c: [-41.315, -10.74], i: 3 },
  { n: 'Mundo Novo', c: [-40.472, -11.855], i: 3 },
  { n: 'Piritiba', c: [-40.556, -11.727], i: 3 },
  { n: 'Morro do Chapéu', c: [-41.156, -11.549], i: 3 },
  { n: 'Maracás', c: [-40.431, -13.441], i: 3 },
  { n: 'Caetité', c: [-42.475, -14.069], i: 3 },
  { n: 'Brumado', c: [-41.665, -14.203], i: 3 },
]

export const CENTROS: Record<string, [number, number]> = {
  'Jacobina (BA)': [-40.518, -11.181],
  'Jaguarari (BA)': [-40.196, -10.263],
  'Maracás (BA)': [-40.431, -13.441],
  'Caetité (BA)': [-42.475, -14.069],
  'Brumado (BA)': [-41.665, -14.203],
  'Campo Formoso (BA)': [-40.321, -10.508],
}

/** Enquadramento da Bahia: oeste, sul, leste, norte. */
export const CAIXA_BAHIA: [number, number, number, number] = [-46.7, -18.4, -37.3, -8.5]

export const MUNICIPIOS = Object.keys(CENTROS)
export const AREAS = ['486 ha', '1.240 ha', '2.000 ha', '97 ha']
export const SUBSTANCIAS = ['Ouro', 'Minério de ferro', 'Cobre', 'Quartzito', 'Calcário', 'Vanádio']
export const FASES = ['Autorização de pesquisa', 'Concessão de lavra', 'Lavra garimpeira']

export const TIPOLOGIAS = [
  'Sondagem de pesquisa',
  'Lavra a céu aberto',
  'Lavra subterrânea',
  'Beneficiamento via seca',
  'Beneficiamento via úmida',
  'Britagem',
  "Extração em leito de curso d'água",
  'Pilha de estéril / barragem de rejeito',
]

export const USOS_AGUA = ['Captação', 'Lançamento', 'Barramento']

export const fmt = (n: number) => Number(n || 0).toLocaleString('pt-BR')

export const faixaDe = (porte: number): Faixa =>
  FAIXAS.find((f) => porte <= f.ate) ?? FAIXAS[FAIXAS.length - 1]
