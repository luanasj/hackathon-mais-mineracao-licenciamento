/**
 * ESCOPO B.4 ⚠️ — controle de porte com recálculo ao vivo. É a 2ª virada da demo.
 *
 * Critério de aceite: arrastar reavalia o parecer em menos de 100 ms e move o
 * marcador de faixa. A medição real aparece na tela (`ms_avaliacao`) — critério
 * que não se mede é critério que se supõe.
 *
 * Três decisões que valem a pena registrar:
 *
 * 1. **A unidade é variável.** Parâmetro e unidade vêm da tipologia escolhida.
 *    Trocar a tipologia zera o porte, porque "150.000" em t/ano e em hectares
 *    não são o mesmo número com outro nome.
 *
 * 2. **Escala logarítmica.** As faixas de uma mesma tipologia cobrem de 10³ a
 *    10⁶. Em escala linear, micro, pequeno e médio ficariam espremidos nos
 *    primeiros pixels e o controle seria inútil justamente onde a maioria dos
 *    processos cai.
 *
 * 3. **Campo numérico espelhado.** Arrastar até exatamente 150.000 é impossível;
 *    digitar é trivial. Os dois editam o mesmo estado.
 *
 * Trava de honestidade do backlog (seção 5 de E): o limiar é exibido como
 * fronteira normativa. Em nenhum lugar o produto sugere ficar abaixo dele.
 */

import { useId } from 'react'
import { Gauge, TriangleAlert } from 'lucide-react'

import { MarcaFundamento } from '@/components/form/MarcaFundamento'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Slider } from '@/components/ui/slider'
import {
  formatarPorte,
  linhaFaixa,
  fronteiras,
  posicaoParaValor,
  ROTULO_FAIXA,
  tetoSlider,
  valorParaPosicao,
  PASSOS_SLIDER,
} from '@/lib/porte'
import { pendenciaDe, validar } from '@/lib/validacao'
import { useFormulario } from '@/state/formulario'

const NF = new Intl.NumberFormat('pt-BR', { maximumFractionDigits: 0 })

export function ControlePorte() {
  const { estado, despachar, tipologia, parecer, ms_avaliacao } = useFormulario()
  const id = useId()

  if (!tipologia) {
    return (
      <p className="text-nota text-muted-foreground">
        O controle de porte aparece assim que uma tipologia for escolhida — é ela
        que define o parâmetro medido e as faixas.
      </p>
    )
  }

  const teto = tetoSlider(tipologia)
  const valor = estado.porte_valor ?? 0
  const posicao = valorParaPosicao(valor, teto)
  const faixa = linhaFaixa(tipologia, valor)
  const pendencia = pendenciaDe(validar(estado, tipologia), 'porte')

  // Limiar relevante: a primeira fronteira acima do valor declarado em que a
  // instância competente muda. É o que o usuário precisa saber de onde está.
  const limiarAcima = parecer.limiares
    .filter((l) => l.valor > valor)
    .sort((a, b) => a.valor - b.valor)[0]
  const limiarAbaixo = parecer.limiares
    .filter((l) => l.valor <= valor)
    .sort((a, b) => b.valor - a.valor)[0]

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-end justify-between gap-2">
        <Label htmlFor={id}>
          {maiuscula(tipologia.parametro_porte)}
          <span className="text-muted-foreground">({tipologia.unidade_porte})</span>
        </Label>
        <div className="flex items-center gap-2">
          <Input
            id={id}
            type="number"
            inputMode="numeric"
            min={0}
            step={1}
            className="num w-40 text-right"
            value={estado.porte_valor ?? ''}
            placeholder="0"
            onChange={(ev) => {
              const v = ev.target.value === '' ? 0 : Number(ev.target.value)
              if (!Number.isNaN(v)) despachar({ tipo: 'porte', valor: v })
            }}
          />
          <span className="text-nota text-muted-foreground">
            {tipologia.unidade_porte}
          </span>
        </div>
      </div>

      <div className="flex flex-col gap-2">
        <Slider
          // Array de um elemento, e não escalar: o wrapper de `ui/slider` conta
          // os polegares pelo tamanho do array, e um valor escalar faria ele
          // renderizar dois.
          value={[posicao]}
          min={0}
          max={PASSOS_SLIDER}
          step={1}
          onValueChange={(v) =>
            despachar({
              tipo: 'porte',
              valor: posicaoParaValor(Array.isArray(v) ? v[0] : v, teto),
            })
          }
          aria-label={`${tipologia.parametro_porte} em ${tipologia.unidade_porte}`}
        />

        {/* Marcadores das fronteiras de faixa — alimentados pelas mesmas
            fronteiras que D.4 varre, nunca por posições escolhidas à mão. */}
        <div className="relative h-10">
          {fronteiras(tipologia).map((f) => {
            const pct = (valorParaPosicao(f, teto) / PASSOS_SLIDER) * 100
            const viraAqui = parecer.limiares.some((l) => l.valor === f)
            return (
              <div
                key={f}
                className="absolute flex -translate-x-1/2 flex-col items-center gap-0.5"
                style={{ left: `${pct}%` }}
              >
                <span
                  aria-hidden
                  className={
                    viraAqui
                      ? 'h-3 w-px bg-warn'
                      : 'h-2 w-px bg-border'
                  }
                />
                <span
                  className={`num whitespace-nowrap text-[0.6875rem] ${
                    viraAqui ? 'text-warn' : 'text-muted-foreground'
                  }`}
                >
                  {NF.format(f)}
                </span>
              </div>
            )
          })}
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
        <span className="flex items-center gap-2 text-corpo">
          <Gauge aria-hidden className="size-4 text-muted-foreground" />
          {faixa ? ROTULO_FAIXA[faixa.faixa] : 'fora das faixas da tipologia'}
          {faixa && (
            <span className="num text-nota text-muted-foreground">
              {NF.format(faixa.min)} –{' '}
              {faixa.max === null ? 'sem limite superior' : NF.format(faixa.max)}{' '}
              {tipologia.unidade_porte}
            </span>
          )}
        </span>
        <span className="num ml-auto text-nota text-muted-foreground">
          reavaliado em {ms_avaliacao.toFixed(1)} ms
        </span>
      </div>

      {limiarAcima && (
        <div className="flex items-start gap-2 rounded-lg border border-warn/40 bg-warn-bg p-3">
          <TriangleAlert aria-hidden className="mt-0.5 size-4 shrink-0 text-warn" />
          <div className="flex flex-col gap-1">
            <p className="text-corpo">
              Acima de{' '}
              <span className="num font-medium">
                {formatarPorte(limiarAcima.valor, limiarAcima.unidade)}
              </span>{' '}
              a competência passa de{' '}
              <span className="font-medium">{limiarAcima.instancia_abaixo}</span> para{' '}
              <span className="font-medium">{limiarAcima.instancia_acima}</span>.
            </p>
            <p className="text-nota text-muted-foreground">
              Faltam{' '}
              <span className="num">
                {formatarPorte(limiarAcima.valor - valor, limiarAcima.unidade)}
              </span>{' '}
              para a fronteira. O limiar é uma fronteira normativa da tipologia,
              não uma meta a perseguir: declarar menos ou fracionar a área para
              permanecer abaixo dele é fracionamento irregular.
            </p>
            <MarcaFundamento fundamento={limiarAcima.fundamento} />
          </div>
        </div>
      )}

      {limiarAbaixo && (
        <p className="text-nota text-muted-foreground">
          A última virada de competência ficou em{' '}
          <span className="num">
            {formatarPorte(limiarAbaixo.valor, limiarAbaixo.unidade)}
          </span>{' '}
          — abaixo dela a instância seria {limiarAbaixo.instancia_abaixo}.
        </p>
      )}

      {parecer.limiares.length === 0 && estado.porte_valor !== null && (
        <p className="text-nota text-muted-foreground">
          Nenhuma fronteira de faixa desta tipologia muda a instância competente
          com os demais fatos declarados. O porte, aqui, não é o que decide.
        </p>
      )}

      {pendencia && (
        <p className="text-nota text-muted-foreground">{pendencia.mensagem}</p>
      )}
    </div>
  )
}

function maiuscula(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1)
}
