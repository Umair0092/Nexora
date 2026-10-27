class UserSerializer
  def self.call(user)
    {
      id: user.id,
      email: user.email,
      firstName: user.first_name,
      lastName: user.last_name,
      profileImageUrl: user.profile_image_url,
      bio: user.bio,
      skills: user.skills || [],
      experience: user.experience || [],
      resumeUrl: user.resume_url,
      emailVerified: user.email_verified?,
      remindersEnabled: user.reminders_enabled,
      weeklyGoal: user.weekly_goal
    }
  end
end
