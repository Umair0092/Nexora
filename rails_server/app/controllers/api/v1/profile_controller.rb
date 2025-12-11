module Api
  module V1
    class ProfileController < ApplicationController
      def show
        render json: current_user.as_json(only: [:id, :email, :first_name, :last_name, :profile_image_url, :bio, :skills, :experience, :resume_url])
      end

      def update
        if current_user.update(user_params)
          render json: current_user.as_json(only: [:id, :email, :first_name, :last_name, :profile_image_url, :bio, :skills, :experience, :resume_url])
        else
          render json: { errors: current_user.errors.full_messages }, status: :unprocessable_entity
        end
      end

      def upload_resume
        # In a real app, this would handle ActiveStorage upload
        # Here we mock the upload and extraction process
        
        # Simulate processing delay
        sleep 1

        # Mock extracting data from a resume
        extracted_data = {
          bio: "Experienced software engineer with a passion for building scalable web applications. Proven track record in full-stack development using modern technologies.",
          skills: ["Ruby", "Rails", "React", "TypeScript", "PostgreSQL", "Docker", "AWS"],
          experience: [
            {
              title: "Senior Software Engineer",
              company: "Tech Corp",
              duration: "2020 - Present",
              description: "Leading a team of developers to build high-performance web solutions."
            },
            {
              title: "Software Developer",
              company: "Startup Inc",
              duration: "2018 - 2020",
              description: "Developed and maintained multiple client-facing applications."
            }
          ]
        }

        if current_user.update(extracted_data.merge(resume_url: "https://example.com/resume.pdf"))
           render json: current_user.as_json(only: [:id, :email, :first_name, :last_name, :profile_image_url, :bio, :skills, :experience, :resume_url])
        else
           render json: { errors: current_user.errors.full_messages }, status: :unprocessable_entity
        end
      end

      private

      def user_params
        params.require(:user).permit(:first_name, :last_name, :bio, :resume_url, skills: [], experience: [:title, :company, :duration, :description])
      end
    end
  end
end
