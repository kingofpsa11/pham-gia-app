import { useState, useRef, useEffect } from 'react';

interface NumInputProps {
  value: number;
  onChange: (val: number) => void;
  className?: string;
  min?: number;
  step?: number;
  isInteger?: boolean;
  format?: 'money' | 'number';
}

function formatDisplay(value: number, format: 'money' | 'number', isInteger: boolean): string {
  if (value === 0) return '0';
  if (format === 'money') {
    return new Intl.NumberFormat('vi-VN').format(value);
  }
  return isInteger ? String(Math.round(value)) : String(value);
}

export default function NumInput({
  value,
  onChange,
  className = '',
  min = 0,
  step,
  isInteger = false,
  format = 'number',
}: NumInputProps) {
  const [focused, setFocused] = useState(false);
  const [draft, setDraft] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!focused) setDraft(null);
  }, [value, focused]);

  const displayValue =
    focused && draft !== null
      ? draft
      : formatDisplay(value, format, isInteger);

  function handleChange(e: React.ChangeEvent<HTMLInputElement>) {
    const raw = e.target.value.replace(/[^0-9.-]/g, '');
    setDraft(raw);
    if (raw === '' || raw === '-') return;
    const num = isInteger ? parseInt(raw, 10) : parseFloat(raw);
    if (!isNaN(num)) {
      const clamped = min !== undefined && num < min ? min : num;
      onChange(clamped);
    }
  }

  function handleFocus() {
    setFocused(true);
    setDraft(value === 0 ? '' : isInteger ? String(Math.round(value)) : String(value));
  }

  function handleBlur() {
    if (draft === '' || draft === '-') onChange(0);
    setFocused(false);
    setDraft(null);
  }

  return (
    <input
      ref={inputRef}
      type="text"
      inputMode="numeric"
      value={displayValue}
      onChange={handleChange}
      onFocus={handleFocus}
      onBlur={handleBlur}
      min={min}
      step={step}
      className={className}
    />
  );
}
