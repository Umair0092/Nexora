import { Sparkles, Video, Mic, Zap, Globe } from 'lucide-react';
import { Link } from 'react-router-dom';
import Features from './features';
import Navbar from '../shared/navbar';

export default function LandingPage() {
  return (
    <div className="min-h-screen bg-slate-950">
      {/* Navigation */}
       <Navbar />
      {/* Hero Section */}
      <section className="px-8 py-20">
        <div className="max-w-7xl mx-auto">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-12 items-center">
            <div>
              <div className="inline-flex items-center gap-2 px-4 py-2 mb-6 bg-slate-900 border border-slate-800 rounded-full">
                <Sparkles className="w-4 h-4 text-cyan-400" />
                <span className="text-sm text-cyan-400">AI-Powered Interview Practice</span>
              </div>
              
              <h1 className="text-5xl lg:text-6xl font-bold text-white mb-4">
                Redefining Interview<br />
                <span className="text-cyan-400">Readiness</span>
              </h1>
              
              <p className="text-lg text-gray-400 mb-8 max-w-xl">
                Master your interview skills with real-time AI feedback. Practice with a voice assistant, get instant behavioral cues, and boost your confidence before the big day.
              </p>
              
              <div className="flex gap-4 mb-8">
                <Link to="/signup" className="px-8 py-3 text-sm font-semibold text-center bg-cyan-400 rounded-lg hover:bg-cyan-300 transition-all" style={{ color: '#0f172a' }}>
                  Get Started
                </Link>
                <Link to="/login" className="px-8 py-3 text-sm font-semibold text-center text-white bg-slate-800 border border-slate-700 rounded-lg hover:bg-slate-700 transition-all">
                  Sign In
                </Link>
              </div>
              
              <div className="flex gap-6">
                <div className="flex items-center gap-2">
                  <div className="w-2 h-2 bg-green-400 rounded-full"></div>
                  <span className="text-sm text-gray-400">Real-time feedback</span>
                </div>
                <div className="flex items-center gap-2">
                  <div className="w-2 h-2 bg-green-400 rounded-full"></div>
                  <span className="text-sm text-gray-400">Multi-language</span>
                </div>
                <div className="flex items-center gap-2">
                  <div className="w-2 h-2 bg-green-400 rounded-full"></div>
                  <span className="text-sm text-gray-400">AI-powered</span>
                </div>
              </div>
            </div>
            
            <div className="relative">
              <div className="bg-gradient-to-br from-teal-600 to-teal-800 rounded-2xl p-12 aspect-video flex items-center justify-center">
                <div className="text-center">
                  <div className="w-32 h-32 bg-slate-800 rounded-full mx-auto mb-4 flex items-center justify-center">
                    <div className="w-24 h-24 bg-slate-700 rounded-full"></div>
                  </div>
                  <div className="w-48 h-3 bg-teal-900 rounded mx-auto mb-2"></div>
                  <div className="w-32 h-3 bg-teal-900 rounded mx-auto"></div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      <section className="px-8 py-20 bg-slate-900">
        <div className="max-w-7xl mx-auto">
          <div className="text-center mb-16">
            <h2 className="text-4xl font-bold text-white mb-4">
              Powerful Features for Success
            </h2>
            <p className="text-lg text-gray-400 max-w-2xl mx-auto">
              Everything you need to ace your next interview
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
            {[
              {
                icon: <Video className="w-6 h-6 text-slate-900" />,
                title: 'Real-Time Video Analysis',
                description: 'Advanced AI monitors your non-verbal cues and body language during the interview.',
              },
              {
                icon: <Mic className="w-6 h-6 text-slate-900" />,
                title: 'Voice Assistant Interviewer',
                description: 'Natural conversational AI asks relevant questions based on your domain and experience.',
              },
              {
                icon: <Zap className="w-6 h-6 text-slate-900" />,
                title: 'Instant Feedback',
                description: 'Visual cues (green/red) provide immediate feedback on your behavior and responses.',
              },
              {
                icon: <Globe className="w-6 h-6 text-slate-900" />,
                title: 'Multi-Language Support',
                description: 'Practice in English, Urdu, French, or Spanish - perfect for global opportunities.',
              },
            ].map((feature) => (
              <Features key={feature.title} {...feature} />
            ))}
          </div>
        </div>
      </section>

      <section className="px-8 py-12 bg-cyan-400">
        <div className="max-w-7xl mx-auto text-center">
          <h3 className="text-2xl font-bold mb-2" style={{ color: '#0f172a' }}>
            Ready to ace your next interview?
          </h3>
          <p className="text-slate-800 mb-6">
            Join thousands of job seekers who have improved their interview skills
          </p>
          <Link to="/signup" className="inline-block px-8 py-3 text-sm font-semibold bg-slate-900 text-white rounded-lg hover:bg-slate-800 transition-all">
            Get Started for Free
          </Link>
        </div>
      </section>
    </div>
  );
}
