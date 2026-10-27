module Api
  module V1
    # CV-based and behavioral interviews while they're in progress. Saving the
    # report (sessions/sync_ai_session) scores them and deletes them.
    #
    #   POST   /api/v1/interviews             { candidate_data, target_role, num_questions, language,
    #                                           interview_style, job_description }  -> 201 { session_id, opening_question, ... }
    #   GET    /api/v1/interviews/:id         -> transcript and progress
    #   POST   /api/v1/interviews/:id/answer  { answer, speech? } -> { next_question, is_complete, ... }
    #   DELETE /api/v1/interviews/:id
    class InterviewsController < ApplicationController
      include LiveInterviewActions

      def create
        role = params[:target_role].to_s.strip.presence || Interviewing::DEFAULT_ROLE
        count = Integer(params[:num_questions].to_s, exception: false) || 10
        style = params[:interview_style].presence || "standard"
        language = params[:language].presence || "en"
        job_description = params[:job_description].is_a?(String) ? params[:job_description].strip : nil
        candidate = params[:candidate_data]

        error =
          if role.length > 100 then "The role can be up to 100 characters."
          elsif !count.between?(5, 15) then "Choose between 5 and 15 questions."
          elsif !Interviewing::STYLES.include?(style) then "Unknown interview style."
          elsif !Interviewing::LANGUAGES.include?(language) then "Unsupported language."
          elsif job_description.to_s.length > Interviewing::MAX_JOB_DESCRIPTION then "The job description can be up to 6,000 characters."
          elsif !candidate.is_a?(ActionController::Parameters) then "Add your CV details first."
          end
        return render json: { error: error }, status: :unprocessable_entity if error

        interview = CvInterview.build(
          candidate_data: ResumeParser.normalize(candidate.to_unsafe_h),
          target_role: role, num_questions: count, language: language, style: style,
          job_description: job_description
        )
        opening = interview.start!
        live = LiveInterview.start!(current_user, interview)

        render json: {
          session_id: live.id,
          opening_question: opening,
          questions_asked: interview.questions_asked,
          num_questions: interview.num_questions,
          is_complete: interview.complete?,
          language: interview.language
        }, status: :created
      end

      def show
        open_live("cv") do |interview|
          render json: {
            session_id: params[:id],
            target_role: interview.target_role,
            language: interview.language,
            interview_style: interview.style,
            has_job_description: interview.job_description.present?,
            questions_asked: interview.questions_asked,
            num_questions: interview.num_questions,
            is_complete: interview.complete?,
            conversation: interview.conversation
          }
        end
      end

      def answer
        text = answer_text or return

        open_live("cv") do |interview|
          if interview.complete?
            render json: { error: "This interview is already complete." }, status: :gone
            next
          end

          next_question, complete = interview.answer!(text, speech_param)
          render json: {
            next_question: next_question,
            questions_asked: interview.questions_asked,
            num_questions: interview.num_questions,
            is_complete: complete
          }
        end
      end

      def destroy
        current_user.live_interviews.where(kind: "cv", id: params[:id]).delete_all
        head :no_content
      end
    end
  end
end
