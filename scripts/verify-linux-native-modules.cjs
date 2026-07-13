const path = require('node:path')

const root = path.resolve(process.argv[2])
const nativeModules = [
  'resources/app.asar.unpacked/node_modules/node-pty/build/Release/pty.node',
  'resources/app.asar.unpacked/node_modules/better-sqlite3/build/Release/better_sqlite3.node',
  'resources/app.asar.unpacked/node_modules/@napi-rs/canvas-linux-x64-gnu/skia.linux-x64-gnu.node',
]

for (const relativePath of nativeModules) require(path.join(root, relativePath))
