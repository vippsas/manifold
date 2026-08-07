// Screenshot fixture for the three-path chooser (New project / Local repo /
// Clone from Git). `npm run screenshot:component NoProjectActions --theme manifold-dark`
import { NoProjectActions } from './NoProjectActions'

export default (
  <div style={{ display: 'flex', justifyContent: 'center', padding: 'var(--space-xl)', background: 'var(--bg-overlay)' }}>
    <NoProjectActions
      onAddProject={() => undefined}
      onCloneProject={async () => false}
      onCreateNewProject={async () => false}
      creatingProject={false}
      cloningProject={false}
      createError={null}
    />
  </div>
)
