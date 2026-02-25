import { useEffect } from 'react'
import type { BranchInfo, PRInfo } from '../../shared/types'
import type { ExistingSubTab } from '../components/new-task/types'

export function useResetOnOpen(
  visible: boolean,
  defaultRuntime: string,
  initialDescription: string,
  setTaskDescription: (v: string) => void,
  setRuntimeId: (v: string) => void,
  setLoading: (v: boolean) => void,
  setUseExisting: (v: boolean) => void,
  setExistingSubTab: (v: ExistingSubTab) => void,
  setBranches: (v: BranchInfo[]) => void,
  setBranchFilter: (v: string) => void,
  setSelectedBranch: (v: string) => void,
  setPrs: (v: PRInfo[]) => void,
  setPrFilter: (v: string) => void,
  setSelectedPr: (v: number | null) => void,
  setError: (v: string) => void,
  setNoWorktree: (v: boolean) => void
): void {
  useEffect(() => {
    if (!visible) return
    setTaskDescription(initialDescription)
    setRuntimeId(defaultRuntime)
    setLoading(false)
    setUseExisting(false)
    setExistingSubTab('branch')
    setBranches([])
    setBranchFilter('')
    setSelectedBranch('')
    setPrs([])
    setPrFilter('')
    setSelectedPr(null)
    setError('')
    setNoWorktree(false)
  }, [visible, defaultRuntime, initialDescription, setTaskDescription, setRuntimeId, setLoading, setUseExisting, setExistingSubTab, setBranches, setBranchFilter, setSelectedBranch, setPrs, setPrFilter, setSelectedPr, setError, setNoWorktree])
}
