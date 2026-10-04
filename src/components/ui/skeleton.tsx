import { cn } from '@/lib/utils'

function Skeleton({ className, ...props }: React.ComponentProps<'div'>) {
  return (
    <div
      className={cn(
        'relative overflow-hidden rounded-md bg-sand/55',
        'after:pointer-events-none after:absolute after:inset-0 after:-translate-x-full',
        'after:bg-gradient-to-r after:from-transparent after:via-ivory/70 after:to-transparent',
        'motion-safe:after:animate-[athar-shimmer_1.8s_ease-in-out_infinite]',
        'motion-reduce:after:hidden',
        className,
      )}
      {...props}
    />
  )
}

export { Skeleton }
