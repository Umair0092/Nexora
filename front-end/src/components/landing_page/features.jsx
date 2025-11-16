import React from 'react'

function Features({ title, description, icon }) {
  return (
    <div className="p-6 bg-slate-800 border border-slate-700 rounded-xl hover:border-cyan-400 transition-all">
        <div className="w-12 h-12 bg-cyan-400 rounded-lg flex items-center justify-center mb-4">
          {icon}
        </div>
        <h3 className="text-xl font-semibold text-white mb-3">
          {title}
        </h3>
        <p className="text-gray-400 text-sm">
          {description}
        </p>
    </div>
  )
}

export default Features
