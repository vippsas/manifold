interface ElectronAppLike {
  disableHardwareAcceleration(): void
  commandLine: { appendSwitch(name: string): void }
}

export function configureLinuxRendering(
  app: ElectronAppLike,
  platform: NodeJS.Platform = process.platform,
  env: NodeJS.ProcessEnv = process.env,
): void {
  if (platform !== 'linux') return

  app.commandLine.appendSwitch('disable-dev-shm-usage')
  if (env.WSL_DISTRO_NAME || env.WSL_INTEROP) {
    app.disableHardwareAcceleration()
  }
}
