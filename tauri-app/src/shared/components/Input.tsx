import React from "react";

const BASE =
  "w-full rounded-item border border-line bg-surface-raised px-4 py-3 text-sm text-ink-strong placeholder:text-ink-faint transition-all duration-200 hover:border-line-strong focus:border-accent focus:bg-surface focus:outline-none focus:ring-4 focus:ring-accent/12 disabled:opacity-50";

interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {}
interface TextareaProps extends React.TextareaHTMLAttributes<HTMLTextAreaElement> {}

export function Input({ className = "", ...props }: InputProps) {
  return <input className={`${BASE} ${className}`} {...props} />;
}

export function Textarea({ className = "", ...props }: TextareaProps) {
  return <textarea className={`${BASE} resize-none ${className}`} {...props} />;
}
