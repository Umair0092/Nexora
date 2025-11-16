import React, { useState } from 'react'
import { Link } from 'react-router-dom'
import { register } from '../../api/authentication_endpoints'

function SignUp() {
  const [email, setEmail] = useState('')
  const [fullName, setFullName] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState(null)
  const [successMessage, setSuccessMessage] = useState('')
  const [isLoading, setIsLoading] = useState(false)

  const handleSubmit = async (e) => {
    e.preventDefault()
    setIsLoading(true)
    setError(null)
    setSuccessMessage('')

    try {
      const response = await register(fullName, email, password)
      setSuccessMessage(response.message || 'Sign up successful! You are now logged in.')
    } catch (err) {
      setError(err.message || 'An unexpected error occurred.')
    } finally {
      setIsLoading(false)
    }
  }

  return (
    <div className="flex items-center justify-center min-h-screen w-full bg-slate-900 fixed inset-0">
			<div className="w-full max-w-md p-10 space-y-6 bg-slate-800 rounded-xl shadow-2xl">
					<div className="text-center">
					<h1 className="text-4xl font-bold text-white mb-1">Nexora</h1>
					<p className="text-sm text-gray-400">Create your account</p>
					</div>
					
					<div className="space-y-5">
					<div>
							<label
							htmlFor="fullName"
							className="form-label"
							>
							Full Name
							</label>
							<input
							type="text"
							id="fullName"
							value={fullName}
							onChange={(e) => setFullName(e.target.value)}
							placeholder="Name"
							className="form-input"
							autoComplete="name"
							/>
					</div>

					<div>
							<label
							htmlFor="email"
							className="form-label"
							>
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
							/>
					</div>

					<div>
							<label
							htmlFor="password"
							className="form-label"
							>
							Password
							</label>
							<input
							type="password"
							id="password"
							value={password}
							onChange={(e) => setPassword(e.target.value)}
							placeholder="••••••••"
							className="form-input"
							autoComplete="new-password"
							/>
					</div>

					<button
							onClick={handleSubmit}
							disabled={isLoading}
							className="btn-primary"
					>
							{isLoading ? 'Creating Account...' : 'Sign Up'}
					</button>
					</div>

					{error && (
					<p className="text-sm text-center text-red-400">{error}</p>
					)}
					{successMessage && (
					<p className="text-sm text-center text-green-400">{successMessage}</p>
					)}

					<p className="text-sm text-center text-gray-400">
					Already have an account?{' '}
					<Link to="/login" className="text-cyan-400 hover:text-cyan-300 font-medium transition-colors">
							Sign In
					</Link>
					</p>
			</div>
    </div>
  )
}

export default SignUp
