import type {
  ProvisionerErrorPayload,
  ProvisioningErrorCategory,
  ProvisioningErrorDescriptor,
} from '../../shared/provisioning-types'

function normalizeCode(category: ProvisioningErrorCategory, code?: string): string {
  return code?.trim() || category
}

export class ProvisioningError extends Error {
  descriptor: ProvisioningErrorDescriptor

  constructor(
    category: ProvisioningErrorCategory,
    message: string,
    options?: {
      code?: string
      retryable?: boolean
      details?: Record<string, string>
    },
  ) {
    super(message)
    this.name = 'ProvisioningError'
    this.descriptor = {
      category,
      code: normalizeCode(category, options?.code),
      message,
      retryable: options?.retryable ?? false,
      details: options?.details,
    }
  }
}

export function toProvisioningErrorDescriptor(
  error: unknown,
  fallback: ProvisioningErrorCategory = 'create_failed',
): ProvisioningErrorDescriptor {
  if (error instanceof ProvisioningError) {
    return error.descriptor
  }
  if (error instanceof Error) {
    return {
      category: fallback,
      code: normalizeCode(fallback),
      message: error.message,
      retryable: false,
    }
  }
  return {
    category: fallback,
    code: normalizeCode(fallback),
    message: String(error),
    retryable: false,
  }
}

export function fromProvisionerErrorPayload(payload: ProvisionerErrorPayload): ProvisioningError {
  return new ProvisioningError(
    payload.category ?? 'create_failed',
    payload.message || 'Provisioner returned an error',
    {
      code: payload.code,
      retryable: payload.retryable,
      details: payload.details,
    },
  )
}
