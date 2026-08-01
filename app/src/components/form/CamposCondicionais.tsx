/**
 * ESCOPO B.5 — campos condicionais.
 *
 * Critério de aceite: só aparecem quando fazem sentido para a tipologia
 * escolhida. Quem decide é `Tipologia.campos_condicionais`, do schema — não há
 * uma linha de `if (tipologia.id === ...)` neste arquivo, e não pode haver:
 * quando C.1 trocar as fixtures pela transcrição real da CEPRAM, o conjunto de
 * campos exibidos muda sozinho.
 *
 * `null` (não respondido) é distinto de `false` (respondido "não"). O primeiro
 * vira lacuna e pode levar a INDETERMINADO; o segundo é um fato.
 */

import { Droplets, Sprout, Zap } from 'lucide-react'
import type { ReactNode } from 'react'

import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { pendenciaDe, validar } from '@/lib/validacao'
import { useFormulario } from '@/state/formulario'
import type { UsoHidrico } from '@/state/tipos'

const USOS_HIDRICOS: { valor: UsoHidrico; rotulo: string }[] = [
  { valor: 'captacao', rotulo: 'Captação' },
  { valor: 'lancamento', rotulo: 'Lançamento de efluente' },
  { valor: 'barramento', rotulo: 'Barramento' },
]

export function CamposCondicionais() {
  const { estado, despachar, tipologia } = useFormulario()
  const ativos = tipologia?.campos_condicionais ?? []
  const c = estado.condicionais
  const pendencias = validar(estado, tipologia)

  if (ativos.length === 0) return null

  return (
    <div className="flex flex-col gap-6">
      {ativos.includes('supressao_vegetacao') && (
        <Campo
          icone={<Sprout aria-hidden className="size-4 text-muted-foreground" />}
          rotulo="Supressão de vegetação nativa"
          nota="Dispara a exigência de Autorização de Supressão de Vegetação (ASV) e, conforme o bioma, anuência de outro órgão."
        >
          <SimNao
            valor={c.supressao_vegetacao}
            aoMudar={(v) =>
              despachar({ tipo: 'condicional', campo: 'supressao_vegetacao', valor: v })
            }
          />
          {c.supressao_vegetacao === true && (
            <div className="mt-3 flex items-center gap-2">
              <Label htmlFor="supressao-ha" className="text-nota">
                Área de supressão
              </Label>
              <Input
                id="supressao-ha"
                type="number"
                min={0}
                step={0.01}
                className="num w-32 text-right"
                value={c.supressao_ha ?? ''}
                onChange={(ev) =>
                  despachar({
                    tipo: 'condicional',
                    campo: 'supressao_ha',
                    valor: ev.target.value === '' ? null : Number(ev.target.value),
                  })
                }
              />
              <span className="text-nota text-muted-foreground">ha</span>
            </div>
          )}
          {pendenciaDe(pendencias, 'supressao_ha') && (
            <p className="mt-2 text-nota text-muted-foreground">
              {pendenciaDe(pendencias, 'supressao_ha')?.mensagem}
            </p>
          )}
        </Campo>
      )}

      {ativos.includes('recurso_hidrico') && (
        <Campo
          icone={<Droplets aria-hidden className="size-4 text-muted-foreground" />}
          rotulo="Interferência em recurso hídrico"
          nota="Cada uso exige outorga própria do órgão gestor. Captar e lançar coexistem — marque todos os que se aplicam."
        >
          <div className="flex flex-wrap gap-2">
            {USOS_HIDRICOS.map((u) => {
              const marcado = c.recurso_hidrico.includes(u.valor)
              return (
                <Button
                  key={u.valor}
                  type="button"
                  size="sm"
                  variant={marcado ? 'default' : 'outline'}
                  aria-pressed={marcado}
                  onClick={() =>
                    despachar({
                      tipo: 'condicional',
                      campo: 'recurso_hidrico',
                      valor: marcado
                        ? c.recurso_hidrico.filter((x) => x !== u.valor)
                        : [...c.recurso_hidrico, u.valor],
                    })
                  }
                >
                  {u.rotulo}
                </Button>
              )
            })}
          </div>
        </Campo>
      )}

      {ativos.includes('explosivos') && (
        <Campo
          icone={<Zap aria-hidden className="size-4 text-muted-foreground" />}
          rotulo="Uso de explosivos no desmonte"
          nota="Atrai autorização do Exército (Comando Logístico) e altera as exigências de plano de fogo."
        >
          <SimNao
            valor={c.explosivos}
            aoMudar={(v) =>
              despachar({ tipo: 'condicional', campo: 'explosivos', valor: v })
            }
          />
        </Campo>
      )}
    </div>
  )
}

function Campo({
  icone,
  rotulo,
  nota,
  children,
}: {
  icone: ReactNode
  rotulo: string
  nota: string
  children: ReactNode
}) {
  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center gap-2">
        {icone}
        <span className="text-corpo font-medium">{rotulo}</span>
      </div>
      <p className="text-nota text-muted-foreground">{nota}</p>
      <div>{children}</div>
    </div>
  )
}

/**
 * Três estados visíveis: sim, não, e não respondido. O terceiro não é um bug de
 * interface — é o que impede o motor de concluir sobre um fato que ninguém
 * afirmou.
 */
function SimNao({
  valor,
  aoMudar,
}: {
  valor: boolean | null
  aoMudar: (v: boolean | null) => void
}) {
  return (
    <div className="flex items-center gap-2">
      <Button
        type="button"
        size="sm"
        variant={valor === true ? 'default' : 'outline'}
        aria-pressed={valor === true}
        onClick={() => aoMudar(valor === true ? null : true)}
      >
        Sim
      </Button>
      <Button
        type="button"
        size="sm"
        variant={valor === false ? 'default' : 'outline'}
        aria-pressed={valor === false}
        onClick={() => aoMudar(valor === false ? null : false)}
      >
        Não
      </Button>
      {valor === null && (
        <span className="text-nota text-muted-foreground">não respondido</span>
      )}
    </div>
  )
}
