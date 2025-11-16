import { BrowserRouter, Routes, Route } from 'react-router-dom'
import './App.css'
import SignUp from './components/auth/SignUp'
import SignIn from './components/auth/SignIn'
import LandingPage from './components/landing_page/Landing-page'
import Dashboard from './components/dashboard/Dashboard'

function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<LandingPage />} />
        <Route path='/dashboard' element={<Dashboard />} />
        <Route path="/signup" element={<SignUp />} />
        <Route path="/login" element={<SignIn />} />
      </Routes>
    </BrowserRouter>
  )
}

export default App
