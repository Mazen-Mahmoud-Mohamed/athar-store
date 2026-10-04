import * as React from 'react'
import * as DialogPrimitive from '@radix-ui/react-dialog'
import { cva, type VariantProps } from 'class-variance-authority'
import { X } from 'lucide-react'
import { cn } from '@/lib/utils'

const Sheet = DialogPrimitive.Root
const SheetTrigger = DialogPrimitive.Trigger
const SheetClose = DialogPrimitive.Close
const SheetPortal = DialogPrimitive.Portal

function SheetOverlay({
  className,
  ...props
}: React.ComponentProps<typeof DialogPrimitive.Overlay>) {
  return (
    <DialogPrimitive.Overlay
      className={cn(
        'fixed inset-0 z-50 bg-espresso/35 backdrop-blur-[1.5px] transition-opacity data-[state=open]:opacity-100 data-[state=closed]:opacity-0',
        className,
      )}
      {...props}
    />
  )
}

const sheetVariants = cva(
  'fixed z-50 gap-4 bg-card p-6 shadow-lift transition-transform duration-300 ease-out',
  {
    variants: {
      side: {
        top: 'inset-x-0 top-0 border-b border-taupe/40 data-[state=closed]:-translate-y-full data-[state=open]:translate-y-0',
        bottom:
          'inset-x-0 bottom-0 border-t border-taupe/40 data-[state=closed]:translate-y-full data-[state=open]:translate-y-0',
        // Physical edges so side="right" always opens from the viewport right in LTR and RTL.
        left: 'inset-y-0 left-0 h-full w-3/4 border-r border-taupe/40 data-[state=closed]:-translate-x-full data-[state=open]:translate-x-0 sm:max-w-sm',
        right:
          'inset-y-0 right-0 h-full w-3/4 border-l border-taupe/40 data-[state=closed]:translate-x-full data-[state=open]:translate-x-0 sm:max-w-sm',
      },
    },
    defaultVariants: {
      side: 'right',
    },
  },
)

function SheetContent({
  side = 'right',
  className,
  children,
  ...props
}: React.ComponentProps<typeof DialogPrimitive.Content> &
  VariantProps<typeof sheetVariants>) {
  return (
    <SheetPortal>
      <SheetOverlay />
      <DialogPrimitive.Content
        className={cn(sheetVariants({ side }), className)}
        {...props}
      >
        {children}
        <DialogPrimitive.Close className="absolute end-3 top-3 flex size-10 items-center justify-center rounded-md text-mocha opacity-80 transition hover:text-brown hover:opacity-100 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brown">
          <X className="size-4" aria-hidden="true" />
          <span className="sr-only">إغلاق</span>
        </DialogPrimitive.Close>
      </DialogPrimitive.Content>
    </SheetPortal>
  )
}

function SheetHeader({ className, ...props }: React.ComponentProps<'div'>) {
  return <div className={cn('flex flex-col gap-1.5 text-start', className)} {...props} />
}

function SheetTitle({
  className,
  ...props
}: React.ComponentProps<typeof DialogPrimitive.Title>) {
  return (
    <DialogPrimitive.Title
      className={cn('font-display text-lg font-semibold text-brown', className)}
      {...props}
    />
  )
}

function SheetDescription({
  className,
  ...props
}: React.ComponentProps<typeof DialogPrimitive.Description>) {
  return (
    <DialogPrimitive.Description
      className={cn('text-sm text-mocha', className)}
      {...props}
    />
  )
}

export {
  Sheet,
  SheetTrigger,
  SheetClose,
  SheetPortal,
  SheetOverlay,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
}
