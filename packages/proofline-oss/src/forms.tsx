import { Upload } from "lucide-react";
import {
  Children,
  cloneElement,
  forwardRef,
  isValidElement,
  useId,
  type InputHTMLAttributes,
  type ReactNode,
  type SelectHTMLAttributes,
  type TextareaHTMLAttributes,
} from "react";
import { classes } from "./utils";

export function ProoflineField({
  label,
  htmlFor,
  description,
  error,
  required,
  children,
  className,
}: {
  label: string;
  htmlFor: string;
  description?: string;
  error?: string;
  required?: boolean;
  children: ReactNode;
  className?: string;
}) {
  const descriptionId = `${htmlFor}-description`;
  const errorId = `${htmlFor}-error`;
  const child = Children.only(children);
  const describedBy = [
    isValidElement<{ "aria-describedby"?: string }>(child)
      ? child.props["aria-describedby"]
      : undefined,
    description ? descriptionId : undefined,
    error ? errorId : undefined,
  ].filter(Boolean).join(" ") || undefined;
  const control = isValidElement(child)
    ? cloneElement(child, {
        "aria-describedby": describedBy,
        "aria-invalid": error ? true : undefined,
        id: child.props.id ?? htmlFor,
      } as Record<string, unknown>)
    : child;
  return (
    <div className={classes("pl-field", className)}>
      <label className="pl-field__label" htmlFor={htmlFor}>
        {label}
        {required ? <span aria-hidden="true"> *</span> : null}
      </label>
      {control}
      {description ? <span className="pl-field__description" id={descriptionId}>{description}</span> : null}
      {error ? <span className="pl-field__error" id={errorId} role="alert">{error}</span> : null}
    </div>
  );
}

export const ProoflineInput = forwardRef<
  HTMLInputElement,
  InputHTMLAttributes<HTMLInputElement>
>(function ProoflineInput({ className, ...props }, ref) {
  return <input className={classes("pl-input", className)} ref={ref} {...props} />;
});

export const ProoflineSelect = forwardRef<
  HTMLSelectElement,
  SelectHTMLAttributes<HTMLSelectElement>
>(function ProoflineSelect({ className, children, ...props }, ref) {
  return (
    <select className={classes("pl-select", className)} ref={ref} {...props}>
      {children}
    </select>
  );
});

export const ProoflineTextArea = forwardRef<
  HTMLTextAreaElement,
  TextareaHTMLAttributes<HTMLTextAreaElement>
>(function ProoflineTextArea({ className, ...props }, ref) {
  return <textarea className={classes("pl-input", "pl-textarea", className)} ref={ref} {...props} />;
});

export function ProoflineCheckbox({
  label,
  description,
  className,
  ...props
}: InputHTMLAttributes<HTMLInputElement> & {
  label: string;
  description?: string;
}) {
  const generatedId = useId();
  const id = props.id ?? generatedId;
  return (
    <label className={classes("pl-choice", className)} htmlFor={id}>
      <input id={id} type="checkbox" {...props} />
      <span>
        <strong>{label}</strong>
        {description ? <small>{description}</small> : null}
      </span>
    </label>
  );
}

export function ProoflineSwitch({
  label,
  description,
  className,
  ...props
}: Omit<InputHTMLAttributes<HTMLInputElement>, "role" | "type"> & {
  label: string;
  description?: string;
}) {
  const generatedId = useId();
  const id = props.id ?? generatedId;
  return (
    <label className={classes("pl-choice", "pl-switch", className)} htmlFor={id}>
      <input id={id} role="switch" type="checkbox" {...props} />
      <span className="pl-switch__track" aria-hidden="true"><span /></span>
      <span>
        <strong>{label}</strong>
        {description ? <small>{description}</small> : null}
      </span>
    </label>
  );
}

export function ProoflineFilePicker({
  label = "Choose file",
  description,
  className,
  ...props
}: InputHTMLAttributes<HTMLInputElement> & {
  label?: string;
  description?: string;
}) {
  const generatedId = useId();
  const id = props.id ?? generatedId;
  return (
    <div className={classes("pl-file-picker", className)}>
      <label className="pl-button" htmlFor={id}>
        <Upload aria-hidden="true" size={16} />
        {label}
      </label>
      <input className="pl-visually-hidden" id={id} type="file" {...props} />
      {description ? <span>{description}</span> : null}
    </div>
  );
}
