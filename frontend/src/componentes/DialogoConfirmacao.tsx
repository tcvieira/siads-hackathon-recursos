import { useEffect, useRef } from 'react'
import './dialogo.css'

/**
 * Diálogo de confirmação acessível para ações críticas/irreversíveis
 * (NBR 17225:2025 5.9.12). Usa o <dialog> nativo com showModal(), que já entrega:
 * - foco preso dentro do diálogo e Esc para fechar (5.1.2 armadilha de foco)
 * - fundo inerte enquanto aberto
 * Complementos: role="alertdialog", aria-labelledby/aria-describedby, e o foco
 * volta ao elemento que abriu (5.1.1).
 */
interface Props {
  aberto: boolean
  titulo: string
  descricao: string
  rotuloConfirmar: string
  rotuloCancelar?: string
  onConfirmar: () => void
  onFechar: () => void
}

export function DialogoConfirmacao({
  aberto,
  titulo,
  descricao,
  rotuloConfirmar,
  rotuloCancelar = 'Voltar',
  onConfirmar,
  onFechar,
}: Props) {
  const ref = useRef<HTMLDialogElement>(null)
  const confirmarRef = useRef<HTMLButtonElement>(null)

  useEffect(() => {
    const dlg = ref.current
    if (!dlg) return
    if (aberto && !dlg.open) {
      dlg.showModal()
      // foco inicial no botão de confirmar (ação primária do diálogo)
      confirmarRef.current?.focus()
    } else if (!aberto && dlg.open) {
      dlg.close()
    }
  }, [aberto])

  // Esc dispara o evento 'cancel' do <dialog>: tratamos como "fechar".
  function handleCancel(e: React.SyntheticEvent<HTMLDialogElement>) {
    e.preventDefault()
    onFechar()
  }

  return (
    <dialog
      ref={ref}
      className="dialogo"
      role="alertdialog"
      aria-labelledby="dlg-titulo"
      aria-describedby="dlg-descricao"
      onCancel={handleCancel}
    >
      <h2 id="dlg-titulo" className="dialogo__titulo">
        {titulo}
      </h2>
      <p id="dlg-descricao" className="dialogo__descricao">
        {descricao}
      </p>
      <div className="dialogo__acoes">
        <button type="button" className="botao-secundario" onClick={onFechar}>
          {rotuloCancelar}
        </button>
        <button
          type="button"
          ref={confirmarRef}
          className="botao-perigo"
          onClick={onConfirmar}
        >
          {rotuloConfirmar}
        </button>
      </div>
    </dialog>
  )
}
