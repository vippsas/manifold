# Renderer Components Folder Grouping — Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Reorganize the flat `src/renderer/components/` directory (41 files) into domain-based subfolders.

**Architecture:** Move files into 5 subfolders (`sidebar/`, `editor/`, `terminal/`, `modals/`, `git/`) and keep the existing `new-task/` subfolder. Update all import paths within moved files and in external consumers (`App.tsx`). No config changes needed.

**Baseline:** 33 test files, 440 tests passing. No new typecheck errors.

---

## File Mapping

### `sidebar/`
| File | Notes |
|---|---|
| ProjectSidebar.tsx | Imports AgentItem, ProjectSettingsPopover |
| ProjectSidebar.styles.ts | |
| ProjectSidebar.test.tsx | |
| AgentItem.tsx | Imports ProjectSidebar.styles |
| ProjectSettingsPopover.tsx | |
| NoProjectActions.tsx | |

### `editor/`
| File | Notes |
|---|---|
| dock-panels.tsx | Hub component — imports from all subfolders |
| CodeViewer.tsx | |
| CodeViewer.styles.ts | |
| code-viewer-utils.ts | |
| code-viewer-utils.test.ts | |
| FileTree.tsx | Imports tree-node |
| FileTree.styles.ts | Used by both FileTree and tree-node |
| tree-node.tsx | Imports file-icons, FileTree.styles |
| file-icons.ts | |

### `terminal/`
| File | Notes |
|---|---|
| TerminalPane.tsx | |
| ShellTabs.tsx | |
| ShellTabs.styles.ts | |
| shell-tabs-hooks.ts | |
| WebPreview.tsx | |

### `modals/`
| File | Notes |
|---|---|
| SettingsModal.tsx | Imports ThemePicker |
| SettingsModal.styles.ts | |
| SettingsModal.test.tsx | |
| AboutOverlay.tsx | |
| AboutOverlay.styles.ts | |
| NewAgentPopover.tsx | |
| NewAgentPopover.styles.ts | |
| NewAgentPopover.test.tsx | |
| NewAgentForm.tsx | Imports NewTaskModal.styles, new-task/ |
| NewTaskModal.styles.ts | |
| WelcomeDialog.tsx | |
| OnboardingView.tsx | Imports NewAgentForm (same folder), NoProjectActions (sidebar/) |
| ThemePicker.tsx | |
| ThemePicker.styles.ts | |

### `git/`
| File | Notes |
|---|---|
| CommitPanel.tsx | |
| ConflictPanel.tsx | |
| PRPanel.tsx | |
| ModifiedFiles.tsx | |
| ModifiedFiles.test.tsx | |
| StatusBar.tsx | |
| StatusBar.test.tsx | |

### `new-task/` — unchanged

---

## Import Path Changes

### App.tsx (`src/renderer/App.tsx`) — 9 imports change

| Old | New |
|---|---|
| `./components/dock-panels` | `./components/editor/dock-panels` |
| `./components/OnboardingView` | `./components/modals/OnboardingView` |
| `./components/SettingsModal` | `./components/modals/SettingsModal` |
| `./components/AboutOverlay` | `./components/modals/AboutOverlay` |
| `./components/StatusBar` | `./components/git/StatusBar` |
| `./components/CommitPanel` | `./components/git/CommitPanel` |
| `./components/PRPanel` | `./components/git/PRPanel` |
| `./components/ConflictPanel` | `./components/git/ConflictPanel` |
| `./components/WelcomeDialog` | `./components/modals/WelcomeDialog` |

### Cross-folder component imports

| File (new location) | Old import | New import |
|---|---|---|
| `editor/dock-panels.tsx` | `./TerminalPane` | `../terminal/TerminalPane` |
| `editor/dock-panels.tsx` | `./ShellTabs` | `../terminal/ShellTabs` |
| `editor/dock-panels.tsx` | `./OnboardingView` | `../modals/OnboardingView` |
| `editor/dock-panels.tsx` | `./ProjectSidebar` | `../sidebar/ProjectSidebar` |
| `editor/dock-panels.tsx` | `./WebPreview` | `../terminal/WebPreview` |
| `editor/dock-panels.tsx` | `./ModifiedFiles` | `../git/ModifiedFiles` |
| `modals/OnboardingView.tsx` | `./NewAgentForm` | stays `./NewAgentForm` |
| `modals/OnboardingView.tsx` | `./NoProjectActions` | `../sidebar/NoProjectActions` |
| `modals/NewAgentForm.tsx` | `./new-task` | `../new-task` |

### Shared imports depth change

All files moving into subfolders: `../../shared/` becomes `../../../shared/`

### Hook imports depth change

All files moving into subfolders: `../hooks/` becomes `../../hooks/`
