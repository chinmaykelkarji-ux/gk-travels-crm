// ============================================================
// GK TRAVELS CRM — Reset Password Page (Supabase Auth v2)
//
// Supabase redirects here from the password reset email with
// an access_token in the URL hash. The client (detectSessionInUrl: true)
// parses the token and fires a PASSWORD_RECOVERY auth event,
// which temporarily signs the user in so updateUser() works.
// ============================================================

import { useState, useEffect } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Eye, EyeOff, Lock, AlertCircle, Plane, CheckCircle2 } from 'lucide-react';
import { supabase } from '@/backend/supabase/client';
import { authService } from '@/backend/auth/authService';
import { Button } from '@/shared/components/ui/button';
import { Input } from '@/shared/components/ui/input';
import { Label } from '@/shared/components/ui/label';

const schema = z.object({
  password:        z.string().min(8, 'Password must be at least 8 characters'),
  confirmPassword: z.string(),
}).refine(d => d.password === d.confirmPassword, {
  message: 'Passwords do not match',
  path:    ['confirmPassword'],
});
type Schema = z.infer<typeof schema>;

type PageState = 'loading' | 'ready' | 'success' | 'invalid';

export default function ResetPasswordPage() {
  const navigate          = useNavigate();
  const [pageState,       setPageState]       = useState<PageState>('loading');
  const [showPassword,    setShowPassword]    = useState(false);
  const [showConfirm,     setShowConfirm]     = useState(false);
  const [serverError,     setServerError]     = useState<string | null>(null);

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<Schema>({ resolver: zodResolver(schema) });

  useEffect(() => {
    // Supabase fires PASSWORD_RECOVERY when the token in the URL hash is valid.
    // If no token (or expired), no event fires → show "invalid link" after timeout.
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event) => {
      if (event === 'PASSWORD_RECOVERY') {
        setPageState('ready');
      }
    });

    // Fallback: if already in a valid session (e.g. page refresh), allow the form.
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (session) setPageState('ready');
    });

    // If neither fires within 4 s, the link is invalid / expired.
    const timer = setTimeout(() => {
      setPageState(prev => prev === 'loading' ? 'invalid' : prev);
    }, 4000);

    return () => {
      subscription.unsubscribe();
      clearTimeout(timer);
    };
  }, []);

  async function onSubmit(data: Schema) {
    setServerError(null);
    try {
      await authService.updatePassword(data.password);
      setPageState('success');
      // Sign out the recovery session so the user logs in fresh.
      await supabase.auth.signOut();
      setTimeout(() => navigate('/login', { replace: true }), 2500);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Update failed';
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
          <p className="text-sm text-gray-500 mt-1">Set a new password</p>
        </div>

        {/* Loading */}
        {pageState === 'loading' && (
          <div className="bg-white rounded-2xl border border-gray-200 shadow-sm p-6 text-center">
            <div className="inline-block w-8 h-8 border-2 border-blue-600 border-t-transparent rounded-full animate-spin mb-4" />
            <p className="text-sm text-gray-500">Verifying reset link…</p>
          </div>
        )}

        {/* Invalid / expired */}
        {pageState === 'invalid' && (
          <div className="bg-white rounded-2xl border border-gray-200 shadow-sm p-6 text-center">
            <div className="inline-flex items-center justify-center w-12 h-12 rounded-full bg-red-100 mb-4">
              <AlertCircle className="w-6 h-6 text-red-600" />
            </div>
            <h2 className="text-base font-bold text-gray-900 mb-2">Invalid or expired link</h2>
            <p className="text-sm text-gray-500 mb-6">
              This password reset link is no longer valid. Request a new one.
            </p>
            <Link
              to="/forgot-password"
              className="inline-block text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 rounded-xl px-5 py-2.5 transition-colors"
            >
              Request new link
            </Link>
          </div>
        )}

        {/* Success */}
        {pageState === 'success' && (
          <div className="bg-white rounded-2xl border border-gray-200 shadow-sm p-6 text-center">
            <div className="inline-flex items-center justify-center w-12 h-12 rounded-full bg-green-100 mb-4">
              <CheckCircle2 className="w-6 h-6 text-green-600" />
            </div>
            <h2 className="text-base font-bold text-gray-900 mb-2">Password updated</h2>
            <p className="text-sm text-gray-500">
              Redirecting you to sign in…
            </p>
          </div>
        )}

        {/* Form */}
        {pageState === 'ready' && (
          <div className="bg-white rounded-2xl border border-gray-200 shadow-sm p-6">
            <form onSubmit={handleSubmit(onSubmit)} noValidate className="space-y-4">

              {serverError && (
                <div className="flex items-start gap-2.5 bg-red-50 border border-red-200 rounded-xl px-4 py-3">
                  <AlertCircle className="w-4 h-4 text-red-500 mt-0.5 shrink-0" />
                  <p className="text-sm text-red-700">{serverError}</p>
                </div>
              )}

              {/* New password */}
              <div className="space-y-1.5">
                <Label htmlFor="password" required>New password</Label>
                <div className="relative">
                  <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                  <Input
                    id="password"
                    type={showPassword ? 'text' : 'password'}
                    placeholder="Min 8 characters"
                    className="pl-9 pr-9"
                    error={errors.password?.message}
                    autoComplete="new-password"
                    {...register('password')}
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(p => !p)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 transition-colors"
                    aria-label={showPassword ? 'Hide password' : 'Show password'}
                  >
                    {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
                {errors.password && <p className="text-xs text-red-500">{errors.password.message}</p>}
              </div>

              {/* Confirm password */}
              <div className="space-y-1.5">
                <Label htmlFor="confirmPassword" required>Confirm new password</Label>
                <div className="relative">
                  <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                  <Input
                    id="confirmPassword"
                    type={showConfirm ? 'text' : 'password'}
                    placeholder="Re-enter new password"
                    className="pl-9 pr-9"
                    error={errors.confirmPassword?.message}
                    autoComplete="new-password"
                    {...register('confirmPassword')}
                  />
                  <button
                    type="button"
                    onClick={() => setShowConfirm(p => !p)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 transition-colors"
                    aria-label={showConfirm ? 'Hide password' : 'Show password'}
                  >
                    {showConfirm ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
                {errors.confirmPassword && (
                  <p className="text-xs text-red-500">{errors.confirmPassword.message}</p>
                )}
              </div>

              <Button type="submit" className="w-full mt-2" loading={isSubmitting}>
                Update password
              </Button>
            </form>
          </div>
        )}

        <p className="text-center text-xs text-gray-400 mt-6">
          GK Travels CRM v2.0 · Enterprise Operations Platform
        </p>
      </div>
    </div>
  );
}
