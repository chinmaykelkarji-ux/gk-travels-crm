// ============================================================
// GK TRAVELS CRM — Sign Up Page (Supabase Auth v2)
//
// Creates a new Supabase auth user. Supabase sends a
// confirmation email — the user must click the link before
// they can sign in. Profile row creation happens via a
// Supabase database trigger on auth.users insert.
// ============================================================

import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Eye, EyeOff, Lock, Mail, User, AlertCircle, Plane, CheckCircle2 } from 'lucide-react';
import { useAuth } from '@/backend/auth/AuthContext';
import { Button } from '@/shared/components/ui/button';
import { Input } from '@/shared/components/ui/input';
import { Label } from '@/shared/components/ui/label';

const signupSchema = z.object({
  name:            z.string().min(2, 'Name must be at least 2 characters').max(80),
  email:           z.string().email('Enter a valid email address'),
  password:        z.string().min(8, 'Password must be at least 8 characters'),
  confirmPassword: z.string(),
}).refine(d => d.password === d.confirmPassword, {
  message: 'Passwords do not match',
  path:    ['confirmPassword'],
});
type SignupSchema = z.infer<typeof signupSchema>;

export default function SignupPage() {
  const { signUp }      = useAuth();
  const [showPassword,  setShowPassword]  = useState(false);
  const [showConfirm,   setShowConfirm]   = useState(false);
  const [success,       setSuccess]       = useState(false);
  const [serverError,   setServerError]   = useState<string | null>(null);

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
    getValues,
  } = useForm<SignupSchema>({ resolver: zodResolver(signupSchema) });

  async function onSubmit(data: SignupSchema) {
    setServerError(null);
    try {
      await signUp(data.email, data.password, data.name);
      setSuccess(true);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Sign up failed';
      if (message.includes('already registered') || message.includes('already been registered')) {
        setServerError('An account with this email already exists. Try signing in.');
      } else {
        setServerError(message);
      }
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
          <p className="text-sm text-gray-500 mt-1">Create your CRM account</p>
        </div>

        {/* Success state */}
        {success ? (
          <div className="bg-white rounded-2xl border border-gray-200 shadow-sm p-6 text-center">
            <div className="inline-flex items-center justify-center w-12 h-12 rounded-full bg-green-100 mb-4">
              <CheckCircle2 className="w-6 h-6 text-green-600" />
            </div>
            <h2 className="text-base font-bold text-gray-900 mb-2">Check your email</h2>
            <p className="text-sm text-gray-500 mb-1">
              We sent a confirmation link to
            </p>
            <p className="text-sm font-semibold text-gray-800 mb-4">
              {getValues('email')}
            </p>
            <p className="text-xs text-gray-400">
              Click the link in the email to activate your account, then sign in.
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
            <form onSubmit={handleSubmit(onSubmit)} noValidate className="space-y-4">

              {serverError && (
                <div className="flex items-start gap-2.5 bg-red-50 border border-red-200 rounded-xl px-4 py-3">
                  <AlertCircle className="w-4 h-4 text-red-500 mt-0.5 shrink-0" />
                  <p className="text-sm text-red-700">{serverError}</p>
                </div>
              )}

              {/* Name */}
              <div className="space-y-1.5">
                <Label htmlFor="name" required>Full name</Label>
                <div className="relative">
                  <User className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                  <Input
                    id="name"
                    type="text"
                    placeholder="Your full name"
                    className="pl-9"
                    error={errors.name?.message}
                    autoComplete="name"
                    {...register('name')}
                  />
                </div>
                {errors.name && <p className="text-xs text-red-500">{errors.name.message}</p>}
              </div>

              {/* Email */}
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

              {/* Password */}
              <div className="space-y-1.5">
                <Label htmlFor="password" required>Password</Label>
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
                <Label htmlFor="confirmPassword" required>Confirm password</Label>
                <div className="relative">
                  <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                  <Input
                    id="confirmPassword"
                    type={showConfirm ? 'text' : 'password'}
                    placeholder="Re-enter password"
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
                Create account
              </Button>
            </form>
          </div>
        )}

        {/* Sign in link */}
        {!success && (
          <p className="text-center text-sm text-gray-500 mt-6">
            Already have an account?{' '}
            <Link to="/login" className="text-blue-600 hover:text-blue-700 font-medium">
              Sign in
            </Link>
          </p>
        )}

        <p className="text-center text-xs text-gray-400 mt-4">
          GK Travels CRM v2.0 · Enterprise Operations Platform
        </p>
      </div>
    </div>
  );
}
