/**
 * ESCOPO B — o formulário completo (B.1 a B.8).
 *
 * Cinco campos, e nem todos aparecem sempre. Tudo o que a geometria ou o
 * SIGMINE derivam fica no `ResumoArea` como fato, não como pergunta.
 *
 * Não existe botão "calcular". O parecer é derivado do estado a cada tecla
 * (B.6), então um botão só poderia mentir sobre quando o cálculo aconteceu.
 */

import { CamposCondicionais } from '@/components/form/CamposCondicionais'
import { CamposSigmine } from '@/components/form/CamposSigmine'
import { ControlePorte } from '@/components/form/ControlePorte'
import { ResumoArea } from '@/components/form/ResumoArea'
import { SeletorTipologia } from '@/components/form/SeletorTipologia'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Separator } from '@/components/ui/separator'
import { validar } from '@/lib/validacao'
import { useFormulario } from '@/state/formulario'

export function FormularioCaracterizacao() {
  const { estado, tipologia } = useFormulario()
  const pendencias = validar(estado, tipologia)

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-titulo">Caracterização do empreendimento</CardTitle>
      </CardHeader>

      <CardContent className="flex flex-col gap-8">
        <ResumoArea />

        <Separator />

        <SeletorTipologia />
        <CamposSigmine />

        <Separator />

        <ControlePorte />

        {tipologia && tipologia.campos_condicionais.length > 0 && (
          <>
            <Separator />
            <CamposCondicionais />
          </>
        )}

        {pendencias.length > 0 && (
          <div className="flex flex-col gap-1 rounded-lg border border-border bg-muted/40 p-3">
            <p className="text-nota font-medium">
              Faltam {pendencias.length}{' '}
              {pendencias.length === 1 ? 'informação' : 'informações'} para o
              enquadramento sair de INDETERMINADO
            </p>
            <ul className="ml-4 list-disc text-nota text-muted-foreground">
              {pendencias.map((p) => (
                <li key={p.campo}>{p.mensagem}</li>
              ))}
            </ul>
          </div>
        )}
      </CardContent>
    </Card>
  )
}
