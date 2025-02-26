async function generateCode() {
  // Code verifier
  const generateRandomString = (length) => {
    const possible = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
    const values = crypto.getRandomValues(new Uint8Array(length));
    return values.reduce((acc, x) => acc + possible[x % possible.length], "");
  };

  // Code challenge
  const sha256 = async (plain) => {
    const encoder = new TextEncoder();
    const data = encoder.encode(plain);
    return crypto.subtle.digest("SHA-256", data);
  };
  const base64encode = (input) => {
    return btoa(String.fromCharCode(...new Uint8Array(input)))
      .replace(/=/g, "")
      .replace(/\+/g, "-")
      .replace(/\//g, "_");
  };

  const codeVerifier = generateRandomString(64);
  const hashed = await sha256(codeVerifier);
  return base64encode(hashed);
}

async function authorize(id) {
  try {
    let verifier = window.sessionStorage.getItem("verifier");
    if (!verifier) {
      verifier = await generateCode();
      window.sessionStorage.setItem("verifier", verifier);
    }

    const redirectUri = `${window.location.origin}/settings`;

    const scope = "user-read-playback-state user-modify-playback-state";
    const authorizeUrl = new URL("https://accounts.spotify.com/authorize");

    const params = {
      response_type: "code",
      client_id: id,
      scope,
      code_challenge_method: "S256",
      code_challenge: verifier,
      redirect_uri: redirectUri,
    };
    authorizeUrl.search = new URLSearchParams(params).toString();

    window.location.href = authorizeUrl.toString();
  } catch (error) {
    console.error(error);
  }
}
