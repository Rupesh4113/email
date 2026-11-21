# How to Set Up the Google Gmail API for Verifier Mail AI

Follow these steps to generate the `GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET` required for this application.

### Step 1: Create a Google Cloud Project
1. Go to the [Google Cloud Console](https://console.cloud.google.com/).
2. Click on the project dropdown at the top and select **"New Project"**.
3. Name your project (e.g., `VerifierMail-AI`) and click **"Create"**.

### Step 2: Enable the Gmail API
1. In the sidebar, go to **APIs & Services > Library**.
2. Search for **"Gmail API"**.
3. Click on the Gmail API result and click **"Enable"**.

### Step 3: Configure the OAuth Consent Screen
1. Go to **APIs & Services > OAuth consent screen**.
2. Select **"External"** (if you're not a Google Workspace user) and click **"Create"**.
3. Fill in the required App Information:
   - **App name**: Verifier Mail AI
   - **User support email**: Your email address
   - **Developer contact info**: Your email address
4. Click **"Save and Continue"**.
5. In the **"Scopes"** section, click **"Add or Remove Scopes"**.
6. Search for `https://www.googleapis.com/auth/gmail.readonly` and add it.
7. Add your own email address as a **Test User** (required while the app is in "Testing" mode).

### Step 4: Create OAuth 2.0 Credentials
1. Go to **APIs & Services > Credentials**.
2. Click **"Create Credentials"** and select **"OAuth client ID"**.
3. Select **"Web application"** as the Application type.
4. Add **Authorized JavaScript origins**:
   - `http://localhost:3000` (for local development)
   - Your App's URL (found in AI Studio)
5. Add **Authorized redirect URIs**:
   - `http://localhost:3000/api/auth/callback`
   - `https://[YOUR_APP_URL]/api/auth/callback`
6. Click **"Create"**.
7. A dialog will appear with your **Client ID** and **Client Secret**.

### Step 5: Add Keys to AI Studio
1. Open the **Settings** menu in AI Studio.
2. In the **Secrets** or **Environment Variables** panel, add the following:
   - `GOOGLE_CLIENT_ID`: Your Client ID
   - `GOOGLE_CLIENT_SECRET`: Your Client Secret
   - `SESSION_SECRET`: A random long string (for session encryption)

### Step 6: Restart the App
Once the secrets are added, the app will automatically refresh and your "Login & Sync" button will be fully functional!
