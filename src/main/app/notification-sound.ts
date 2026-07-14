export function playNotificationSound(
  beep: () => void,
  platform: NodeJS.Platform = process.platform,
  env: NodeJS.ProcessEnv = process.env,
): void {
  if (platform === 'linux' && (env.WSL_DISTRO_NAME || env.WSL_INTEROP)) return
  beep()
}
