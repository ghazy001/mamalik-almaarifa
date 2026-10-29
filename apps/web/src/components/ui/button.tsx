import * as React from 'react';
import { Slot } from '@radix-ui/react-slot';
import { cva } from 'class-variance-authority';
import type { VariantProps } from 'class-variance-authority';
import { cn } from '../../lib/utils';

// shadcn/ui pattern (MIT), customized for this game's tokens and RTL shell.
const buttonVariants = cva(
  'inline-flex min-h-12 items-center justify-center gap-3 rounded-lg px-6 py-3 text-sm font-bold transition-colors focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-[var(--gold)]',
  {
    variants: {
      variant: {
        default:
          'bg-[var(--gold)] text-[var(--ink)] hover:bg-[var(--gold-bright)]',
        outline:
          'border border-[var(--border)] bg-transparent text-[var(--text)] hover:bg-white/5',
      },
    },
    defaultVariants: { variant: 'default' },
  },
);
export interface ButtonProps
  extends React.ComponentProps<'button'>, VariantProps<typeof buttonVariants> {
  asChild?: boolean;
}
export function Button({
  asChild = false,
  variant,
  className,
  ...props
}: ButtonProps) {
  const Comp = asChild ? Slot : 'button';
  return (
    <Comp
      data-slot="button"
      className={cn(buttonVariants({ variant, className }))}
      {...props}
    />
  );
}
