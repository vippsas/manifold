import { useEffect } from 'react'
import { deriveBranchName } from '../../shared/derive-branch-name'

export function useDebouncedBranchDerivation(
  taskDescription: string,
  branchEdited: boolean,
  setBranchName: (v: string) => void,
  projectName: string
): void {
  useEffect(() => {
    if (branchEdited) return

    const timer = setTimeout(() => {
      setBranchName(deriveBranchName(taskDescription, projectName))
    }, 300)

    return () => clearTimeout(timer)
  }, [taskDescription, branchEdited, setBranchName, projectName])
}
