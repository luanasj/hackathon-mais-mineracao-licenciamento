/**
 * ESCOPO B — o que o sistema já sabe sem perguntar.
 *
 * Princípio do Escopo B: o que a geometria ou o SIGMINE puderem derivar, não se
 * pergunta. Este painel existe para tornar isso visível — município, área,
 * titular e cruzamento de divisa aparecem como fato derivado, com a fonte ao
 * lado, e não como campo em branco esperando digitação.
 *
 * A habilitação de cada município vem da base de C.2. Enquanto C.2 não entrega,
 * quase todos aparecem como "sem evidência", que é o estado honesto: a base não
 * foi levantada ainda, e o produto diz isso em vez de presumir.
 */

import { CircleHelp, CircleCheck, CircleX, MapPin, TriangleAlert } from 'lucide-react'

import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Separator } from '@/components/ui/separator'
import { habilitacaoDe, statusDe } from '@/lib/fatos'
import type { StatusHabilitacao } from '@/lib/schemas'
import { useFormulario } from '@/state/formulario'

const NF2 = new Intl.NumberFormat('pt-BR', {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
})
const PF = new Intl.NumberFormat('pt-BR', {
  style: 'percent',
  maximumFractionDigits: 1,
})

export function ResumoArea() {
  const { estado, despachar } = useFormulario()
  const { processo, area } = estado

  if (!processo && !area) {
    return (
      <p className="text-corpo text-muted-foreground">
        Nenhuma área selecionada. Busque o processo ANM acima ou desenhe a
        poligonal no mapa — município, área e substância vêm de lá, e não são
        perguntados.
      </p>
    )
  }

  const nomes = processo?.municipios ?? area?.municipios.map((m) => m.nm_mun) ?? []
  const proporcoes = new Map(
    (area?.municipios ?? []).map((m) => [m.nm_mun, m.proporcao]),
  )
  const cruza = processo?.cruza_divisa ?? area?.cruza_divisa ?? false
  const areaHa = processo?.area_ha ?? area?.area_ha ?? 0

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-baseline gap-x-6 gap-y-2">
        {processo && (
          <Dado rotulo="Processo ANM" valor={processo.processo} num />
        )}
        {processo && <Dado rotulo="Titular" valor={processo.titular} />}
        <Dado rotulo="Área da poligonal" valor={`${NF2.format(areaHa)} ha`} num />
        <Button
          variant="ghost"
          size="sm"
          className="ml-auto"
          onClick={() => despachar({ tipo: 'limpar-area' })}
        >
          trocar de área
        </Button>
      </div>

      <Separator />

      <div className="flex flex-col gap-2">
        <p className="flex items-center gap-2 text-nota font-medium">
          <MapPin aria-hidden className="size-4 text-muted-foreground" />
          Municípios atingidos — derivado por interseção geométrica (A.3), não
          lido do shapefile
        </p>

        <ul className="flex flex-col gap-1">
          {nomes.map((nome) => {
            const status = statusDe(nome)
            const hab = habilitacaoDe(nome)
            const prop = proporcoes.get(nome)
            return (
              <li key={nome} className="flex flex-wrap items-center gap-2">
                <span className="text-corpo">{nome}</span>
                {prop !== undefined && (
                  <span className="num text-nota text-muted-foreground">
                    {PF.format(prop)}
                  </span>
                )}
                <MarcaHabilitacao status={status} />
                {hab?.nivel && (
                  <span className="text-nota text-muted-foreground">
                    nível: {hab.nivel}
                  </span>
                )}
              </li>
            )
          })}
        </ul>

        {cruza && (
          <Badge variant="outline" className="mt-1 w-fit gap-1 text-warn">
            <TriangleAlert aria-hidden className="size-3" />
            poligonal cruza divisa municipal
          </Badge>
        )}
      </div>
    </div>
  )
}

function MarcaHabilitacao({ status }: { status: StatusHabilitacao }) {
  if (status === 'habilitado') {
    return (
      <Badge variant="outline" className="gap-1 text-ok">
        <CircleCheck aria-hidden className="size-3" />
        habilitado para gestão ambiental compartilhada
      </Badge>
    )
  }
  if (status === 'nao_habilitado') {
    return (
      <Badge variant="outline" className="gap-1 text-muted-foreground">
        <CircleX aria-hidden className="size-3" />
        não habilitado
      </Badge>
    )
  }
  return (
    <Badge variant="outline" className="gap-1 text-warn">
      <CircleHelp aria-hidden className="size-3" />
      sem evidência pública de habilitação
    </Badge>
  )
}

function Dado({
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
      <span className="text-nota text-muted-foreground">{rotulo}</span>
      <span className={num ? 'num text-corpo' : 'text-corpo'}>{valor}</span>
    </div>
  )
}
