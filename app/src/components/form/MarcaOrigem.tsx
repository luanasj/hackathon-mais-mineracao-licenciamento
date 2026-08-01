/**
 * Origem de um campo: veio do cadastro oficial ou foi digitado.
 *
 * O `Fato` do schema carrega `origem`; a tela é o lugar onde essa distinção
 * fica visível. Sem isso, um parecer produzido sobre "urânio" digitado à mão
 * sobre um processo de granito pareceria idêntico a um parecer sobre dado
 * oficial — e não é.
 */

import { Database, PenLine } from 'lucide-react'

import { Badge } from '@/components/ui/badge'

export interface MarcaOrigemProps {
  /** O usuário sobrescreveu o valor. */
  editado: boolean
  /** Existe processo do SIGMINE por trás do campo. */
  deCadastro: boolean
}

export function MarcaOrigem({ editado, deCadastro }: MarcaOrigemProps) {
  if (editado) {
    return (
      <Badge variant="outline" className="gap-1 text-warn">
        <PenLine aria-hidden className="size-3" />
        declarado — sobrescreve o SIGMINE
      </Badge>
    )
  }
  if (deCadastro) {
    return (
      <Badge variant="outline" className="gap-1 text-muted-foreground">
        <Database aria-hidden className="size-3" />
        SIGMINE/ANM
      </Badge>
    )
  }
  return null
}
