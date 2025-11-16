import axios from 'axios'

const BASE_URL = 'http://127.0.0.1:3000'

// Note: Your Rails routes are likely namespaced, e.g., '/users/login'.
// I'm using the paths from your sessions_controller.rb which are standard for Devise.
const LOGIN_URL = `${BASE_URL}/login`
const REGISTER_URL = `${BASE_URL}/signup`
const LOGOUT_URL = `${BASE_URL}/logout`
/**
 * Sends a login request to the API.
 * @param {string} email - The user's email.
 * @param {string} password - The user's password.
 * @returns {Promise<object>} The user data from the API response.
 */
export const login = async (email, password) => {
  try {
    const response = await axios.post(LOGIN_URL, {
      user: { email, password },
    })

    // Extract and store the JWT from the response headers
    const token = response.headers.authorization
    if (token) {
      localStorage.setItem('authToken', token)
    }

    return response.data
  } catch (error) {
    console.error('Login failed:', error.response?.data || error.message)
    throw error.response?.data || new Error('Login failed')
  }
}


export const register = async (fullName, email, password) => {
  try {
    const response = await axios.post(REGISTER_URL, {
      user: { full_name: fullName, email, password },
    })

    const token = response.headers.authorization
    if (token) {
      localStorage.setItem('authToken', token)
    }

    return response.data
  } catch (error) {
    console.error('Registration failed:', error.response?.data || error.message)
    throw error.response?.data || new Error('Registration failed')
  }
}

/**
 * Sends a logout request to the API and clears local session data.
 */
export const logout = async () => {
  try {
    const token = localStorage.getItem('authToken')
    await axios.delete(LOGOUT_URL, {
      headers: {
        Authorization: token,
      },
    })
  } finally {
    localStorage.removeItem('authToken')
  }
}
