import * as React from 'react';
import { cn } from '../../lib/cn';
import { inputVariants } from '../../lib/variants';
import type { VariantProps } from 'class-variance-authority';

export interface InputProps
  extends React.InputHTMLAttributes<HTMLInputElement>,
    VariantProps<typeof inputVariants> {
  darkMode?: boolean;
}

export const Input = React.forwardRef<HTMLInputElement, InputProps>(
  ({ className, shape, darkMode, ...props }, ref) => {
    return <input ref={ref} className={cn(inputVariants({ shape, dark: !!darkMode }), className)} {...props} />;
  },
);
Input.displayName = 'Input';

export interface TextareaProps
  extends React.TextareaHTMLAttributes<HTMLTextAreaElement>,
    VariantProps<typeof inputVariants> {
  darkMode?: boolean;
}

export const Textarea = React.forwardRef<HTMLTextAreaElement, TextareaProps>(
  ({ className, shape, darkMode, ...props }, ref) => {
    return <textarea ref={ref} className={cn(inputVariants({ shape, dark: !!darkMode }), className)} {...props} />;
  },
);
Textarea.displayName = 'Textarea';
