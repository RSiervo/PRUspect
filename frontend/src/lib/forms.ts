import type { FieldValues, Path, UseFormSetError } from 'react-hook-form'
import { toast } from 'sonner'

import { ApiError, errorMessage } from './api'

/**
 * Show server validation errors on matching form fields (using `fieldMap` to
 * translate API names to form names) and toast anything left over.
 */
export function applyServerErrors<T extends FieldValues>(
  error: unknown,
  setError: UseFormSetError<T>,
  fieldMap: Record<string, Path<T>> = {},
  knownFields: string[] = [],
) {
  if (error instanceof ApiError && Object.keys(error.fieldErrors).length) {
    let unmatched = false
    for (const [field, messages] of Object.entries(error.fieldErrors)) {
      const target = fieldMap[field] ?? (knownFields.includes(field) ? (field as Path<T>) : null)
      if (target) setError(target, { type: 'server', message: messages[0] })
      else unmatched = true
    }
    toast.error(unmatched ? `${error.message} ${Object.values(error.fieldErrors)[0]?.[0] ?? ''}` : error.message)
    return
  }
  toast.error(errorMessage(error))
}
