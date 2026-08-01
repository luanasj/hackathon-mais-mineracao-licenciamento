/**
 * Banco de provas do ESCOPO A.
 *
 * Provisório: o Escopo F substitui esta tela pela tela de consulta real (F.1),
 * com o mapa à esquerda. Até lá, isto existe para que A.5, A.6 e A.8 sejam
 * verificáveis por qualquer pessoa do time rodando `npm run dev`.
 */

import { useEffect, useState } from 'react'
import { AlertTriangle } from 'lucide-react'

import { BuscaProcesso } from '@/components/BuscaProcesso'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Separator } from '@/components/ui/separator'
import { carregarIndice } from '@/lib/processos'
import type { IndiceProcessos, RegistroIndice } from '@/lib/processos'
import { VIRADAS } from '@/data/viradas'

const nf = new Intl.NumberFormat('pt-BR', {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
})
const pf = new Intl.NumberFormat('pt-BR', {
  style: 'percent',
  maximumFractionDigits: 1,
})

export default function App() {
  const [indice, setIndice] = useState<IndiceProcessos | null>(null)
  const [erro, setErro] = useState<string | null>(null)
  const [sel, setSel] = useState<RegistroIndice | null>(null)

  useEffect(() => {
    carregarIndice().then(setIndice, (e: unknown) => setErro(String(e)))
  }, [])

  return (
    <main className="mx-auto flex max-w-4xl flex-col gap-8 p-8">
      <header className="flex flex-col gap-2">
        <h1 className="text-kpi">Escopo A — busca por processo ANM</h1>
        <p className="text-corpo text-muted-foreground">
          Poligonais do SIGMINE recortadas aos 10 municípios da amostra, com
          município derivado por interseção geométrica.
        </p>
      </header>

      <Card>
        <CardHeader>
          <CardTitle className="text-titulo">A.5 · A.6 — índice e busca</CardTitle>
        </CardHeader>
        <CardContent>
          {erro && (
            <p className="text-corpo text-risk">
              <AlertTriangle aria-hidden className="mr-2 inline size-4" />
              {erro}
            </p>
          )}
          {!indice && !erro && (
            <p className="text-corpo text-muted-foreground">Carregando o índice…</p>
          )}
          {indice && (
            <BuscaProcesso
              indice={indice}
              onSelecionar={setSel}
              onDesenhar={() =>
                alert('A.9 — desenho de poligonal, ainda não implementado')
              }
              onPontoRaio={() =>
                alert('A.9 — ponto e raio geodésico, ainda não implementado')
              }
            />
          )}
        </CardContent>
      </Card>

      {sel && (
        <Card>
          <CardHeader>
            <CardTitle className="num text-titulo">{sel.processo}</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-4">
            <dl className="grid grid-cols-2 gap-x-8 gap-y-2 text-corpo">
              <Linha rotulo="Fase" valor={sel.fase} />
              <Linha rotulo="Substância" valor={sel.substancia} />
              <Linha rotulo="Titular" valor={sel.titular} />
              <Linha rotulo="Área" valor={`${nf.format(sel.area_ha)} ha`} num />
            </dl>
            <Separator />
            <div className="flex flex-col gap-1">
              <p className="text-nota font-medium">
                Municípios atingidos — derivado por interseção em A.3, não vem do
                shapefile
              </p>
              <p className="text-corpo">{sel.municipios.join(' · ')}</p>
              {sel.cruza_divisa && (
                <Badge variant="outline" className="mt-2 w-fit">
                  <AlertTriangle aria-hidden className="size-3" />
                  poligonal cruza divisa municipal
                </Badge>
              )}
            </div>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle className="text-titulo">
            A.8 — as quatro viradas, embarcadas
          </CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-6">
          {VIRADAS.map((v) => (
            <div key={v.n} className="flex flex-col gap-1">
              <div className="flex items-baseline gap-2">
                <span className="num text-nota text-muted-foreground">{v.n}.</span>
                <span className="text-corpo font-medium">{v.titulo}</span>
                <Badge variant="secondary" className="ml-auto">
                  {v.esperado}
                </Badge>
              </div>
              <p className="num text-nota text-muted-foreground">
                {v.processo.processo} · {v.processo.substancia} ·{' '}
                {v.processo.municipios
                  .map((m) => `${m.nm_mun} ${pf.format(m.proporcao)}`)
                  .join(' + ')}
              </p>
              {v.pendencias.length > 0 && (
                <ul className="ml-4 list-disc text-nota text-warn">
                  {v.pendencias.map((p) => (
                    <li key={p}>{p}</li>
                  ))}
                </ul>
              )}
              <Button
                variant="ghost"
                size="sm"
                className="w-fit px-0"
                onClick={() => {
                  const r = indice?.porNumero(v.processo.processo_norm)
                  if (r) setSel(r)
                }}
              >
                carregar no painel acima
              </Button>
            </div>
          ))}
        </CardContent>
      </Card>
    </main>
  )
}

function Linha({
  rotulo,
  valor,
  num,
}: {
  rotulo: string
  valor: string
  num?: boolean
}) {
  return (
    <div className="flex flex-col">
      <dt className="text-nota text-muted-foreground">{rotulo}</dt>
      <dd className={num ? 'num' : undefined}>{valor}</dd>
    </div>
  )
}
