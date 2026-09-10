import { AddRepositoryModal } from './AddRepositoryModal'

export default (
  <div>
    <AddRepositoryModal
      visible
      currentWorkspace={{ id: 'checkout', name: 'Checkout redesign' }}
      onAddProject={() => undefined}
      onCloneProject={async () => false}
      onCreateNewProject={async () => false}
      creatingProject={false}
      cloningProject={false}
      createError={null}
      onClose={() => undefined}
    />
  </div>
)
