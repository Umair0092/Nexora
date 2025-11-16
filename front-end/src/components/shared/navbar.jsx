import React from 'react'
import { Sparkles} from 'lucide-react';
import { Link } from 'react-router-dom';

function Navbar() {
  return (
     <nav className="flex items-center justify-between px-8 py-4 border-b border-slate-800">
        <div className="flex items-center gap-2">
          <Sparkles className="w-6 h-6 text-cyan-400" />
          <span className="text-xl font-bold text-white">Nexora</span>
        </div>
        <div className="flex items-center gap-4">
          <Link to="/login" className="px-4 py-2 text-sm font-medium text-white hover:text-cyan-400 transition-colors">
            Sign In
          </Link>
          <Link to="/signup" className="px-6 py-2 text-sm font-semibold bg-cyan-400 rounded-lg hover:bg-cyan-300 transition-all" style={{ color: '#0f172a' }}>
            Get Started
          </Link>
        </div>
      </nav>
  )
}

export default Navbar
