# ESTATIQ

ESTATIQ is a Flask real-estate workspace with Days on Market and acre-to-square-foot calculators.

## Run locally

1. Create and activate a virtual environment.
2. Install dependencies:

   ```sh
   pip install -r requirements.txt
   ```

3. Start the app:

   ```sh
   python app.py
   ```

   The app listens on `0.0.0.0` and uses `PORT` when set (default: `5000`). Open `http://localhost:5000`.

## Deploy on Render

Create a **Web Service** from this repository and use:

- **Build Command:** `pip install -r requirements.txt`
- **Start Command:** `gunicorn app --bind 0.0.0.0:$PORT`

Render supplies `PORT` at runtime. Gunicorn imports the Flask application exposed as `app` in `app.py`. No application secrets or external service credentials are required by the current app.

## Calculator APIs

- `POST /api/dom` accepts `{"listing_date":"01/05/2026","sale_date":"01/19/2026"}` or an `entries` array of date pairs.
- `POST /api/acre` accepts `{"acres":"2.5"}` or an `entries` array of acreage values.

Both endpoints return JSON and validate invalid input with an HTTP 400 response.
