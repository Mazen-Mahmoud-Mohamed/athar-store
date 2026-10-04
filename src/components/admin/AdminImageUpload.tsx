import { useId, useRef } from 'react'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { cn } from '@/lib/utils'

type AdminImageUploadProps = {
  label?: string
  accept?: string
  helperText?: string
  previewUrl?: string | null
  fileName?: string | null
  onFileChange: (file: File | null) => void
  className?: string
  previewClassName?: string
}

const DEFAULT_ACCEPT = '.jpg,.jpeg,.png,.webp,image/jpeg,image/png,image/webp'

export function AdminImageUpload({
  label,
  accept = DEFAULT_ACCEPT,
  helperText = 'اختاري صورة واضحة (حتى 5 ميجابايت).',
  previewUrl = null,
  fileName = null,
  onFileChange,
  className,
  previewClassName,
}: AdminImageUploadProps) {
  const generatedId = useId()
  const inputId = `admin-image-${generatedId}`
  const inputRef = useRef<HTMLInputElement>(null)
  const hasPreview = Boolean(previewUrl)
  const resolvedLabel = label ?? (hasPreview ? 'تغيير الصورة' : 'إضافة صورة')
  const statusText = fileName
    ? 'تم اختيار الصورة'
    : hasPreview
      ? 'الصورة الحالية محفوظة'
      : 'لم يتم اختيار ملف'

  return (
    <div className={cn('space-y-2', className)}>
      <Label htmlFor={inputId}>{resolvedLabel}</Label>
      <input
        ref={inputRef}
        id={inputId}
        type="file"
        accept={accept}
        className="sr-only"
        onChange={(e) => {
          onFileChange(e.target.files?.[0] ?? null)
        }}
      />
      <div className="flex flex-wrap items-center gap-3">
        <Button
          type="button"
          variant="outline"
          onClick={() => inputRef.current?.click()}
        >
          {hasPreview ? 'تغيير الصورة' : 'اختيار صورة'}
        </Button>
        <p className="text-sm text-mocha" aria-live="polite">
          {statusText}
          {fileName ? <span className="mt-0.5 block text-xs opacity-80">{fileName}</span> : null}
        </p>
      </div>
      {helperText ? <p className="text-xs text-mocha">{helperText}</p> : null}
      {hasPreview ? (
        <img
          src={previewUrl!}
          alt="معاينة الصورة"
          className={cn('mt-2 rounded-md object-cover', previewClassName)}
        />
      ) : previewClassName ? (
        <div
          className={cn(
            'mt-2 flex items-center justify-center rounded-md bg-mist text-xs text-mocha',
            previewClassName,
          )}
        >
          بلا صورة
        </div>
      ) : null}
    </div>
  )
}
