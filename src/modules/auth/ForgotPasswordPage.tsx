// ============================================================
// GK TRAVELS CRM — Forgot Password Page (Supabase Auth v2)
//
// Calls supabase.auth.resetPasswordForEmail which sends an
// email with a link to /auth/reset-password.
// ============================================================

import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Mail, AlertCircle, Plane, CheckCircle2 } from 'lucide-react';
import { authService } from '@/backend/auth/authService';
import { Button } from '@/shared/components/ui/button';
import { Input } from '@/shared/components/ui/input';
import { Label } from '@/shared/components/ui/label';

const schema = z.object({
  email: z.string().email('Enter a valid email address'),
});
type Schema = z.infer<typeof schema>;

export default function ForgotPasswordPage() {
  const [success,     setSuccess]     = useState(false);
  const [serverError, setServerError] = useState<string | null>(null);

  const {
    register,
    handleSubmit,
    getValues,
    formState: { errors, isSubmitting },
  } = useForm<Schema>({ resolver: zodResolver(schema) });

  async function onSubmit(data: Schema) {
    setServerError(null);
    try {
      await authService.requestPasswordReset(data.email);
      setSuccess(true);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Request failed';
      setServerError(message);
    }
  }

  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
      <div className="w-full max-w-sm">

        {/* Logo */}
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-14 h-14 rounded-2xl bg-blue-600 mb-4">
            <Plane className="w-7 h-7 text-white" />
          </div>
          <h1 className="text-2xl font-bold text-gray-900">GK Travels</h1>
          <p className="text-sm text-gray-500 mt-1">Reset your password</p>
        </div>

        {/* Success state */}
        {success ? (
          <div className="bg-white rounded-2xl border border-gray-200 shadow-sm p-6 text-center">
            <div className="inline-flex items-center justify-center w-12 h-12 rounded-full bg-green-100 mb-4">
              <CheckCircle2 className="w-6 h-6 text-green-600" />
            </div>
            <h2 className="text-base font-bold text-gray-900 mb-2">Check your email</h2>
            <p className="text-sm text-gray-500 mb-1">
              We sent a password reset link to
            </p>
            <p className="text-sm font-semibold text-gray-800 mb-4">
              {getValues('email')}
            </p>
            <p className="text-xs text-gray-400">
              Click the link in the email. It expires in 1 hour.
            </p>
            <div className="mt-6 pt-4 border-t border-gray-100">
              <Link to="/login" className="text-sm text-blue-600 hover:text-blue-700 font-medium">
                ← Back to sign in
              </Link>
            </div>
          </div>
        ) : (
          /* Form */
          <div className="bg-white rounded-2xl border border-gray-200 shadow-sm p-6">
            <p className="text-sm text-gray-500 mb-5">
              Enter the email address on your account and we&apos;ll send you a reset link.
            </p>

            <form onSubmit={handleSubmit(onSubmit)} noValidate className="space-y-4">

              {serverError && (
                <div className="flex items-start gap-2.5 bg-red-50 border border-red-200 rounded-xl px-4 py-3">
                  <AlertCircle className="w-4 h-4 text-red-500 mt-0.5 shrink-0" />
                  <p className="text-sm text-red-700">{serverError}</p>
                </div>
              )}

              <div className="space-y-1.5">
                <Label htmlFor="email" required>Email</Label>
                <div className="relative">
                  <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                  <Input
                    id="email"
                    type="email"
                    placeholder="you@gktravels.com"
                    className="pl-9"
                    error={errors.email?.message}
                    autoComplete="email"
                    {...register('email')}
                  />
                </div>
                {errors.email && <p className="text-xs text-red-500">{errors.email.message}</p>}
              </div>

              <Button type="submit" className="w-full mt-2" loading={isSubmitting}>
                Send reset link
              </Button>
            </form>
          </div>
        )}

        <p className="text-center text-sm text-gray-500 mt-6">
          Remember your password?{' '}
          <Link to="/login" className="text-blue-600 hover:text-blue-700 font-medium">
            Sign in
          </Link>
        </p>

        <p className="text-center text-xs text-gray-400 mt-4">
          GK Travels CRM v2.0 · Enterprise Operations Platform
        </p>
      </div>
    </div>
  );
}
