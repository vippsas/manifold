const manifold = require('manifold')

exports.activate = (context) => {
  context.subscriptions.push(
    manifold.commands.registerCommand('manifold.hello.ping', (name) => `pong:${name ?? 'world'}`),
  )
  context.subscriptions.push(
    manifold.window.registerWebviewViewProvider('manifold.hello.panel', {
      resolveWebviewView(view) {
        view.webview.html = `<!doctype html><html><body style="font-family:system-ui;padding:14px;color:#ddd;background:#1e1e1e">
          <h3 style="margin-top:0">Hello from a Manifold plugin 👋</h3>
          <button id="ping">Ping host</button>
          <pre id="out" style="white-space:pre-wrap"></pre>
          <script>
            const out = document.getElementById('out')
            document.getElementById('ping').addEventListener('click', () => parent.postMessage({ type: 'ping', at: Date.now() }, '*'))
            window.addEventListener('message', (e) => { out.textContent = 'host → ' + JSON.stringify(e.data) })
          </script></body></html>`
        view.webview.onDidReceiveMessage((msg) => { view.webview.postMessage({ type: 'pong', echo: msg }) })
      },
    }),
  )
}
exports.deactivate = () => {}
