/**
 * ESCOPO B.1 — seletor de tipologia.
 *
 * Critério de aceite: toda opção da lista resolve para uma linha real da
 * Resolução CEPRAM 4.420/2015; zero opção órfã. A lista vem inteira de
 * `TIPOLOGIAS` — quando C.1 substituir as fixtures pela transcrição real, este
 * componente não muda uma linha.
 */

import { TIPOLOGIAS } from '@/data/fixtures'
import { MarcaFundamento } from '@/components/form/MarcaFundamento'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { useFormulario } from '@/state/formulario'
import { pendenciaDe, validar } from '@/lib/validacao'

export function SeletorTipologia() {
  const { estado, despachar, tipologia } = useFormulario()
  const pendencia = pendenciaDe(validar(estado, tipologia), 'tipologia')

  const itens = Object.fromEntries(
    TIPOLOGIAS.map((t) => [t.id, t.atividade]),
  ) as Record<string, string>

  return (
    <div className="flex flex-col gap-2">
      <Label htmlFor="tipologia">Tipologia licenciável</Label>

      <Select
        items={itens}
        value={estado.tipologia_id}
        onValueChange={(v) => v && despachar({ tipo: 'tipologia', id: String(v) })}
      >
        <SelectTrigger id="tipologia" className="w-full">
          <SelectValue>
            {estado.tipologia_id
              ? itens[estado.tipologia_id]
              : 'Selecione a atividade conforme o Anexo Único'}
          </SelectValue>
        </SelectTrigger>
        <SelectContent>
          {TIPOLOGIAS.map((t) => (
            <SelectItem key={t.id} value={t.id}>
              <div className="flex flex-col gap-0.5 py-0.5">
                <span>{t.atividade}</span>
                <span className="num text-nota text-muted-foreground">
                  {t.grupo}
                  {t.codigo ? ` · código ${t.codigo}` : ''} · porte por{' '}
                  {t.parametro_porte} em {t.unidade_porte}
                </span>
              </div>
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      {tipologia && (
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-nota text-muted-foreground">
            Potencial poluente/degradador: {tipologia.potencial_poluente}
          </span>
          <MarcaFundamento fundamento={tipologia.fundamento} />
        </div>
      )}

      {pendencia && (
        <p className="text-nota text-muted-foreground">{pendencia.mensagem}</p>
      )}
    </div>
  )
}
