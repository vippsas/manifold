import { powerSaveBlocker } from 'electron'

export class PowerManager {
  private blockerId: number | null = null

  enable(): void {
    if (this.blockerId !== null) return
    this.blockerId = powerSaveBlocker.start('prevent-app-suspension')
  }

  disable(): void {
    if (this.blockerId === null) return
    powerSaveBlocker.stop(this.blockerId)
    this.blockerId = null
  }

  isEnabled(): boolean {
    return this.blockerId !== null
  }
}
