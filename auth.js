let supabaseClient = null;
let authMode = "login";

window.currentPlan = "free";

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

    const { data } = await supabaseClient.auth.getSession();

    if (data.session) {
      await loadAccount(data.session);
    } else {
      updateAccountButton(false);
    }

    supabaseClient.auth.onAuthStateChange(async (event, session) => {
      if (session) {
        await loadAccount(session);
      } else {
        window.currentPlan = "free";
        updateAccountButton(false);

        if (window.renderPlan) {
          window.renderPlan();
        }
      }
    });

  } catch (error) {
    console.error("Auth:", error);
    updateAccountButton(false);
  }
}

window.getAccessToken = async function () {
  if (!supabaseClient) return null;

  const { data } = await supabaseClient.auth.getSession();

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
      throw new Error(data.error || "Impossible de charger le compte.");
    }

    window.currentPlan = data.plan || "free";

    updateAccountButton(true, session.user.email);

    if (window.renderPlan) {
      window.renderPlan();
    }

  } catch (error) {
    console.error(error);
    window.currentPlan = "free";

    if (window.renderPlan) {
      window.renderPlan();
    }
  }
}

function updateAccountButton(loggedIn, email = "") {
  const button = document.getElementById("accountButton");

  if (!button) return;

  button.textContent = loggedIn ? "MON COMPTE" : "CONNEXION";
  button.title = email;
}

function openAccount() {
  document.getElementById("accountModal").classList.remove("hidden");

  document.getElementById("accountMessage").textContent = "";
  document.getElementById("accountForm").classList.remove("hidden");
  document.getElementById("accountLogged").classList.add("hidden");

  checkSessionDisplay();
}

async function checkSessionDisplay() {
  if (!supabaseClient) return;

  const { data } = await supabaseClient.auth.getSession();

  if (!data.session) return;

  document.getElementById("accountForm").classList.add("hidden");
  document.getElementById("accountLogged").classList.remove("hidden");

  document.getElementById("accountEmail").textContent =
    data.session.user.email || "";
}

function closeAccount() {
  document.getElementById("accountModal").classList.add("hidden");
}

function setAuthMode(mode) {
  authMode = mode;

  document.getElementById("accountTitle").textContent =
    mode === "signup" ? "Créer un compte" : "Connexion";

  document.getElementById("accountSubmit").textContent =
    mode === "signup" ? "CRÉER MON COMPTE" : "SE CONNECTER";

  document.getElementById("accountSwitch").textContent =
    mode === "signup"
      ? "Déjà un compte ? Se connecter"
      : "Pas encore de compte ? S'inscrire";

  document.getElementById("accountMessage").textContent = "";
}

async function submitAuth(event) {
  event.preventDefault();

  if (!supabaseClient) {
    return showAuthMessage("Connexion au service indisponible.");
  }

  const email = document.getElementById("accountEmailInput").value.trim();
  const password = document.getElementById("accountPassword").value;

  if (!email || password.length < 6) {
    return showAuthMessage("Entre un email valide et un mot de passe d'au moins 6 caractères.");
  }

  const button = document.getElementById("accountSubmit");
  button.disabled = true;

  try {
    if (authMode === "signup") {
      const { data, error } = await supabaseClient.auth.signUp({
        email,
        password
      });

      if (error) throw error;

      if (!data.session) {
        showAuthMessage("Compte créé. Vérifie tes emails pour confirmer ton inscription.");
      } else {
        showAuthMessage("Compte créé avec succès.");
      }

    } else {
      const { error } = await supabaseClient.auth.signInWithPassword({
        email,
        password
      });

      if (error) throw error;

      showAuthMessage("Connexion réussie.");
    }

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
  document.getElementById("accountMessage").textContent = message;
}

// Code propriétaire ZEYRO2

async function redeemOwnerCode() {
  const input = document.getElementById("ownerCodeInput");
  const message = document.getElementById("ownerCodeMessage");
  const code = input.value.trim();

  if (!code) {
    message.textContent = "Entre ton code propriétaire.";
    return;
  }

  if (!supabaseClient) {
    message.textContent = "Service indisponible.";
    return;
  }

  const token = await window.getAccessToken();

  if (!token) {
    message.textContent = "Connecte-toi avant d'utiliser le code.";
    return;
  }

  const button = document.getElementById("ownerCodeButton");
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
      throw new Error(data.error || "Code invalide.");
    }

    message.textContent = "Accès propriétaire activé.";

    window.currentPlan = "owner";

    if (window.renderPlan) {
      window.renderPlan();
    }

  } catch (error) {
    message.textContent = error.message;

  } finally {
    button.disabled = false;
  }
}

document.addEventListener("DOMContentLoaded", () => {
  document.getElementById("accountButton")
    ?.addEventListener("click", openAccount);

  document.getElementById("accountClose")
    ?.addEventListener("click", closeAccount);

  document.getElementById("accountForm")
    ?.addEventListener("submit", submitAuth);

  document.getElementById("accountSwitch")
    ?.addEventListener("click", () => {
      setAuthMode(authMode === "login" ? "signup" : "login");
    });

  document.getElementById("logoutButton")
    ?.addEventListener("click", logout);

  document.getElementById("ownerCodeButton")
    ?.addEventListener("click", redeemOwnerCode);

  document.getElementById("ownerCodeInput")
    ?.addEventListener("keydown", event => {
      if (event.key === "Enter") redeemOwnerCode();
    });

  initAuth();
});