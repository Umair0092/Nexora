module Api
  module V1
    # Technical quizzes from the question bank while they're in progress.
    #
    #   GET    /api/v1/quizzes/categories   -> { categories, difficulties }
    #   POST   /api/v1/quizzes              { target_role, num_questions, difficulty, language } -> 201 { session_id, first_question, ... }
    #   GET    /api/v1/quizzes/:id          -> answered questions, current question and progress
    #   POST   /api/v1/quizzes/:id/answer   { answer, speech? } -> { next_question, is_complete, ... }
    #   DELETE /api/v1/quizzes/:id
    class QuizzesController < ApplicationController
      include LiveInterviewActions

      def categories
        render json: { categories: QuestionBank.categories, difficulties: QuestionBank::DIFFICULTIES }
      end

      def create
        category = params[:target_role].to_s
        count = Integer(params[:num_questions].to_s, exception: false) || 5
        difficulty = params[:difficulty].to_s.downcase.presence || "medium"
        language = params[:language].presence || "en"

        error =
          if !QuestionBank.categories.include?(category) then "Choose one of: #{QuestionBank.categories.join(', ')}."
          elsif !count.between?(1, 20) then "Choose between 1 and 20 questions."
          elsif !QuestionBank::DIFFICULTIES.include?(difficulty) then "Choose easy, medium or hard."
          elsif !Interviewing::LANGUAGES.include?(language) then "Unsupported language."
          end
        return render json: { error: error }, status: :unprocessable_entity if error

        quiz = QuizRun.build(category: category, num_questions: count, difficulty: difficulty, language: language)
        live = LiveInterview.start!(current_user, quiz)

        render json: {
          session_id: live.id,
          target_role: quiz.target_role,
          difficulty: quiz.difficulty,
          num_questions: quiz.num_questions,
          first_question: quiz.current_question,
          questions_asked: quiz.questions_asked,
          is_complete: quiz.complete?,
          language: quiz.language
        }, status: :created
      end

      def show
        open_live("quiz") do |quiz|
          render json: {
            session_id: params[:id],
            target_role: quiz.target_role,
            difficulty: quiz.difficulty,
            language: quiz.language,
            questions_answered: quiz.answered,
            questions_asked: quiz.questions_asked,
            num_questions: quiz.num_questions,
            is_complete: quiz.complete?,
            current_question: quiz.current_question,
            transcript: quiz.transcript
          }
        end
      end

      def answer
        text = answer_text or return

        open_live("quiz") do |quiz|
          if quiz.complete?
            render json: { error: "This quiz is already complete." }, status: :gone
            next
          end

          next_question, complete = quiz.answer!(text, speech_param)
          render json: {
            next_question: next_question,
            questions_asked: quiz.questions_asked,
            num_questions: quiz.num_questions,
            is_complete: complete
          }
        end
      end

      def destroy
        current_user.live_interviews.where(kind: "quiz", id: params[:id]).delete_all
        head :no_content
      end
    end
  end
end
