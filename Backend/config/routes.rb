Rails.application.routes.draw do
  # Define your application routes per the DSL in https://guides.rubyonrails.org/routing.html

  # Reveal health status on /up that returns 200 if the app boots with no exceptions, otherwise 500.
  # Can be used by load balancers and uptime monitors to verify that the app is live.
  get "up" => "rails/health#show", as: :rails_health_check

  namespace :api do
    namespace :v1 do
      post "login", to: "auth#login"
      post "register", to: "auth#register"
      get "me", to: "auth#user"

      post "password/forgot", to: "passwords#forgot"
      post "password/reset", to: "passwords#reset"
      post "email/verify", to: "email_verifications#create"
      post "email/resend", to: "email_verifications#resend"
      post "reminders/unsubscribe", to: "reminders#unsubscribe"

      resources :domains, only: [ :index, :show ]

      # Interviews in progress (scored and removed by sessions/sync_ai_session).
      resources :interviews, only: [ :create, :show, :destroy ] do
        post "answer", on: :member
      end
      resources :quizzes, only: [ :create, :show, :destroy ] do
        get "categories", on: :collection
        post "answer", on: :member
      end
      post "resume/parse", to: "uploads#parse_resume"
      post "transcriptions", to: "uploads#transcribe"
      post "speech", to: "speeches#create"

      resources :sessions, controller: "interview_sessions", only: [ :index, :show ] do
         collection do
           get "stats"
           get "progress"
           post "sync_ai_session"
         end

         resource :report, only: [ :show ]
         resource :share, only: [ :create, :destroy ]
         resources :answers, only: [] do
           member do
             post "attempts", action: :create_attempt
             post "improve"
           end
         end
      end
      get "shared/:token", to: "shares#show", as: :shared_report

      resource :profile, only: [ :show, :update, :destroy ], controller: "profile" do
        get "export"
      end
    end
  end

  # Everything else is the React app; it handles its own routes.
  get "*path", to: "spa#index", constraints: ->(req) { req.format.html? && !req.path.start_with?("/api/") }
  root "spa#index"
end
