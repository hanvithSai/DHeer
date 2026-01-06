import React from 'react';
import { cn } from '@/lib/utils';
import { Button, ButtonProps } from '@/components/ui/button';
import { motion } from 'framer-motion';

export const ShinyButton = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, children, ...props }, ref) => {
    return (
      <Button
        ref={ref}
        className={cn(
          "relative overflow-hidden transition-all duration-300 ease-out hover:scale-[1.02] active:scale-[0.98]",
          "bg-gradient-to-r from-primary via-purple-500 to-primary bg-[length:200%_auto]",
          "hover:bg-[right_center] animate-gradient",
          "shadow-lg shadow-primary/25 hover:shadow-primary/40",
          "text-white font-semibold border-none",
          className
        )}
        {...props}
      >
        <span className="relative z-10 flex items-center gap-2">{children}</span>
        <motion.div
          className="absolute inset-0 bg-white/20 translate-x-[-100%]"
          initial={false}
          whileHover={{ 
            translateX: "100%",
            transition: { duration: 0.6, ease: "easeInOut" }
          }}
        />
      </Button>
    );
  }
);
ShinyButton.displayName = "ShinyButton";
