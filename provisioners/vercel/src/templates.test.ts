import { describe, expect, it } from 'vitest'
import { getTemplates, TEMPLATE_REPOS } from './templates'

describe('bundled Vercel templates', () => {
  it('includes the tool researcher template in the bundled catalog', () => {
    const templates = getTemplates()
    expect(templates.map((template) => template.id)).toEqual([
      'vercel-starter',
      'tool-researcher',
    ])

    expect(templates[1]).toEqual(expect.objectContaining({
      id: 'tool-researcher',
      title: 'Tool Researcher',
      category: 'Research',
    }))
    expect(templates[1]?.promptInstructions).toContain('NOT a React or Next.js app')
  })

  it('maps each template id to its GitHub template repository', () => {
    expect(TEMPLATE_REPOS).toEqual({
      'vercel-starter': 'svenmalvik/manifold_vercel_template',
      'tool-researcher': 'svenmalvik/tool_researcher',
    })
  })
})
