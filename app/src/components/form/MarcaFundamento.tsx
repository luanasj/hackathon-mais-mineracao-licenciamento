/**
 * Marcação visual de fundamento ainda não conferido contra a fonte primária.
 *
 * Convenção transversal do schema (C.6 / F.3): `verificado: false` não impede a
 * exibição — obriga a marcação. É a diferença entre "o sistema afirma" e "o
 * sistema afirma e conferiu". Cor nunca carrega a informação sozinha: aqui vêm
 * sempre ícone e texto junto.
 */

import { CircleAlert, CircleCheck } from 'lucide-react'

import { Badge } from '@/components/ui/badge'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import type { Fundamento } from '@/lib/schemas'

export function MarcaFundamento({ fundamento }: { fundamento: Fundamento }) {
  const cita = `${fundamento.norma} — ${fundamento.dispositivo}`

  if (fundamento.verificado) {
    return (
      <Tooltip>
        <TooltipTrigger
          render={
            <Badge variant="outline" className="gap-1 text-ok">
              <CircleCheck aria-hidden className="size-3" />
              fundamento conferido
            </Badge>
          }
        />
        <TooltipContent>
          {cita}
          {fundamento.data_conferencia ? ` · conferido em ${fundamento.data_conferencia}` : ''}
        </TooltipContent>
      </Tooltip>
    )
  }

  return (
    <Tooltip>
      <TooltipTrigger
        render={
          <Badge variant="outline" className="gap-1 text-warn">
            <CircleAlert aria-hidden className="size-3" />
            fundamento pendente de conferência
          </Badge>
        }
      />
      <TooltipContent>
        {cita} · ainda não conferido contra a fonte primária (C.6)
      </TooltipContent>
    </Tooltip>
  )
}
