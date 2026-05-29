import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import './assets/index.css';

console.log('[GK CRM] main.tsx executing — React mounting');

// ─── Error Boundary ───────────────────────────────────────────
// Catches any render error that would otherwise produce a white screen.

interface ErrorBoundaryState {
  error: Error | null;
}

class ErrorBoundary extends React.Component<{ children: React.ReactNode }, ErrorBoundaryState> {
  constructor(props: { children: React.ReactNode }) {
    super(props);
    this.state = { error: null };
  }

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    console.error('[GK CRM] Render error caught by ErrorBoundary:', error);
    // ChunkLoadError = stale cached JS chunk after a new Vercel deployment.
    // Auto-reload once to fetch the updated bundle.
    if (error.name === 'ChunkLoadError' || error.message?.includes('Failed to fetch dynamically imported module')) {
      console.warn('[GK CRM] ChunkLoadError detected — reloading for fresh bundle');
      window.location.reload();
      return { error: null };
    }
    return { error };
  }

  componentDidCatch(error: Error, info: React.ErrorInfo) {
    console.error('[GK CRM] ErrorBoundary componentDidCatch:', error, info.componentStack);
  }

  render() {
    if (this.state.error) {
      return (
        <div style={{ fontFamily: 'system-ui, sans-serif', padding: '2rem', maxWidth: '600px', margin: '4rem auto' }}>
          <h1 style={{ color: '#dc2626', fontSize: '1.25rem', marginBottom: '0.75rem' }}>
            Application Error
          </h1>
          <p style={{ color: '#374151', marginBottom: '0.5rem' }}>
            Something went wrong while loading the app. Check the browser console for details.
          </p>
          <pre style={{ background: '#f3f4f6', padding: '1rem', borderRadius: '0.5rem', fontSize: '0.75rem', overflow: 'auto', color: '#111827' }}>
            {this.state.error.message}
            {'\n\n'}
            {this.state.error.stack}
          </pre>
          <button
            onClick={() => window.location.reload()}
            style={{ marginTop: '1rem', padding: '0.5rem 1rem', background: '#2563eb', color: 'white', border: 'none', borderRadius: '0.375rem', cursor: 'pointer' }}
          >
            Reload
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}

// ─── Mount ────────────────────────────────────────────────────

const rootEl = document.getElementById('root');
if (!rootEl) {
  console.error('[GK CRM] FATAL: #root element not found in DOM');
} else {
  console.log('[GK CRM] #root found, calling ReactDOM.createRoot().render()');
  ReactDOM.createRoot(rootEl).render(
    <React.StrictMode>
      <ErrorBoundary>
        <App />
      </ErrorBoundary>
    </React.StrictMode>,
  );
  console.log('[GK CRM] render() called');
}
