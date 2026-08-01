/**
 * ESCOPO B.2 e B.3 — substância e fase/regime ANM.
 *
 * Princípio do escopo: o que o SIGMINE puder derivar, não se pergunta. Os dois
 * campos chegam preenchidos quando há processo selecionado, e ficam editáveis —
 * trocar a substância para urânio é a 3ª virada da demo.
 *
 * Quando o usuário sobrescreve, o campo muda de origem: deixa de ser `cadastro`
 * e vira `declarado`. A tela é obrigada a mostrar isso, porque um parecer que
 * mistura dado oficial com dado digitado sem distinguir os dois não é auditável.
 */

import { RotateCcw } from 'lucide-react'

import { MarcaOrigem } from '@/components/form/MarcaOrigem'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { FASES_ANM, SUBSTANCIAS_FREQUENTES } from '@/lib/vocabulario'
import { pendenciaDe, validar } from '@/lib/validacao'
import { useFormulario } from '@/state/formulario'

export function CamposSigmine() {
  const { estado, despachar, tipologia, fatos } = useFormulario()
  const pendencias = validar(estado, tipologia)
  const temProcesso = estado.processo !== null
  const regime = fatos.regime_licenciamento?.valor === true

  const itensFase = Object.fromEntries(FASES_ANM.map((f) => [f, f]))

  return (
    <div className="grid gap-6 sm:grid-cols-2">
      {/* B.2 — substância */}
      <div className="flex flex-col gap-2">
        <div className="flex items-center justify-between gap-2">
          <Label htmlFor="substancia">Substância mineral</Label>
          <MarcaOrigem
            editado={estado.substancia_editada}
            deCadastro={temProcesso}
          />
        </div>

        <div className="flex items-center gap-2">
          <Input
            id="substancia"
            list="substancias-frequentes"
            value={estado.substancia}
            placeholder="ex.: MINÉRIO DE URÂNIO"
            onChange={(ev) =>
              despachar({ tipo: 'substancia', valor: ev.target.value.toUpperCase() })
            }
          />
          {estado.substancia_editada && temProcesso && (
            <Button
              variant="ghost"
              size="icon"
              aria-label="restaurar a substância que veio do SIGMINE"
              onClick={() => despachar({ tipo: 'restaurar-sigmine', campo: 'substancia' })}
            >
              <RotateCcw aria-hidden className="size-4" />
            </Button>
          )}
        </div>
        <datalist id="substancias-frequentes">
          {SUBSTANCIAS_FREQUENTES.map((s) => (
            <option key={s} value={s} />
          ))}
        </datalist>

        {pendenciaDe(pendencias, 'substancia') && (
          <p className="text-nota text-muted-foreground">
            {pendenciaDe(pendencias, 'substancia')?.mensagem}
          </p>
        )}
      </div>

      {/* B.3 — fase e regime */}
      <div className="flex flex-col gap-2">
        <div className="flex items-center justify-between gap-2">
          <Label htmlFor="fase">Fase do processo na ANM</Label>
          <MarcaOrigem editado={estado.fase_editada} deCadastro={temProcesso} />
        </div>

        <div className="flex items-center gap-2">
          <Select
            items={itensFase}
            value={estado.fase || null}
            onValueChange={(v) => v && despachar({ tipo: 'fase', valor: String(v) })}
          >
            <SelectTrigger id="fase" className="w-full">
              <SelectValue>{estado.fase || 'Selecione a fase'}</SelectValue>
            </SelectTrigger>
            <SelectContent>
              {FASES_ANM.map((f) => (
                <SelectItem key={f} value={f}>
                  {f}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          {estado.fase_editada && temProcesso && (
            <Button
              variant="ghost"
              size="icon"
              aria-label="restaurar a fase que veio do SIGMINE"
              onClick={() => despachar({ tipo: 'restaurar-sigmine', campo: 'fase' })}
            >
              <RotateCcw aria-hidden className="size-4" />
            </Button>
          )}
        </div>

        {regime && (
          <p className="text-nota text-ok">
            Regime de licenciamento da Lei 6.567/1978 — gatilho de competência
            local.
          </p>
        )}
        {pendenciaDe(pendencias, 'fase') && (
          <p className="text-nota text-muted-foreground">
            {pendenciaDe(pendencias, 'fase')?.mensagem}
          </p>
        )}
      </div>
    </div>
  )
}
