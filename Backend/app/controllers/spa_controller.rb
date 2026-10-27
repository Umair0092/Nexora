# Serves the built React app (public/index.html) for any page URL, so deep
# links like /report/12 load the app, which then routes in the browser.
class SpaController < ActionController::API
  INDEX = Rails.public_path.join("index.html")

  def index
    if INDEX.exist?
      send_file INDEX, type: "text/html", disposition: "inline"
    else
      render plain: "The web app isn't built. Run `npm run build`, or use `bin/dev` for development.", status: :not_found
    end
  end
end
