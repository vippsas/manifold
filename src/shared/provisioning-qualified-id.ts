export function encodeProvisioningTemplateQualifiedId(provisionerId: string, templateId: string): string {
  return `${encodeURIComponent(provisionerId)}:${encodeURIComponent(templateId)}`
}

export function decodeProvisioningTemplateQualifiedId(
  qualifiedId: string,
): { provisionerId: string; templateId: string } | null {
  const index = qualifiedId.indexOf(':')
  if (index <= 0 || index === qualifiedId.length - 1) return null

  try {
    return {
      provisionerId: decodeURIComponent(qualifiedId.slice(0, index)),
      templateId: decodeURIComponent(qualifiedId.slice(index + 1)),
    }
  } catch {
    return null
  }
}
