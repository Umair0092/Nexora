import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { login } from '../../api/authentication_endpoints';
import Navbar from '../shared/navbar';
import { useNavigate } from 'react-router-dom';

function SignIn() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState(null);
  const [successMessage, setSuccessMessage] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const navigate = useNavigate();

  const handleSubmit = async (e) => {
    e.preventDefault();
    setIsLoading(true);
    setError(null);
    setSuccessMessage('');
    try {
      const response = await login(email, password);
      setSuccessMessage(response.message || 'Login successful! Redirecting...');

      // Redirect to the dashboard after a short delay
      setTimeout(() => {
        navigate('/dashboard');
      }, 1500);
    } catch (err) {
      setError(err.message || 'Invalid email or password.');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="flex flex-col min-h-screen bg-slate-950">
      <Navbar />
      <div className="flex-grow flex items-center justify-center">
        <div className="w-full max-w-md p-10 space-y-6 bg-slate-800 rounded-xl shadow-2xl">
          <div className="text-center">
            <h1 className="text-4xl font-bold text-white mb-1">Nexora</h1>
            <p className="text-sm text-gray-400">Sign in to your account</p>
          </div>

          <form onSubmit={handleSubmit} className="space-y-5">
            <div>
              <label htmlFor="email" className="form-label">
                Email
              </label>
              <input
                type="email"
                id="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="usman@example.com"
                className="form-input"
                autoComplete="email"
                required
              />
            </div>
            <div>
              <label htmlFor="password" className="form-label">
                Password
              </label>
              <input
                type="password"
                id="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
                className="form-input"
                autoComplete="current-password"
                required
              />
            </div>
            <button type="submit" disabled={isLoading} className="btn-primary">
              {isLoading ? 'Signing In...' : 'Sign In'}
            </button>
          </form>
          {error && <p className="text-sm text-center text-red-400">{error}</p>}
          {successMessage && <p className="text-sm text-center text-green-400">{successMessage}</p>}
          <p className="text-sm text-center text-gray-400">
            Don't have an account?{' '}
            <Link to="/signup" className="text-cyan-400 hover:text-cyan-300 font-medium transition-colors">
              Sign Up
            </Link>
          </p>
        </div>
      </div>
    </div>
  );
}

export default SignIn;
