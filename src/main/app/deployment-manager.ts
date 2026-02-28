export interface ShellCommand {
  binary: string
  args: string[]
}

export class DeploymentManager {
  buildScaffoldCommand(appName: string, templateRepo: string): ShellCommand {
    return {
      binary: 'gh',
      args: [
        'workflow', 'run', 'vipps-service.yml',
        '--repo', templateRepo,
        '--field', `name=${appName}`,
      ],
    }
  }

  buildDeployCommand(repoFullName: string): ShellCommand {
    return {
      binary: 'gh',
      args: [
        'workflow', 'run', 'deploy.yml',
        '--repo', repoFullName,
      ],
    }
  }

  buildAgentPrompt(appDescription: string): string {
    return [
      'You are building a webapp. The repository has already been scaffolded with Kubernetes config and deployment workflows — do not modify those files.',
      '',
      `The user wants: ${appDescription}`,
      '',
      'Your tasks:',
      '1. Create the webapp application code (HTML, CSS, JavaScript or a simple framework)',
      '2. Create a Dockerfile that builds and serves the webapp',
      '3. Make sure the app runs on port 3000',
      '4. Commit and push your changes',
      '',
      'Keep it simple and working. Do not add unnecessary dependencies.',
    ].join('\n')
  }
}
