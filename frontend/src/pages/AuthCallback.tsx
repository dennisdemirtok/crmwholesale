import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { setToken } from '../utils/api';

export default function AuthCallback() {
  const navigate = useNavigate();

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const token = params.get('token');

    if (token) {
      setToken(token);
      navigate('/dashboard', { replace: true });
      // Force full reload so AuthContext picks up the new token
      window.location.href = '/dashboard';
    } else {
      navigate('/login?error=no_token', { replace: true });
    }
  }, [navigate]);

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50">
      <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-brand-600" />
    </div>
  );
}
