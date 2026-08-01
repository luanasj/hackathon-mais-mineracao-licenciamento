/**
 * Banco de provas dos Escopos A e B, agora ligados.
 *
 * O que mudou com o Escopo B: a seleção de área deixou de terminar num cartão
 * de leitura e passou a alimentar o estado global (B.6). Escolher um processo
 * na busca preenche substância e fase, deriva município e habilitação, e o
 * parecer reavalia sozinho — sem botão de calcular, porque não há momento em
 * que o parecer esteja desatualizado em relação ao formulário.
 *
 * Continua provisório: F.1 substitui esta pilha vertical pela tela de consulta
 * com o mapa à esquerda, e F.2 substitui o `PainelParecer` pela tela de parecer.
 */

import { useEffect, useState } from 'react'
import { AlertTriangle } from 'lucide-react'

import { BuscaProcesso } from '@/components/BuscaProcesso'
import { FormularioCaracterizacao } from '@/components/FormularioCaracterizacao'
import { MapaDesenho } from '@/components/MapaDesenho'
import type { ResultadoDesenho } from '@/components/MapaDesenho'
import { PainelParecer } from '@/components/PainelParecer'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { TooltipProvider } from '@/components/ui/tooltip'
import { carregarIndice } from '@/lib/processos'
import type { IndiceProcessos } from '@/lib/processos'
import { VIRADAS } from '@/data/viradas'
import { ProvedorFormulario, useFormulario } from '@/state/formulario'

export default function App() {
  return (
    <TooltipProvider>
      <ProvedorFormulario>
        <Tela />
      </ProvedorFormulario>
    </TooltipProvider>
  )
}

function Tela() {
  const { despachar, estado } = useFormulario()
  const [indice, setIndice] = useState<IndiceProcessos | null>(null)
  const [erro, setErro] = useState<string | null>(null)
  const [modoMapa, setModoMapa] = useState<'poligono' | 'ponto-raio' | null>(null)

  useEffect(() => {
    carregarIndice().then(setIndice, (e: unknown) => setErro(String(e)))
  }, [])

  return (
    <main className="mx-auto flex max-w-4xl flex-col gap-8 p-8">
      <header className="flex flex-col gap-2">
        <h1 className="text-kpi">Motor de enquadramento licenciatório</h1>
        <p className="text-corpo text-muted-foreground">
          Escopo A — poligonal do SIGMINE · Escopo B — caracterização · o parecer
          abaixo reavalia a cada campo.
        </p>
      </header>

      {/* ESCOPO A — entrada de área */}
      <Card>
        <CardHeader>
          <CardTitle className="text-titulo">Área a licenciar</CardTitle>
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
              onSelecionar={(processo) =>
                despachar({ tipo: 'selecionar-processo', processo })
              }
              onDesenhar={() => setModoMapa('poligono')}
              onPontoRaio={() => setModoMapa('ponto-raio')}
              processoSelecionado={estado.processo}
            />
          )}
        </CardContent>
      </Card>

      <Dialog open={modoMapa !== null} onOpenChange={(v) => !v && setModoMapa(null)}>
        <DialogContent className="sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle>
              {modoMapa === 'poligono'
                ? 'Desenhar a poligonal'
                : 'Ponto e raio geodésico'}
            </DialogTitle>
          </DialogHeader>
          {modoMapa && (
            <MapaDesenho
              modo={modoMapa}
              onCancelar={() => setModoMapa(null)}
              onConcluir={(r: ResultadoDesenho) => {
                despachar({
                  tipo: 'selecionar-area',
                  area: {
                    area_ha: r.area_ha,
                    municipios: r.municipios,
                    cruza_divisa: r.municipios.length > 1,
                  },
                })
                setModoMapa(null)
              }}
            />
          )}
        </DialogContent>
      </Dialog>

      {/* ESCOPO B */}
      <FormularioCaracterizacao />

      {/* Saída do motor */}
      <PainelParecer />

      {/* A.8 — as quatro viradas, agora executáveis de ponta a ponta */}
      <Card>
        <CardHeader>
          <CardTitle className="text-titulo">
            As quatro viradas da demo
          </CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-6">
          <p className="text-nota text-muted-foreground">
            Carregar uma virada só preenche a área e os campos do SIGMINE. A
            tipologia e o porte continuam sendo escolha de quem apresenta — é
            exatamente isso que a 2ª virada demonstra.
          </p>
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
                {v.processo.municipios.map((m) => m.nm_mun).join(' + ')}
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
                disabled={!indice}
                onClick={() => {
                  const r = indice?.porNumero(v.processo.processo_norm)
                  if (r) despachar({ tipo: 'selecionar-processo', processo: r })
                }}
              >
                {estado.processo?.processo_norm === v.processo.processo_norm
                  ? 'carregada'
                  : 'carregar esta virada'}
              </Button>
            </div>
          ))}
        </CardContent>
      </Card>
    </main>
  )
}
