import { useState, useRef } from 'react';

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
  const inputRef = useRef<HTMLInputElement>(null);

  const displayValue = focused
    ? (isInteger ? String(Math.round(value)) : String(value))
    : formatDisplay(value, format, isInteger);

  function handleChange(e: React.ChangeEvent<HTMLInputElement>) {
    const raw = e.target.value.replace(/[^0-9.-]/g, '');
    const num = isInteger ? parseInt(raw, 10) : parseFloat(raw);
    if (!isNaN(num)) onChange(num);
    else if (raw === '' || raw === '-') onChange(0);
  }

  return (
    <input
      ref={inputRef}
      type="text"
      inputMode="numeric"
      value={displayValue}
      onChange={handleChange}
      onFocus={() => setFocused(true)}
      onBlur={() => setFocused(false)}
      min={min}
      step={step}
      className={className}
    />
  );
}
