import type { ManifoldContext, WebviewView, ProjectInfo } from 'manifold'
// eslint-disable-next-line @typescript-eslint/no-var-requires
const manifold = require('manifold') as typeof import('manifold')

export function activate(context: ManifoldContext): void {
  context.subscriptions.push(
    manifold.commands.registerCommand('manifold.hello.ping', (name?: string) => `pong:${name ?? 'world'}`),
  )
  context.subscriptions.push(manifold.commands.registerCommand('manifold.hello.demoUi', async () => {
    const name = await manifold.window.showInputBox({ prompt: 'What is your name?', placeholder: 'e.g. Daisy' })
    if (name === undefined) return
    const color = await manifold.window.showQuickPick(['Red', 'Green', 'Blue'], { placeholder: 'Pick a color' })
    if (color === undefined) return
    const choice = await manifold.window.showInformationMessage(`Hi ${name} — you picked ${String(color)}.`, 'Nice', 'Meh')
    // choice is the clicked button label or undefined
    return `${name}:${String(color)}:${choice ?? 'dismissed'}`
  }))
  context.subscriptions.push(
    manifold.window.registerWebviewViewProvider('manifold.hello.panel', {
      async resolveWebviewView(view: WebviewView) {
        const initial = (await manifold.storage.global.get('count', 0)) as number
        const greeting = (await manifold.configuration.get('greeting', 'Hello')) as string
        view.webview.html = `<!doctype html><html><body style="font-family:system-ui;padding:14px;color:#ddd;background:#1e1e1e">
          <h3 id="greet" style="margin-top:0">${greeting} from a Manifold plugin 👋</h3>
          <p>Clicks (persisted): <b id="count">${initial}</b></p>
          <p>Active project: <b id="proj">…</b></p>
          <button id="inc">+1</button>
          <script>
            document.getElementById('inc').addEventListener('click', () => parent.postMessage({ type: 'inc' }, '*'))
            window.addEventListener('message', (e) => {
              if (e.data && e.data.type === 'count') document.getElementById('count').textContent = e.data.value
              if (e.data && e.data.type === 'project') document.getElementById('proj').textContent = e.data.name
              if (e.data && e.data.type === 'greeting') document.getElementById('greet').textContent = e.data.value + ' from a Manifold plugin 👋'
            })
          </script></body></html>`
        const sendProject = (p: { name: string } | undefined): void => {
          view.webview.postMessage({ type: 'project', name: p ? p.name : '(none)' })
        }
        sendProject(manifold.workspace.activeProject)
        context.subscriptions.push(manifold.workspace.onDidChangeActiveProject((p: ProjectInfo | undefined) => sendProject(p)))
        context.subscriptions.push(manifold.configuration.onDidChange(async () => {
          view.webview.postMessage({ type: 'greeting', value: await manifold.configuration.get('greeting', 'Hello') })
        }))
        view.webview.onDidReceiveMessage(async (msg: unknown) => {
          if (msg && (msg as { type?: string }).type === 'inc') {
            const next = ((await manifold.storage.global.get('count', 0)) as number) + 1
            await manifold.storage.global.update('count', next)
            view.webview.postMessage({ type: 'count', value: next })
          }
        })
      },
    }),
  )
}

export function deactivate(): void {}
