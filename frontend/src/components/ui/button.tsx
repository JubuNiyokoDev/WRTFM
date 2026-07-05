import * as React from 'react';
import { Slot } from '@radix-ui/react-slot';
import { cn } from '@/lib/utils';
import { cva, type VariantProps } from 'class-variance-authority';

const buttonVariants = cva(
  'inline-flex min-w-0 items-center justify-center gap-1.5 whitespace-nowrap rounded-[12px] text-xs font-semibold transition-all duration-200 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-50 sm:text-sm [&_svg]:pointer-events-none [&_svg]:size-3.5 sm:[&_svg]:size-4 [&_svg]:shrink-0' +
    ' hover-elevate active-elevate-2',
  {
    variants: {
      variant: {
        default:

          'app-button bg-primary text-primary-foreground border border-primary-border shadow-sm hover:-translate-y-0.5',
        destructive:
          'bg-destructive text-destructive-foreground shadow-sm border-destructive-border',
        outline:

          // Inherits the current text color. Uses shadow-xs. no shadow on active
          // No hover state
          ' border bg-background/80 [border-color:var(--button-outline)] shadow-xs active:shadow-none hover:-translate-y-0.5',
        secondary:

          'border bg-secondary text-secondary-foreground border border-secondary-border hover:-translate-y-0.5',

        ghost: 'border border-transparent hover:bg-muted/80',
        link: 'text-primary underline-offset-4 hover:underline',
      },
      size: {

        default: 'min-h-8 px-3 py-1.5 sm:min-h-9 sm:px-3.5',
        sm: 'min-h-8 rounded-[12px] px-2.5 text-xs',
        lg: 'min-h-10 rounded-[14px] px-4 sm:min-h-11 sm:px-5',
        icon: 'h-8 w-8 rounded-[12px] sm:h-9 sm:w-9 sm:rounded-[14px]',
      },
    },
    defaultVariants: {
      variant: 'default',
      size: 'default',
    },
  },
);

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {
  asChild?: boolean;
}

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, asChild = false, ...props }, ref) => {
    const Comp = asChild ? Slot : 'button';
    return (
      <Comp
        className={cn(buttonVariants({ variant, size, className }))}
        ref={ref}
        {...props}
      />
    );
  },
);
Button.displayName = 'Button';

export { Button, buttonVariants };
