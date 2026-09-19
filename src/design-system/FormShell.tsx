import { useEffect, type FormEventHandler, type ReactNode } from 'react';
import type { FieldValues, Path, UseFormSetError } from 'react-hook-form';
import { Button } from '@/shared/components/ui/button';
import type { ApiError } from '@/lib/api';

/** Copies server field errors onto the form fields that exist. */
export function useServerFieldErrors<T extends FieldValues>(error: ApiError | null | undefined, setError: UseFormSetError<T>, fields: readonly string[]) {
  useEffect(() => {
    if (!error?.fields) return;
    for (const [k, msg] of Object.entries(error.fields)) if (fields.includes(k)) setError(k as Path<T>, { message: msg });
  }, [error, setError, fields]);
}

interface Props {
  onSubmit:    FormEventHandler<HTMLFormElement>;
  error?:      ApiError | null;
  submitting:  boolean;
  onCancel:    () => void;
  submitLabel?: string;
  /** Shown on a 409 when the caller supports "save anyway". */
  force?:      { checked: boolean; onChange: (v: boolean) => void };
  children:    ReactNode;
}

/** Form frame used by the v2 drawers: error banner, duplicate override, footer buttons. */
export function FormShell({ onSubmit, error, submitting, onCancel, submitLabel = 'Save', force, children }: Props) {
  const conflict = error?.code === 'CONFLICT';
  return (
    <form onSubmit={onSubmit} className="space-y-5" noValidate>
      {error && !conflict && (!error.fields || Object.keys(error.fields).every(k => k === '_' || k === 'file' || k === 'rows')) && (
        <div className="text-sm text-red-700 bg-red-50 border border-red-200 rounded-md px-3 py-2" role="alert">{error.message}</div>
      )}
      {conflict && (
        <div className="text-sm bg-amber-50 border border-amber-200 rounded-md px-3 py-2 space-y-1" role="alert">
          <div className="text-amber-900">{error?.message}</div>
          {force && <label className="flex items-center gap-2 text-amber-900"><input type="checkbox" checked={force.checked} onChange={e => force.onChange(e.target.checked)} />Save anyway</label>}
        </div>
      )}
      {children}
      <div className="flex justify-end gap-2 pt-2">
        <Button type="button" variant="outline" onClick={onCancel}>Cancel</Button>
        <Button type="submit" loading={submitting}>{submitLabel}</Button>
      </div>
    </form>
  );
}
