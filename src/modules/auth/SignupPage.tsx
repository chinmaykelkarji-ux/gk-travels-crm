// Self-registration is disabled — accounts are created by the Admin in Settings.
import { Navigate } from 'react-router-dom';
export default function SignupPage() { return <Navigate to="/login" replace />; }
