import { useEffect } from 'react'
import type { BranchInfo, PRInfo } from '../../shared/types'
import type { ModalTab, ExistingSubTab } from '../components/new-task/types'

export function useResetOnOpen(
  visible: boolean,
  defaultRuntime: string,
  setTaskDescription: (v: string) => void,
  setRuntimeId: (v: string) => void,
  setBranchName: (v: string) => void,
  setBranchEdited: (v: boolean) => void,
  setShowAdvanced: (v: boolean) => void,
  setLoading: (v: boolean) => void,
  setActiveTab: (v: ModalTab) => void,
  setExistingSubTab: (v: ExistingSubTab) => void,
  setBranches: (v: BranchInfo[]) => void,
  setBranchFilter: (v: string) => void,
  setSelectedBranch: (v: string) => void,
  setPrs: (v: PRInfo[]) => void,
  setPrFilter: (v: string) => void,
  setSelectedPr: (v: number | null) => void,
  setError: (v: string) => void
): void {
  useEffect(() => {
    if (!visible) return
    setTaskDescription('')
    setRuntimeId(defaultRuntime)
    setBranchName('')
    setBranchEdited(false)
    setShowAdvanced(false)
    setLoading(false)
    setActiveTab('new')
    setExistingSubTab('branch')
    setBranches([])
    setBranchFilter('')
    setSelectedBranch('')
    setPrs([])
    setPrFilter('')
    setSelectedPr(null)
    setError('')
  }, [visible, defaultRuntime, setTaskDescription, setRuntimeId, setBranchName, setBranchEdited, setShowAdvanced, setLoading, setActiveTab, setExistingSubTab, setBranches, setBranchFilter, setSelectedBranch, setPrs, setPrFilter, setSelectedPr, setError])
}
