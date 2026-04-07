/**
 * INGRION UI Components
 * Shared primitives based on the design system
 */
import React from "react";
import { cn } from "@/lib/utils";

// ---- Card ----
export const Card: React.FC<React.HTMLAttributes<HTMLDivElement>> = ({ className, ...props }) => (
  <div className={cn("bg-white rounded-lg border border-gray-200 shadow-sm", className)} {...props} />
);

export const CardHeader: React.FC<React.HTMLAttributes<HTMLDivElement>> = ({ className, ...props }) => (
  <div className={cn("px-5 py-4 border-b border-gray-100", className)} {...props} />
);

export const CardTitle: React.FC<React.HTMLAttributes<HTMLHeadingElement>> = ({ className, ...props }) => (
  <h3 className={cn("text-base font-semibold text-[#1A3A5C]", className)} {...props} />
);

export const CardContent: React.FC<React.HTMLAttributes<HTMLDivElement>> = ({ className, ...props }) => (
  <div className={cn("px-5 py-4", className)} {...props} />
);

// ---- Button ----
interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: "primary" | "secondary" | "danger" | "ghost";
  size?: "sm" | "md" | "lg";
  loading?: boolean;
}

export const Button: React.FC<ButtonProps> = ({
  variant = "primary",
  size = "md",
  loading,
  disabled,
  className,
  children,
  ...props
}) => {
  const variants = {
    primary: "bg-[#C9A84C] text-[#0D1F33] hover:bg-[#F0D98A] font-semibold",
    secondary: "bg-transparent border border-[#1A3A5C] text-[#1A3A5C] hover:bg-[#EAF0F8] font-semibold",
    danger: "bg-[#C0392B] text-white hover:opacity-90 font-semibold",
    ghost: "bg-transparent text-gray-600 hover:bg-gray-100",
  };
  const sizes = {
    sm: "px-3 py-1.5 text-xs rounded",
    md: "px-4 py-2 text-sm rounded-md",
    lg: "px-6 py-3 text-base rounded-md",
  };
  return (
    <button
      disabled={disabled || loading}
      className={cn(
        "inline-flex items-center justify-center gap-2 transition-colors",
        "disabled:opacity-50 disabled:cursor-not-allowed",
        variants[variant],
        sizes[size],
        className
      )}
      {...props}
    >
      {loading && (
        <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24" fill="none">
          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
        </svg>
      )}
      {children}
    </button>
  );
};

// ---- Input ----
interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  label?: string;
  error?: string;
  hint?: string;
  icon?: React.ReactNode;
}

export const Input: React.FC<InputProps> = ({ label, error, hint, icon, className, ...props }) => (
  <div className="flex flex-col gap-1">
    {label && (
      <label className="text-xs font-medium text-gray-700">{label}</label>
    )}
    <div className="relative">
      {icon && (
        <div className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400">{icon}</div>
      )}
      <input
        className={cn(
          "w-full px-3 py-2 border border-gray-300 rounded-md text-sm bg-white",
          "focus:outline-none focus:ring-2 focus:ring-[#1A3A5C] focus:border-transparent",
          "placeholder:text-gray-400",
          error && "border-red-500 focus:ring-red-500",
          icon && "pl-9",
          className
        )}
        {...props}
      />
    </div>
    {error && <p className="text-xs text-red-600">{error}</p>}
    {hint && !error && <p className="text-xs text-gray-500">{hint}</p>}
  </div>
);

// ---- Textarea ----
interface TextareaProps extends React.TextareaHTMLAttributes<HTMLTextAreaElement> {
  label?: string;
  error?: string;
}

export const Textarea: React.FC<TextareaProps> = ({ label, error, className, ...props }) => (
  <div className="flex flex-col gap-1">
    {label && <label className="text-xs font-medium text-gray-700">{label}</label>}
    <textarea
      className={cn(
        "w-full px-3 py-2 border border-gray-300 rounded-md text-sm bg-white resize-none",
        "focus:outline-none focus:ring-2 focus:ring-[#1A3A5C] focus:border-transparent",
        error && "border-red-500",
        className
      )}
      {...props}
    />
    {error && <p className="text-xs text-red-600">{error}</p>}
  </div>
);

// ---- Badge / Status Pill ----
interface BadgeProps {
  variant?: "green" | "amber" | "red" | "blue" | "gray" | "teal" | "indigo" | "purple";
  children: React.ReactNode;
  className?: string;
}

export const Badge: React.FC<BadgeProps> = ({ variant = "blue", children, className }) => {
  const variants = {
    green: "bg-green-100 text-green-800",
    amber: "bg-amber-100 text-amber-800",
    red: "bg-red-100 text-red-800",
    blue: "bg-blue-100 text-blue-800",
    gray: "bg-gray-100 text-gray-700",
    teal: "bg-teal-100 text-teal-800",
    indigo: "bg-indigo-100 text-indigo-800",
    purple: "bg-purple-100 text-purple-800",
  };
  return (
    <span className={cn("inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium", variants[variant], className)}>
      {children}
    </span>
  );
};

// ---- Metric Card ----
interface MetricCardProps {
  label: string;
  value: string | number;
  trend?: "up" | "down" | "neutral";
  trendValue?: string;
  borderColor?: string;
  className?: string;
}

export const MetricCard: React.FC<MetricCardProps> = ({
  label, value, trend, trendValue, borderColor = "#C9A84C", className
}) => (
  <div
    className={cn("bg-white rounded-lg border border-gray-200 shadow-sm p-4 flex flex-col gap-2", className)}
    style={{ borderLeftColor: borderColor, borderLeftWidth: 3 }}
  >
    <p className="text-xs text-gray-500 uppercase tracking-wide font-medium">{label}</p>
    <p className="text-2xl font-bold text-[#1A3A5C]">{value}</p>
    {trend && trendValue && (
      <p className={cn("text-xs font-medium", trend === "up" ? "text-green-600" : trend === "down" ? "text-red-600" : "text-gray-500")}>
        {trend === "up" ? "↑" : trend === "down" ? "↓" : "→"} {trendValue}
      </p>
    )}
  </div>
);

// ---- Skeleton Loader ----
export const Skeleton: React.FC<React.HTMLAttributes<HTMLDivElement>> = ({ className, ...props }) => (
  <div
    className={cn("rounded bg-gray-200", className)}
    style={{
      background: "linear-gradient(90deg, #e5e7eb 25%, #f3f4f6 50%, #e5e7eb 75%)",
      backgroundSize: "200% 100%",
      animation: "shimmer 1.5s ease-in-out infinite",
    }}
    {...props}
  />
);

// ---- Address Display ----
export const Address: React.FC<{ value: string; full?: boolean }> = ({ value, full }) => {
  const display = full ? value : value ? `${value.slice(0, 8)}…${value.slice(-6)}` : "—";
  const [copied, setCopied] = React.useState(false);

  const copy = () => {
    navigator.clipboard.writeText(value);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <span
      className="font-mono text-xs text-[#C9A84C] cursor-pointer hover:opacity-80"
      onClick={copy}
      title={copied ? "Copied!" : "Click to copy"}
    >
      {copied ? "✓ Copied!" : display}
    </span>
  );
};

// ---- Toast notification ----
interface ToastProps {
  message: string;
  type?: "success" | "error" | "info" | "warning";
  onClose: () => void;
}

export const Toast: React.FC<ToastProps> = ({ message, type = "info", onClose }) => {
  const styles = {
    success: "bg-green-600",
    error: "bg-red-600",
    info: "bg-[#1A3A5C]",
    warning: "bg-amber-600",
  };

  React.useEffect(() => {
    const t = setTimeout(onClose, 5000);
    return () => clearTimeout(t);
  }, [onClose]);

  return (
    <div className={cn("fixed top-4 right-4 z-50 text-white px-4 py-3 rounded-lg shadow-lg flex items-center gap-3 max-w-sm text-sm animate-slide-in", styles[type])}>
      <span className="flex-1">{message}</span>
      <button onClick={onClose} className="opacity-70 hover:opacity-100">✕</button>
    </div>
  );
};

// ---- Table ----
export const Table: React.FC<React.HTMLAttributes<HTMLTableElement>> = ({ className, ...props }) => (
  <div className="overflow-x-auto">
    <table className={cn("w-full text-sm border-collapse", className)} {...props} />
  </div>
);

export const Th: React.FC<React.ThHTMLAttributes<HTMLTableCellElement>> = ({ className, ...props }) => (
  <th className={cn("text-left text-xs font-semibold text-gray-500 uppercase tracking-wide px-4 py-3 bg-gray-50 border-b border-gray-200 sticky top-0", className)} {...props} />
);

export const Td: React.FC<React.TdHTMLAttributes<HTMLTableCellElement>> = ({ className, ...props }) => (
  <td className={cn("px-4 py-3 border-b border-gray-100 text-sm text-gray-800", className)} {...props} />
);

export const Tr: React.FC<React.HTMLAttributes<HTMLTableRowElement>> = ({ className, ...props }) => (
  <tr className={cn("hover:bg-gray-50 transition-colors", className)} {...props} />
);

// ---- Select ----
interface SelectProps extends React.SelectHTMLAttributes<HTMLSelectElement> {
  label?: string;
  error?: string;
  options: { value: string; label: string }[];
}

export const Select: React.FC<SelectProps> = ({ label, error, options, className, ...props }) => (
  <div className="flex flex-col gap-1">
    {label && <label className="text-xs font-medium text-gray-700">{label}</label>}
    <select
      className={cn(
        "w-full px-3 py-2 border border-gray-300 rounded-md text-sm bg-white",
        "focus:outline-none focus:ring-2 focus:ring-[#1A3A5C] focus:border-transparent",
        error && "border-red-500",
        className
      )}
      {...props}
    >
      {options.map((o) => (
        <option key={o.value} value={o.value}>{o.label}</option>
      ))}
    </select>
    {error && <p className="text-xs text-red-600">{error}</p>}
  </div>
);

// ---- Progress Bar ----
export const ProgressBar: React.FC<{ value: number; max?: number; className?: string }> = ({
  value, max = 100, className
}) => (
  <div className={cn("h-1.5 bg-[#EAF0F8] rounded-full overflow-hidden", className)}>
    <div
      className="h-full bg-[#C9A84C] rounded-full transition-all"
      style={{ width: `${Math.min(100, (value / max) * 100)}%` }}
    />
  </div>
);

// ---- Divider ----
export const Divider: React.FC<{ className?: string }> = ({ className }) => (
  <hr className={cn("border-gray-200", className)} />
);

// ---- Empty State ----
export const EmptyState: React.FC<{ icon?: React.ReactNode; title: string; description?: string; action?: React.ReactNode }> = ({
  icon, title, description, action
}) => (
  <div className="flex flex-col items-center justify-center py-12 text-center">
    {icon && <div className="text-gray-300 mb-3 text-5xl">{icon}</div>}
    <h3 className="font-semibold text-gray-700 mb-1">{title}</h3>
    {description && <p className="text-sm text-gray-500 mb-4 max-w-xs">{description}</p>}
    {action}
  </div>
);

// ---- Spinner ----
export const Spinner: React.FC<{ size?: "sm" | "md" | "lg"; className?: string }> = ({
  size = "md", className
}) => {
  const sizes = { sm: "h-4 w-4", md: "h-6 w-6", lg: "h-10 w-10" };
  return (
    <svg className={cn("animate-spin text-[#C9A84C]", sizes[size], className)} viewBox="0 0 24 24" fill="none">
      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
    </svg>
  );
};

// ---- cn utility ----
// (also exported from @/lib/utils)
export { cn };
