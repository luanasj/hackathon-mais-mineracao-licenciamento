/**
 * ESCOPO A.6 — busca de processo ANM com autocomplete.
 *
 * Critério de aceite: nunca deixa o usuário em beco sem saída. Quando o número
 * digitado não existe no recorte, a tela não devolve "nada encontrado" e para —
 * ela oferece os dois outros modos de entrada de área (desenho e ponto+raio) e
 * diz por que o processo pode não estar ali.
 */

import { useMemo, useState } from 'react'
import { CircleDot, PencilLine, Search } from 'lucide-react'

import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandItem,
  CommandList,
} from '@/components/ui/command'
import { Input } from '@/components/ui/input'
import { interpretarEntrada } from '@/lib/processos'
import type { IndiceProcessos, RegistroIndice } from '@/lib/processos'

const nf = new Intl.NumberFormat('pt-BR', {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
})

export interface BuscaProcessoProps {
  indice: IndiceProcessos
  onSelecionar: (registro: RegistroIndice) => void
  /** Modo alternativo: usuário desenha a poligonal no mapa. */
  onDesenhar: () => void
  /** Modo alternativo: usuário marca um ponto e informa um raio (A.9). */
  onPontoRaio: () => void
}

export function BuscaProcesso({
  indice,
  onSelecionar,
  onDesenhar,
  onPontoRaio,
}: BuscaProcessoProps) {
  const [entrada, setEntrada] = useState('')

  const { digitos, completo } = interpretarEntrada(entrada)
  const sugestoes = useMemo(
    () => indice.sugerir(entrada, 8),
    [indice, entrada],
  )

  // beco sem saída só existe quando o usuário digitou algo buscável e nada veio
  const semResultado = entrada.trim().length >= 3 && sugestoes.length === 0

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-2">
        <label htmlFor="busca-processo" className="text-nota font-medium">
          Processo ANM
        </label>
        <div className="relative">
          <Search
            aria-hidden
            className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground"
          />
          <Input
            id="busca-processo"
            value={entrada}
            onChange={(e) => setEntrada(e.target.value)}
            placeholder="870.123/2019 — ou o nome do titular"
            className="num pl-9"
            autoComplete="off"
            spellCheck={false}
          />
        </div>
        <p className="text-nota text-muted-foreground">
          {digitos.length > 0 && !completo ? (
            <span className="num">
              {digitos.length} de 10 dígitos — pontuação é opcional
            </span>
          ) : (
            <>
              Poligonal, substância, fase e titular vêm do SIGMINE.{' '}
              <span className="num">{indice.total.toLocaleString('pt-BR')}</span>{' '}
              processos no recorte.
            </>
          )}
        </p>
      </div>

      {entrada.trim().length >= 2 && (
        <Command shouldFilter={false} className="rounded-lg border">
          <CommandList className="max-h-80">
            {semResultado ? (
              <CommandEmpty className="p-0">
                <SemSaida
                  entrada={entrada}
                  onDesenhar={onDesenhar}
                  onPontoRaio={onPontoRaio}
                />
              </CommandEmpty>
            ) : (
              <CommandGroup heading={`${sugestoes.length} resultado(s)`}>
                {sugestoes.map((r) => (
                  <CommandItem
                    key={r.processo_norm}
                    value={r.processo_norm}
                    onSelect={() => onSelecionar(r)}
                    className="flex-col items-start gap-1 py-2"
                  >
                    <div className="flex w-full items-center gap-2">
                      <span className="num font-medium">{r.processo}</span>
                      <span className="text-nota text-muted-foreground">
                        {r.substancia}
                      </span>
                      {r.cruza_divisa && (
                        <Badge variant="outline" className="ml-auto text-nota">
                          cruza divisa
                        </Badge>
                      )}
                    </div>
                    <div className="text-nota text-muted-foreground">
                      {r.fase} · {r.municipios.join(' + ')} ·{' '}
                      <span className="num">{nf.format(r.area_ha)}</span> ha
                    </div>
                    <div className="text-nota text-muted-foreground/80">
                      {r.titular}
                    </div>
                  </CommandItem>
                ))}
              </CommandGroup>
            )}
          </CommandList>
        </Command>
      )}
    </div>
  )
}

/**
 * O estado de "não encontrado". Explica a causa provável e oferece saída —
 * o recorte de 10 municípios é uma limitação declarada, não um erro silencioso.
 */
function SemSaida({
  entrada,
  onDesenhar,
  onPontoRaio,
}: {
  entrada: string
  onDesenhar: () => void
  onPontoRaio: () => void
}) {
  const { completo } = interpretarEntrada(entrada)

  return (
    <div className="flex flex-col gap-4 p-4 text-left">
      <div className="flex flex-col gap-1">
        <p className="text-corpo font-medium text-foreground">
          Nenhum processo com <span className="num">{entrada.trim()}</span> neste
          recorte
        </p>
        <p className="text-nota text-muted-foreground">
          {completo
            ? 'O número está completo, então provavelmente a poligonal fica fora dos 10 municípios da amostra — ou o processo é posterior à data de coleta do SIGMINE.'
            : 'Confira os dígitos. Se o processo existir mas ficar fora dos 10 municípios da amostra, ele não está nesta base.'}
        </p>
      </div>

      <div className="flex flex-col gap-2">
        <p className="text-nota font-medium">Informar a área de outro jeito:</p>
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" size="sm" onClick={onDesenhar}>
            <PencilLine aria-hidden className="size-4" />
            Desenhar a poligonal
          </Button>
          <Button variant="outline" size="sm" onClick={onPontoRaio}>
            <CircleDot aria-hidden className="size-4" />
            Marcar ponto e raio
          </Button>
        </div>
      </div>
    </div>
  )
}
