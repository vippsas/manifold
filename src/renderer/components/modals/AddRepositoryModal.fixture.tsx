import { AddRepositoryModal } from './AddRepositoryModal'

export default (
  <AddRepositoryModal
    visible
    onAddProject={() => undefined}
    onCloneProject={async () => false}
    onCreateNewProject={async () => false}
    creatingProject={false}
    cloningProject={false}
    createError={null}
    onClose={() => undefined}
  />
)
