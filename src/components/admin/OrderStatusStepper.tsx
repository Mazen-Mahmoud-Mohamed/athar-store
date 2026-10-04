import { ORDER_STATUS_LABELS } from '@/lib/orderStatus'
import { cn } from '@/lib/utils'
import type { OrderStatus } from '@/types'

const FLOW: OrderStatus[] = ['pending', 'confirmed', 'preparing', 'shipped', 'delivered']

type OrderStatusStepperProps = {
  status: OrderStatus
  className?: string
}

export function OrderStatusStepper({ status, className }: OrderStatusStepperProps) {
  if (status === 'cancelled') {
    return (
      <div
        className={cn(
          'rounded-xl border border-danger/30 bg-danger/5 px-4 py-3 text-sm text-danger',
          className,
        )}
        role="status"
      >
        <p className="font-medium">الطلب ملغي</p>
        <p className="mt-1 text-xs leading-6 text-danger/90">
          هذا الطلب في حالة نهائية ولن يكمل مسار التجهيز والتسليم.
        </p>
      </div>
    )
  }

  const currentIndex = FLOW.indexOf(status)

  return (
    <div
      className={cn('rounded-xl border border-taupe/40 bg-card px-4 py-4 sm:px-5', className)}
      role="group"
      aria-label="مسار حالة الطلب"
    >
      <ol className="flex flex-col gap-0 sm:flex-row sm:items-start sm:justify-between">
        {FLOW.map((step, index) => {
          const done = currentIndex > index
          const current = currentIndex === index
          const upcoming = currentIndex < index

          return (
            <li
              key={step}
              className="relative flex gap-3 pb-4 last:pb-0 sm:flex-1 sm:flex-col sm:items-center sm:gap-2 sm:pb-0 sm:text-center"
            >
              {index < FLOW.length - 1 ? (
                <span
                  className={cn(
                    'absolute start-[13px] top-7 h-[calc(100%-1.25rem)] w-px sm:start-auto sm:top-[13px] sm:end-0 sm:h-px sm:w-1/2 sm:translate-x-1/2',
                    done ? 'bg-brown/45' : 'bg-taupe/35',
                  )}
                  aria-hidden
                />
              ) : null}
              {index > 0 ? (
                <span
                  className={cn(
                    'absolute end-1/2 top-[13px] hidden h-px w-1/2 sm:block',
                    currentIndex >= index ? 'bg-brown/45' : 'bg-taupe/35',
                  )}
                  aria-hidden
                />
              ) : null}

              <span
                className={cn(
                  'relative z-[1] flex size-7 shrink-0 items-center justify-center rounded-full text-[11px] font-semibold',
                  done && 'bg-brown text-cream',
                  current &&
                    (step === 'pending'
                      ? 'border-2 border-gold-deep bg-gold/30 text-espresso'
                      : 'bg-gold text-espresso'),
                  upcoming && 'border border-taupe/50 bg-mist text-mocha/70',
                )}
                aria-current={current ? 'step' : undefined}
              >
                {done ? '✓' : index + 1}
              </span>

              <div className="min-w-0 pt-0.5 sm:pt-0">
                <p
                  className={cn(
                    'text-sm',
                    done && 'font-medium text-brown',
                    current && 'font-semibold text-espresso',
                    upcoming && 'text-mocha/70',
                  )}
                >
                  {ORDER_STATUS_LABELS[step]}
                </p>
                {current ? (
                  <p className="mt-0.5 text-[11px] text-mocha">الحالة الحالية</p>
                ) : null}
              </div>
            </li>
          )
        })}
      </ol>
    </div>
  )
}
