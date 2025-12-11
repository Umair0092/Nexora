Rails.application.routes.draw do
  # Define your application routes per the DSL in https://guides.rubyonrails.org/routing.html

  # Reveal health status on /up that returns 200 if the app boots with no exceptions, otherwise 500.
  # Can be used by load balancers and uptime monitors to verify that the app is live.
  get "up" => "rails/health#show", as: :rails_health_check

  namespace :api do
    namespace :v1 do
      post 'login', to: 'auth#login'
      post 'register', to: 'auth#register'
      get 'me', to: 'auth#user'

      resources :domains, only: [:index, :show]
      
      resources :sessions, controller: 'interview_sessions', only: [:index, :show, :create] do
         collection do
           get 'stats'
         end
         member do
           post 'complete'
         end
         
         resources :answers, only: [:index, :create, :update]
         resource :report, only: [:show]
      end
      resource :profile, only: [:show, :update], controller: 'profile' do
         post 'upload_resume'
      end
    end
  end
end
