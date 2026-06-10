import { describe, it, expect, vi } from 'vitest'
import type { BrowserWindow } from 'electron'

// Capture the template passed to Menu.buildFromTemplate so we can drive clicks.
let lastTemplate: Electron.MenuItemConstructorOptions[] = []
vi.mock('electron', () => ({
  Menu: {
    buildFromTemplate: (template: Electron.MenuItemConstructorOptions[]) => {
      lastTemplate = template
      return template
    },
  },
}))

import { buildAppMenu } from './app-menu'

type Item = Electron.MenuItemConstructorOptions
function flatten(items: Item[]): Item[] {
  const out: Item[] = []
  for (const item of items) {
    out.push(item)
    if (Array.isArray(item.submenu)) out.push(...flatten(item.submenu as Item[]))
  }
  return out
}

function clickAll(): void {
  for (const item of flatten(lastTemplate)) {
    if (typeof item.click === 'function') {
      // @ts-expect-error click signature is broad; we only exercise the closure.
      item.click()
    }
  }
}

function makeWindow(destroyed: boolean): { win: BrowserWindow; send: ReturnType<typeof vi.fn> } {
  const send = vi.fn()
  const win = {
    isDestroyed: () => destroyed,
    webContents: { send },
  } as unknown as BrowserWindow
  return { win, send }
}

const options = { keepAwake: false, onToggleKeepAwake: vi.fn() }

describe('buildAppMenu', () => {
  it('routes menu clicks to webContents.send when the window is alive', () => {
    const { win, send } = makeWindow(false)
    buildAppMenu(win, options)
    clickAll()
    expect(send).toHaveBeenCalledWith('show-about')
    expect(send).toHaveBeenCalledWith('show-settings')
    expect(send.mock.calls.length).toBeGreaterThan(0)
  })

  it('does not throw or send when the captured window is destroyed (macOS Cmd+W)', () => {
    const { win, send } = makeWindow(true)
    buildAppMenu(win, options)
    expect(() => clickAll()).not.toThrow()
    expect(send).not.toHaveBeenCalled()
  })
})
