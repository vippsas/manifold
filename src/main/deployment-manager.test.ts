import { describe, it, expect, beforeEach } from 'vitest'
import { DeploymentManager } from './deployment-manager'

describe('DeploymentManager', () => {
  let manager: DeploymentManager

  beforeEach(() => {
    manager = new DeploymentManager()
  })

  it('builds the gh workflow command for scaffolding', () => {
    const cmd = manager.buildScaffoldCommand('my-webapp', 'vippsas/service-templates')
    expect(cmd.binary).toBe('gh')
    expect(cmd.args).toContain('workflow')
    expect(cmd.args).toContain('run')
    expect(cmd.args.some(a => a.includes('my-webapp'))).toBe(true)
  })

  it('builds the gh workflow command for deployment', () => {
    const cmd = manager.buildDeployCommand('vippsas/my-webapp')
    expect(cmd.binary).toBe('gh')
    expect(cmd.args).toContain('workflow')
    expect(cmd.args).toContain('run')
  })

  it('builds the agent system prompt with app description', () => {
    const prompt = manager.buildAgentPrompt('A landing page for collecting customer feedback')
    expect(prompt).toContain('landing page')
    expect(prompt).toContain('customer feedback')
    expect(prompt).toContain('Dockerfile')
    expect(prompt).not.toContain('Terraform')
  })
})
