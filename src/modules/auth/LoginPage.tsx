import { useState, type FormEvent } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { Plane, Mail, Lock, Eye, EyeOff, AlertCircle } from 'lucide-react';
import { useAuth } from '@/backend/auth/AuthContext';
import { cn } from '@/shared/utils/cn';

export default function LoginPage() {
  const navigate  = useNavigate();
  const location  = useLocation();
  const { signIn, isAuthenticated } = useAuth();

  const [email,    setEmail]    = useState('');
  const [password, setPassword] = useState('');
  const [showPw,   setShowPw]   = useState(false);
  const [loading,  setLoading]  = useState(false);
  const [error,    setError]    = useState('');

  // Redirect if already authenticated
  const from = (location.state as { from?: { pathname?: string } })?.from?.pathname ?? '/';
  if (isAuthenticated) {
    navigate(from, { replace: true });
    return null;
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (!email.trim() || !password) {
      setError('Please enter your email and password.');
      return;
    }
    setLoading(true);
    setError('');
    try {
      await signIn(email.trim(), password);
      navigate(from, { replace: true });
    } catch (err: unknown) {
      const msg =
        (err as { response?: { data?: { error?: string } } })?.response?.data?.error
        ?? 'Login failed. Check your credentials and try again.';
      setError(msg);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div
      className="min-h-screen flex flex-col items-center justify-center p-4"
      style={{ background: 'linear-gradient(135deg, #0F172A 0%, #1E1B4B 60%, #0F172A 100%)' }}
    >
      {/* Ambient glow */}
      <div
        className="absolute inset-0 pointer-events-none"
        style={{
          background: 'radial-gradient(ellipse 60% 50% at 50% 30%, rgba(99,102,241,0.15) 0%, transparent 70%)',
        }}
      />

      <div className="relative w-full max-w-sm">

        {/* Brand */}
        <div className="text-center mb-8">
          <div
            className="w-14 h-14 rounded-2xl flex items-center justify-center mx-auto mb-4"
            style={{
              background: 'linear-gradient(135deg, #6366F1, #4F46E5)',
              boxShadow:  '0 0 40px rgba(99,102,241,0.4)',
            }}
          >
            <Plane className="text-white" style={{ width: 26, height: 26 }} />
          </div>
          <h1 className="text-2xl font-bold text-white font-display tracking-tight">GK Travels</h1>
          <p className="text-indigo-300/70 text-sm mt-1">Operations CRM</p>
        </div>

        {/* Card */}
        <div
          className="rounded-2xl p-8"
          style={{
            background:     'rgba(255,255,255,0.04)',
            border:         '1px solid rgba(255,255,255,0.08)',
            backdropFilter: 'blur(20px)',
            boxShadow:      '0 25px 60px rgba(0,0,0,0.4)',
          }}
        >
          <h2 className="text-lg font-semibold text-white mb-1">Welcome back</h2>
          <p className="text-sm text-slate-400 mb-6">Sign in to access the CRM</p>

          {/* Error banner */}
          {error && (
            <div className="flex items-start gap-2.5 bg-red-500/10 border border-red-500/20 rounded-xl px-4 py-3 mb-5">
              <AlertCircle className="w-4 h-4 text-red-400 flex-shrink-0 mt-0.5" />
              <p className="text-sm text-red-300 leading-snug">{error}</p>
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-4" noValidate>

            {/* Email */}
            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-slate-400 uppercase tracking-wide">
                Email
              </label>
              <div className="relative">
                <Mail
                  className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-500 pointer-events-none"
                  style={{ width: 15, height: 15 }}
                />
                <input
                  type="email"
                  autoComplete="email"
                  value={email}
                  onChange={e => { setEmail(e.target.value); setError(''); }}
                  placeholder="you@example.com"
                  className={cn(
                    'w-full rounded-xl text-sm text-white placeholder:text-slate-600',
                    'bg-white/5 border border-white/10',
                    'pl-10 pr-4 py-3',
                    'focus:outline-none focus:border-indigo-500/60',
                    'transition-colors',
                  )}
                />
              </div>
            </div>

            {/* Password */}
            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-slate-400 uppercase tracking-wide">
                Password
              </label>
              <div className="relative">
                <Lock
                  className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-500 pointer-events-none"
                  style={{ width: 15, height: 15 }}
                />
                <input
                  type={showPw ? 'text' : 'password'}
                  autoComplete="current-password"
                  value={password}
                  onChange={e => { setPassword(e.target.value); setError(''); }}
                  placeholder="••••••••"
                  className={cn(
                    'w-full rounded-xl text-sm text-white placeholder:text-slate-600',
                    'bg-white/5 border border-white/10',
                    'pl-10 pr-11 py-3',
                    'focus:outline-none focus:border-indigo-500/60',
                    'transition-colors',
                  )}
                />
                <button
                  type="button"
                  tabIndex={-1}
                  onClick={() => setShowPw(v => !v)}
                  className="absolute right-3.5 top-1/2 -translate-y-1/2 text-slate-500 hover:text-slate-300 transition-colors"
                >
                  {showPw ? <EyeOff style={{ width: 15, height: 15 }} /> : <Eye style={{ width: 15, height: 15 }} />}
                </button>
              </div>
            </div>

            {/* Submit */}
            <button
              type="submit"
              disabled={loading}
              className={cn(
                'w-full py-3 rounded-xl text-sm font-semibold text-white mt-2 transition-all',
                'focus:outline-none focus:ring-2 focus:ring-indigo-500/50',
                loading
                  ? 'bg-indigo-500/50 cursor-not-allowed'
                  : 'bg-indigo-600 hover:bg-indigo-500 active:scale-[0.98]',
              )}
              style={{ boxShadow: loading ? 'none' : '0 4px 20px rgba(99,102,241,0.35)' }}
            >
              {loading
                ? (
                  <span className="flex items-center justify-center gap-2">
                    <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                    Signing in…
                  </span>
                )
                : 'Sign In'}
            </button>
          </form>
        </div>

        <p className="text-center text-xs text-slate-600 mt-6">
          GK Travels Operations CRM — Internal access only
        </p>
      </div>
    </div>
  );
}
