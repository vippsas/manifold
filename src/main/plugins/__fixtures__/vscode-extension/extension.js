// src/main/plugins/__fixtures__/vscode-extension/extension.js
// Hand-written, VS Code-idiomatic CommonJS: the shim integration test loads THIS file
// through the real CJS loader so its `require('vscode')` exercises the interceptor.
// Deliberately not compiled from src/ — it stands in for an unmodified external .vsix.
const vscode = require('vscode')

async function activate(context) {
  // globalState round-trip proves ExtensionContext is backed by Manifold storage.
  const count = (await context.globalState.get('greetCount', 0)) + 1
  await context.globalState.update('greetCount', count)

  const disposable = vscode.commands.registerCommand('fixture.greet', async () => {
    await vscode.window.showInformationMessage(`Hello from a VS Code extension (greet #${count})`)
    return `greeted:${count}`
  })
  context.subscriptions.push(disposable)
}

function deactivate() {}

module.exports = { activate, deactivate }
