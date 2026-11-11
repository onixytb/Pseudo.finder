

let supabaseClient = null;
let authMode = "login";

window.currentPlan = "free";

const $auth = id => document.getElementById(id);

async function initAuth() {
  try {
    const response = await fetch("/api/config");
    const config = await response.json();

    if (!response.ok || !config.supabaseUrl || !config.supabaseAnonKey) {
      throw new Error("Configuration Supabase indisponible.");
    }

    supabaseClient = window.supabase.createClient(
      config.supabaseUrl,
      config.supabaseAnonKey
    );

    const { data, error } = await supabaseClient.auth.getSession();

    if (error) throw error;

    if (data.session) {
      await loadAccount(data.session);
    } else {
      showLoggedOut();
    }

    supabaseClient.auth.onAuthStateChange((event, session) => {
      Promise.resolve().then(async () => {
        if (session) {
          await loadAccount(session);
        } else {
          window.currentPlan = "free";
          showLoggedOut();

          if (window.renderPlan) window.renderPlan();
        }
      });
    });

  } catch (error) {
    console.error("Initialisation Auth :", error);
    showLoggedOut();
  }
}

window.getAccessToken = async function () {
  if (!supabaseClient) return null;

  const { data, error } = await supabaseClient.auth.getSession();

  if (error) return null;

  return data.session?.access_token || null;
};

async function loadAccount(session) {
  try {
    const response = await fetch("/api/me", {
      headers: {
        Authorization: "Bearer " + session.access_token
      }
    });

    const data = await response.json();

    if (!response.ok) {
      throw new Error(data.error || "Chargement du compte impossible.");
    }

    window.currentPlan = data.plan || "free";

    showLoggedIn(session.user.email);

    if (window.renderPlan) window.renderPlan();

  } catch (error) {
    console.error("Chargement du compte :", error);
    window.currentPlan = "free";

    if (window.renderPlan) window.renderPlan();
  }
}

function showLoggedOut() {
  $auth("accountForm")?.classList.remove("hidden");
  $auth("accountConnected")?.classList.add("hidden");

  updateAccountButton(false);
}

function showLoggedIn(email) {
  $auth("accountForm")?.classList.add("hidden");
  $auth("accountConnected")?.classList.remove("hidden");

  if ($auth("accountUserEmail")) {
    $auth("accountUserEmail").textContent = email || "";
  }

  updateAccountButton(true, email);
}

function updateAccountButton(loggedIn, email = "") {
  const button = $auth("accountButton");

  if (!button) return;

  button.textContent = loggedIn ? "MON COMPTE" : "CONNEXION";
  button.title = email;
}

function openAccount() {
  $auth("accountModal")?.classList.remove("hidden");

  if ($auth("accountMessage")) {
    $auth("accountMessage").textContent = "";
  }

  checkSessionDisplay();
}

function closeAccount() {
  $auth("accountModal")?.classList.add("hidden");
}

async function checkSessionDisplay() {
  if (!supabaseClient) return;

  const { data } = await supabaseClient.auth.getSession();

  if (data.session) {
    showLoggedIn(data.session.user.email);
  } else {
    showLoggedOut();
  }
}

function setAuthMode(mode) {
  authMode = mode;

  $auth("accountTitle").textContent =
    mode === "signup" ? "Créer un compte" : "Connexion";

  $auth("accountSubmit").textContent =
    mode === "signup" ? "CRÉER MON COMPTE" : "SE CONNECTER";

  $auth("accountSwitch").textContent =
    mode === "signup"
      ? "Déjà un compte ? Se connecter"
      : "Pas encore de compte ? S'inscrire";

  $auth("accountMessage").textContent = "";
}

async function submitAuth(event) {
  event?.preventDefault();

  if (!supabaseClient) {
    return showAuthMessage("Service de connexion indisponible.");
  }

  const email = $auth("accountEmail").value.trim();
  const password = $auth("accountPassword").value;

  if (!email || password.length < 8) {
    return showAuthMessage(
      "Entre un email valide et un mot de passe d'au moins 8 caractères."
    );
  }

  const button = $auth("accountSubmit");
  button.disabled = true;

  try {
    let result;

    if (authMode === "signup") {
      result = await supabaseClient.auth.signUp({
        email,
        password
      });

      if (result.error) throw result.error;

      if (!result.data.session) {
        showAuthMessage(
          "Compte créé. Vérifie tes emails pour confirmer ton inscription."
        );
        return;
      }

    } else {
      result = await supabaseClient.auth.signInWithPassword({
        email,
        password
      });

      if (result.error) throw result.error;
    }

    await loadAccount(result.data.session);

    showAuthMessage(
      authMode === "signup"
        ? "Compte créé avec succès."
        : "Connexion réussie."
    );

  } catch (error) {
    showAuthMessage(error.message || "Une erreur est survenue.");

  } finally {
    button.disabled = false;
  }
}

async function logout() {
  if (!supabaseClient) return;

  const { error } = await supabaseClient.auth.signOut();

  if (error) {
    showAuthMessage(error.message);
    return;
  }

  closeAccount();
}

function showAuthMessage(message) {
  const element = $auth("accountMessage");

  if (element) element.textContent = message;
}

// ACTIVATION DU CODE PROPRIETAIRE

async function redeemOwnerCode() {
  const input = $auth("ownerCodeInput");
  const message = $auth("ownerCodeMessage");
  const button = $auth("ownerCodeButton");

  if (!input || !message || !button) return;

  const code = input.value.trim();

  if (!code) {
    message.textContent = "Entre ton code propriétaire.";
    return;
  }

  const token = await window.getAccessToken();

  if (!token) {
    message.textContent = "Connecte-toi avant d'utiliser le code.";
    return;
  }

  button.disabled = true;
  message.textContent = "Vérification du code...";

  try {
    const response = await fetch("/api/owner/redeem", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: "Bearer " + token
      },
      body: JSON.stringify({ code })
    });

    const data = await response.json();

    if (!response.ok) {
      throw new Error(data.error || "Activation impossible.");
    }

    await loadAccount(
      (await supabaseClient.auth.getSession()).data.session
    );

    message.textContent = "Accès propriétaire activé !";
    input.value = "";

  } catch (error) {
    message.textContent = error.message;

  } finally {
    button.disabled = false;
  }
}

// BRANCHEMENT DES BOUTONS

document.addEventListener("DOMContentLoaded", () => {
  $auth("accountButton")?.addEventListener("click", openAccount);
  $auth("closeAccount")?.addEventListener("click", closeAccount);

  $auth("accountSubmit")?.addEventListener("click", submitAuth);

  $auth("accountPassword")?.addEventListener("keydown", event => {
    if (event.key === "Enter") submitAuth(event);
  });

  $auth("accountSwitch")?.addEventListener("click", () => {
    setAuthMode(authMode === "login" ? "signup" : "login");
  });

  $auth("accountLogout")?.addEventListener("click", logout);

  $auth("ownerCodeButton")?.addEventListener("click", redeemOwnerCode);

  $auth("ownerCodeInput")?.addEventListener("keydown", event => {
    if (event.key === "Enter") {
      event.preventDefault();
      redeemOwnerCode();
    }
  });

  initAuth();
});
