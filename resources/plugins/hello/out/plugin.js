const manifold = require('manifold')

exports.activate = (context) => {
  context.subscriptions.push(
    manifold.commands.registerCommand('manifold.hello.ping', (name) => `pong:${name ?? 'world'}`),
  )
  context.subscriptions.push(
    manifold.window.registerWebviewViewProvider('manifold.hello.panel', {
      async resolveWebviewView(view) {
        const initial = (await manifold.storage.global.get('count', 0))
        view.webview.html = `<!doctype html><html><body style="font-family:system-ui;padding:14px;color:#ddd;background:#1e1e1e">
          <h3 style="margin-top:0">Hello from a Manifold plugin 👋</h3>
          <p>Clicks (persisted): <b id="count">${initial}</b></p>
          <button id="inc">+1</button>
          <script>
            document.getElementById('inc').addEventListener('click', () => parent.postMessage({ type: 'inc' }, '*'))
            window.addEventListener('message', (e) => { if (e.data && e.data.type === 'count') document.getElementById('count').textContent = e.data.value })
          </script></body></html>`
        view.webview.onDidReceiveMessage(async (msg) => {
          if (msg && msg.type === 'inc') {
            const next = (await manifold.storage.global.get('count', 0)) + 1
            await manifold.storage.global.update('count', next)
            view.webview.postMessage({ type: 'count', value: next })
          }
        })
      },
    }),
  )
}
exports.deactivate = () => {}
