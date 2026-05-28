import { BrowserWindow } from 'electron'
import { detectVercelUrl, detectVercelDeployFailure } from '../agent/status-detector'
import type { InternalSession } from './session-types'

/**
 * Scan the session's output buffer for a Vercel deploy URL or a deploy
 * failure and broadcast a `simple:deploy-status-update` to all windows.
 */
export function checkVercelDeploy(session: InternalSession): void {
  const vercelUrl = detectVercelUrl(session.outputBuffer)
  if (vercelUrl && (!session.detectedVercelUrl || vercelUrl.length < session.detectedVercelUrl.length)) {
    session.detectedVercelUrl = vercelUrl
    for (const win of BrowserWindow.getAllWindows()) {
      if (!win.isDestroyed()) {
        win.webContents.send('simple:deploy-status-update', {
          sessionId: session.id,
          stage: 'live',
          message: 'Deployed successfully',
          url: vercelUrl,
        })
      }
    }
  }

  if ((!session.detectedVercelUrl || session.detectedVercelUrl === '__failed__') && detectVercelDeployFailure(session.outputBuffer)) {
    session.detectedVercelUrl = '__failed__'
    for (const win of BrowserWindow.getAllWindows()) {
      if (!win.isDestroyed()) {
        win.webContents.send('simple:deploy-status-update', {
          sessionId: session.id,
          stage: 'error',
          message: 'Deploy failed',
        })
      }
    }
  }
}
