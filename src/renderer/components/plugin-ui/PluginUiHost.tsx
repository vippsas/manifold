import React from 'react'
import { usePluginUiHost } from '../../hooks/plugin-ui/usePluginUiHost'
import { ToastContainer } from './Toast'
import { QuickPickModal } from './QuickPickModal'
import { InputBoxModal } from './InputBoxModal'

export function PluginUiHost(): React.JSX.Element {
  const { toasts, modal, respond, dismissToast } = usePluginUiHost()
  return (
    <>
      <ToastContainer toasts={toasts} respond={respond} dismissToast={dismissToast} />
      {modal?.kind === 'quickPick' && (
        <QuickPickModal req={modal} onPick={(item) => respond(modal.requestId, item)} />
      )}
      {modal?.kind === 'inputBox' && (
        <InputBoxModal req={modal} onSubmit={(v) => respond(modal.requestId, v)} />
      )}
    </>
  )
}
