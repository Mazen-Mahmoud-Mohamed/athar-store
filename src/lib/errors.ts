export type AppErrorCode =
  | 'unauthorized'
  | 'forbidden'
  | 'validation'
  | 'not_found'
  | 'network'
  | 'database'
  | 'not_configured'
  | 'unknown'

export class AppError extends Error {
  readonly code: AppErrorCode
  readonly status?: number
  readonly cause?: unknown

  constructor(code: AppErrorCode, message: string, options?: { status?: number; cause?: unknown }) {
    super(message)
    this.name = 'AppError'
    this.code = code
    this.status = options?.status
    this.cause = options?.cause
  }
}

export function toAppError(error: unknown, fallbackMessage = 'حدث خطأ غير متوقع'): AppError {
  if (error instanceof AppError) return error

  if (error instanceof TypeError && /fetch|network/i.test(error.message)) {
    return new AppError('network', 'تعذر الاتصال بالخادم. تحققي من الإنترنت.', { cause: error })
  }

  if (typeof error === 'object' && error !== null) {
    const err = error as {
      message?: string
      code?: string
      status?: number
      details?: string
      hint?: string
    }

    const message = err.message || fallbackMessage
    const status = err.status
    const code = err.code

    if (status === 401 || code === '401') {
      return new AppError('unauthorized', 'يجب تسجيل الدخول للمتابعة.', { status, cause: error })
    }

    if (status === 403 || code === '42501' || /permission|policy|row-level security/i.test(message)) {
      return new AppError('forbidden', 'ليس لديك صلاحية لتنفيذ هذا الإجراء.', { status, cause: error })
    }

    if (status === 404 || code === 'PGRST116') {
      return new AppError('not_found', 'العنصر المطلوب غير موجود.', { status, cause: error })
    }

    if (code === '23505' || /duplicate key|unique constraint/i.test(message)) {
      if (/slug/i.test(message) || /_slug_/i.test(message)) {
        return new AppError('validation', 'هذا الاسم مستخدم بالفعل. جرّبي اسماً مختلفاً.', {
          status,
          cause: error,
        })
      }
      return new AppError('validation', 'هذه البيانات مستخدمة بالفعل. تحققي من الاسم.', {
        status,
        cause: error,
      })
    }

    if (
      status === 400 ||
      code === '23514' ||
      code === '23502' ||
      code === '22P02' ||
      /invalid|required|check constraint|violates/i.test(message)
    ) {
      return new AppError('validation', fallbackMessage, { status, cause: error })
    }

    if (code?.startsWith('PGRST') || code?.startsWith('23') || status === 500) {
      return new AppError('database', 'تعذر إكمال العملية حالياً.', { status, cause: error })
    }

    // Never surface raw DB/network payloads to the UI.
    return new AppError('unknown', fallbackMessage, { status, cause: error })
  }

  if (typeof error === 'string') {
    return new AppError('unknown', error)
  }

  return new AppError('unknown', fallbackMessage, { cause: error })
}

export function getErrorMessage(error: unknown, fallback = 'حدث خطأ غير متوقع') {
  return toAppError(error, fallback).message
}
