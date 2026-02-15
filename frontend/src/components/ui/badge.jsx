import * as React from 'react';
import { cn } from '@/lib/utils';

const Badge = React.forwardRef(({ className, variant = 'default', ...props }, ref) => {
    const variants = {
        default: 'bg-primary/20 text-primary border-primary/30',
        secondary: 'bg-secondary text-secondary-foreground border-secondary',
        success: 'bg-emerald-500/20 text-emerald-400 border-emerald-500/30',
        warning: 'bg-amber-500/20 text-amber-400 border-amber-500/30',
        destructive: 'bg-destructive/20 text-red-400 border-destructive/30',
        outline: 'text-foreground border-border',
    };

    return (
        <span
            ref={ref}
            className={cn(
                'inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-semibold transition-colors',
                variants[variant],
                className
            )}
            {...props}
        />
    );
});
Badge.displayName = 'Badge';

export { Badge };
