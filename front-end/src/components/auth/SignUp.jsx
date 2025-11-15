import React, { useState } from 'react'
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
      const response = await register(email, password)
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
							className="block mb-2 text-sm font-medium text-gray-300"
							>
							Full Name
							</label>
							<input
							type="text"
							id="fullName"
							value={fullName}
							onChange={(e) => setFullName(e.target.value)}
							placeholder="Usman"
							className="w-full px-4 py-3 text-white placeholder-gray-500 bg-slate-700 border border-slate-600 rounded-lg focus:outline-none focus:ring-2 focus:ring-cyan-400 focus:border-transparent transition-all"
							autoComplete="name"
							/>
					</div>

					<div>
							<label
							htmlFor="email"
							className="block mb-2 text-sm font-medium text-gray-300"
							>
							Email
							</label>
							<input
							type="email"
							id="email"
							value={email}
							onChange={(e) => setEmail(e.target.value)}
							placeholder="usman@example.com"
							className="w-full px-4 py-3 text-white placeholder-gray-500 bg-slate-700 border border-slate-600 rounded-lg focus:outline-none focus:ring-2 focus:ring-cyan-400 focus:border-transparent transition-all"
							autoComplete="email"
							/>
					</div>

					<div>
							<label
							htmlFor="password"
							className="block mb-2 text-sm font-medium text-gray-300"
							>
							Password
							</label>
							<input
							type="password"
							id="password"
							value={password}
							onChange={(e) => setPassword(e.target.value)}
							placeholder="••••••••"
							className="w-full px-4 py-3 text-white placeholder-gray-400 bg-slate-700 border border-slate-600 rounded-lg focus:outline-none focus:ring-2 focus:ring-cyan-400 focus:border-transparent transition-all"
							autoComplete="new-password"
							/>
					</div>

					<button
							onClick={handleSubmit}
							disabled={isLoading}
							className="w-full px-4 py-3 font-semibold text-slate-900 bg-cyan-400 rounded-lg hover:bg-cyan-300 focus:outline-none focus:ring-2 focus:ring-cyan-400 focus:ring-offset-2 focus:ring-offset-slate-800 disabled:opacity-50 disabled:cursor-not-allowed transition-all"
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
					<button className="text-cyan-400 hover:text-cyan-300 font-medium transition-colors">
							Sign In
					</button>
					</p>
			</div>
    </div>
  )
}

export default SignUp