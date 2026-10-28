module Api
  module V1
    # The team's notes on a candidate. "@Full Name" mentions email that teammate.
    #
    #   POST   /api/v1/candidates/:candidate_id/notes      { body } -> the candidate's notes
    #   DELETE /api/v1/candidates/:candidate_id/notes/:id  (your own notes only)
    class CandidateNotesController < ApplicationController
      include HiringAccess

      before_action :load_candidate
      rate_limit to: 60, within: 10.minutes, only: :create, name: "candidate-note", by: -> { current_user.id },
                 store: AuthController::RATE_LIMIT_STORE, with: AuthController::RATE_LIMIT_RESPONSE

      def create
        body = params[:body].to_s.strip
        mentioned = CandidateNote.mentions_in(body, current_organization, current_user)
        note = @candidate.notes.new(user: current_user, body: body, mentioned_user_ids: mentioned.map(&:id))
        return errors_of(note) unless note.save

        mentioned.each { |user| HiringMailer.mention(note, user).deliver_later }
        current_organization.log!("note_added", user: current_user, candidate: @candidate, mentions: mentioned.size)
        render json: notes, status: :created
      end

      def destroy
        @candidate.notes.where(user: current_user).find(params[:id]).destroy!
        render json: notes
      end

      private

      def load_candidate
        @candidate = current_organization.candidates.find(params[:candidate_id])
      end

      def notes
        @candidate.notes.includes(:user).map { |n| HiringSerializer.note(n, current_user) }
      end
    end
  end
end
