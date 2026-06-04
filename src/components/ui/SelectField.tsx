interface SelectFieldProps {
  label: string;
  value: string;
  onChange: (value: string) => void;
  options: { value: string; label: string }[];
  placeholder?: string;
  error?: string;
  disabled?: boolean;
  required?: boolean;
}

export default function SelectField({
  label,
  value,
  onChange,
  options,
  placeholder,
  error,
  disabled,
  required,
}: SelectFieldProps) {
  return (
    <div>
      <label className="label-field">
        {label}
        {required && <span className="text-error-500 ml-0.5">*</span>}
      </label>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        disabled={disabled}
        className={`select-field ${error ? 'border-error-500 focus:ring-error-500 focus:border-error-500' : ''}`}
      >
        {placeholder && (
          <option value="" disabled>
            {placeholder}
          </option>
        )}
        {options.map((opt) => (
          <option key={opt.value} value={opt.value}>
            {opt.label}
          </option>
        ))}
      </select>
      {error && <p className="mt-1 text-xs text-error-600">{error}</p>}
    </div>
  );
}
