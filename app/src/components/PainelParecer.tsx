/**
 * Leitura crua do `Parecer`. ⚠️ NÃO é a tela de parecer (F.2).
 *
 * Existe para que o Escopo B seja verificável sozinho: mostra o que o motor
 * devolveu, com o rastro aberto, sem nenhuma composição visual. F.2 substitui
 * este componente por inteiro — o que sobrevive é o contrato, não o layout.
 *
 * Enquanto o motor for o stub e as regras vierem das fixtures, tudo aqui carrega
 * marcação de pendência. É proposital: é assim que se descobre se a marcação
 * funciona antes de o dado real chegar.
 */

import { CircleHelp, FileQuestion, Info, TriangleAlert } from 'lucide-react'

import { MarcaFundamento } from '@/components/form/MarcaFundamento'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Separator } from '@/components/ui/separator'
import { rotuloFato } from '@/lib/fatos'
import type { EstadoParecer, Severidade } from '@/lib/schemas'
import { useFormulario } from '@/state/formulario'

export function PainelParecer() {
  const { parecer, fatos } = useFormulario()

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-titulo">
          Parecer — leitura crua do motor
          <span className="ml-2 text-nota font-normal text-muted-foreground">
            (F.2 desenha isto de verdade)
          </span>
        </CardTitle>
      </CardHeader>

      <CardContent className="flex flex-col gap-6">
        {/* Conclusão */}
        <div className="flex flex-wrap items-baseline gap-x-8 gap-y-3">
          <div className="flex flex-col">
            <span className="text-nota text-muted-foreground">Enquadramento</span>
            <span className="text-kpi">{parecer.instancia}</span>
          </div>
          <div className="flex flex-col">
            <span className="text-nota text-muted-foreground">Órgão</span>
            <span className="text-titulo">{parecer.orgao}</span>
          </div>
          <div className="flex flex-col">
            <span className="text-nota text-muted-foreground">Estado</span>
            <MarcaEstado estado={parecer.estado} />
          </div>
          {parecer.tem_fundamento_pendente && (
            <Badge variant="outline" className="ml-auto gap-1 text-warn">
              <TriangleAlert aria-hidden className="size-3" />
              há fundamento não conferido na cadeia
            </Badge>
          )}
        </div>

        {/* Alertas */}
        {parecer.alertas.length > 0 && (
          <div className="flex flex-col gap-2">
            {parecer.alertas.map((a) => (
              <div
                key={a.id}
                className="flex items-start gap-2 rounded-lg border border-border p-3"
              >
                <IconeSeveridade s={a.severidade} />
                <div className="flex flex-col gap-0.5">
                  <span className="text-corpo font-medium">{a.titulo}</span>
                  <span className="text-nota text-muted-foreground">{a.detalhe}</span>
                  <span className="text-nota text-muted-foreground">
                    origem: regra <code>{a.origem_regra}</code>
                  </span>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Fatos faltantes — a ponte para o Escopo G */}
        {parecer.fatos_faltantes.length > 0 && (
          <div className="flex flex-col gap-2">
            <p className="flex items-center gap-2 text-corpo font-medium">
              <FileQuestion aria-hidden className="size-4 text-muted-foreground" />
              O que falta para concluir
            </p>
            <ul className="flex flex-col gap-2">
              {parecer.fatos_faltantes.map((f) => (
                <li key={f.chave} className="flex flex-col">
                  <span className="text-corpo">{f.rotulo}</span>
                  {f.destinatario_sugerido && (
                    <span className="text-nota text-muted-foreground">
                      pedido de acesso à informação dirigido a{' '}
                      {f.destinatario_sugerido}
                    </span>
                  )}
                </li>
              ))}
            </ul>
            <p className="text-nota text-muted-foreground">
              🚧 G.2 põe aqui o botão que leva estes campos, já preenchidos, ao
              gerador de pedido LAI.
            </p>
          </div>
        )}

        {/* Fatores concorrentes */}
        {parecer.fatores_concorrentes.length > 0 && (
          <div className="flex flex-col gap-1">
            <p className="text-corpo font-medium">
              Fatores concorrentes — regras que dispararam e perderam a precedência
            </p>
            {parecer.fatores_concorrentes.map((f) => (
              <p key={f.regra_id} className="text-nota text-muted-foreground">
                <span className="num">{f.precedencia}</span> · {f.instancia} ·{' '}
                {f.descricao}
              </p>
            ))}
          </div>
        )}

        <Separator />

        {/* D.6 — rastro */}
        <details>
          <summary className="cursor-pointer text-corpo font-medium">
            Por quê? — rastro de execução, {parecer.rastro.length}{' '}
            {parecer.rastro.length === 1 ? 'regra avaliada' : 'regras avaliadas'}
          </summary>
          <div className="mt-3 flex flex-col gap-4">
            {parecer.rastro.map((passo) => (
              <div key={passo.regra_id} className="flex flex-col gap-1">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="num text-nota text-muted-foreground">
                    {passo.ordem}.
                  </span>
                  <span className="text-corpo">{passo.descricao}</span>
                  <Badge variant={passo.disparou ? 'default' : 'secondary'}>
                    {passo.disparou ? 'disparou' : 'não disparou'}
                  </Badge>
                  <MarcaFundamento fundamento={passo.fundamento} />
                </div>
                <ul className="ml-6 flex flex-col text-nota text-muted-foreground">
                  {passo.avaliacoes.map((a, i) => (
                    <li key={`${passo.regra_id}-${i}`} className="num">
                      {a.resultado ? '✓' : '✗'} {rotuloFato(a.predicado.fato)}{' '}
                      {a.predicado.operador}{' '}
                      {JSON.stringify(a.predicado.valor ?? null)} — observado:{' '}
                      {JSON.stringify(a.valor_observado)}
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        </details>

        {/* FactBase cru — a fronteira D.1 visível */}
        <details>
          <summary className="cursor-pointer text-corpo font-medium">
            FactBase — {Object.keys(fatos).length} fatos entregues ao motor
          </summary>
          <table className="mt-3 w-full text-nota">
            <thead>
              <tr className="text-left text-muted-foreground">
                <th className="pb-1 font-medium">Fato</th>
                <th className="pb-1 font-medium">Valor</th>
                <th className="pb-1 font-medium">Origem</th>
                <th className="pb-1 font-medium">Procedência</th>
              </tr>
            </thead>
            <tbody>
              {Object.values(fatos).map((f) => (
                <tr key={f.chave} className="border-t border-border">
                  <td className="py-1 pr-3">{rotuloFato(f.chave)}</td>
                  <td className="num py-1 pr-3">{JSON.stringify(f.valor)}</td>
                  <td className="py-1 pr-3 text-muted-foreground">{f.origem}</td>
                  <td className="py-1 text-muted-foreground">
                    {f.procedencia?.fonte ?? '—'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </details>

        <p className="num text-nota text-muted-foreground">
          gerado em {parecer.gerado_em}
        </p>
      </CardContent>
    </Card>
  )
}

function MarcaEstado({ estado }: { estado: EstadoParecer }) {
  if (estado === 'DEFINIDA') {
    return <Badge className="w-fit">definida</Badge>
  }
  if (estado === 'CONDICIONAL') {
    return (
      <Badge variant="outline" className="w-fit gap-1 text-warn">
        <TriangleAlert aria-hidden className="size-3" />
        condicional
      </Badge>
    )
  }
  return (
    <Badge variant="outline" className="w-fit gap-1 text-warn">
      <CircleHelp aria-hidden className="size-3" />
      indeterminado
    </Badge>
  )
}

function IconeSeveridade({ s }: { s: Severidade }) {
  // Cor nunca sozinha: ícone + texto sempre juntos (E.6 / F.6).
  if (s === 'critico') {
    return <TriangleAlert aria-hidden className="mt-0.5 size-4 shrink-0 text-risk" />
  }
  if (s === 'atencao') {
    return <TriangleAlert aria-hidden className="mt-0.5 size-4 shrink-0 text-warn" />
  }
  return <Info aria-hidden className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
}
