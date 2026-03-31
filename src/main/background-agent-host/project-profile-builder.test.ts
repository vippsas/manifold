import { describe, expect, it } from 'vitest'
import { buildProjectProfile } from '../../../background-agent/core/project-profile/project-profile-builder'

describe('buildProjectProfile', () => {
  it('promotes note-file TODOs into open questions and keeps recent change hints', () => {
    const profile = buildProjectProfile({
      projectId: 'project-1',
      projectName: 'Project One',
      projectPath: '/repo',
      documents: [{
        path: 'README.md',
        kind: 'readme',
        content: '# Project One\n\nA desktop tool for agentic developer workflows.',
      }, {
        path: 'TODO',
        kind: 'note',
        content: [
          'TODO: add a weekly digest for ecosystem watch',
          '- [ ] improve source quality feedback',
        ].join('\n'),
      }],
      packageManifest: {
        name: 'project-one',
        description: 'Project One',
        dependencies: ['electron', 'react'],
        devDependencies: ['typescript'],
        scripts: ['test'],
      },
      repoStructure: {
        topLevelEntries: ['README.md', 'TODO', 'src', 'package.json'],
        docDirectories: [],
        probableStack: ['electron', 'react', 'typescript', 'node'],
        hasPackageJson: true,
      },
      recentChangeHints: ['Recent PR: Add ecosystem watch groundwork (#123)'],
    })

    expect(profile.openQuestions).toEqual(expect.arrayContaining([
      'add a weekly digest for ecosystem watch',
      'improve source quality feedback',
    ]))
    expect(profile.recentChanges).toEqual(['Recent PR: Add ecosystem watch groundwork (#123)'])
  })
})
