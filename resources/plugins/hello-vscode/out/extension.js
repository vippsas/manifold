// resources/plugins/hello-vscode/out/extension.js
const vscode = require('vscode')

async function activate(context) {
  // globalState round-trip proves ExtensionContext is backed by Manifold storage.
  const count = (await context.globalState.get('greetCount', 0)) + 1
  await context.globalState.update('greetCount', count)

  const disposable = vscode.commands.registerCommand('helloVscode.hello', async () => {
    await vscode.window.showInformationMessage(`Hello from a VS Code extension (greet #${count})`)
    return `greeted:${count}`
  })
  context.subscriptions.push(disposable)
}

function deactivate() {}

module.exports = { activate, deactivate }
