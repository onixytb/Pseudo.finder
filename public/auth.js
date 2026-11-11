
let supabaseClient = null;
let authMode = "login";

window.currentPlan = "free";

const $ = id => document.getElementById(id);

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
      updateAccountButton(false);
    }

    supabaseClient.auth.onAuthStateChange((event, session) => {
      if (session) {
        loadAccount(session);
      } else {
        window.currentPlan = "free";
        updateAccountButton(false);
        showLoggedOut();

        if (window.renderPlan) window.renderPlan();
      }
    });

  } catch (error) {
    console.error("Auth:", error);
    updateAccountButton(false);
    showAuthMessage("Impossible de connecter le service de compte.");
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
      throw new Error(data.error || "Impossible de charger le compte.");
    }

    window.currentPlan = data.plan || "free";

    updateAccountButton(true, session.user.email);
    showLoggedIn(session.user.email);

    if (window.renderPlan) window.renderPlan();

  } catch (error) {
    console.error("Chargement du compte :", error);
    showAuthMessage("Compte connecté, mais forfait impossible à charger.");

    updateAccountButton(true, session.user.email);
  }
}

function updateAccountButton(loggedIn, email = "") {
  const button = $("accountButton");
  if (!button) return;

  button.textContent = loggedIn ? "MON COMPTE" : "CONNEXION";
  button.title = email;
}

function openAccount() {
  $("accountModal")?.classList.remove("hidden");
  $("accountMessage").textContent = "";

  checkSessionDisplay();
}

function closeAccount() {
  $("accountModal")?.classList.add("hidden");
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

function showLoggedIn(email = "") {
  $("accountForm")?.classList.add("hidden");
  $("accountSwitch")?.classList.add("hidden");
  $("accountConnected")?.classList.remove("hidden");

  if ($("accountUserEmail")) {
    $("accountUserEmail").textContent = email;
  }

  if ($("accountTitle")) {
    $("accountTitle").textContent = "MON COMPTE";
  }
}

function showLoggedOut() {
  $("accountForm")?.classList.remove("hidden");
  $("accountSwitch")?.classList.remove("hidden");
  $("accountConnected")?.classList.add("hidden");
  $("accountTitle").textContent =
    authMode === "signup" ? "CRÉER UN COMPTE" : "CONNEXION";
}

function setAuthMode(mode) {
  authMode = mode;

  $("accountTitle").textContent =
    mode === "signup" ? "CRÉER UN COMPTE" : "CONNEXION";

  $("accountSubmit").textContent =
    mode === "signup" ? "CRÉER MON COMPTE" : "SE CONNECTER";

  $("accountSwitch").textContent =
    mode === "signup"
      ? "Déjà un compte ? Se connecter"
      : "Pas encore de compte ? Créer un compte";

  $("accountMessage").textContent = "";
}

async function submitAuth(event) {
  event?.preventDefault();

  if (!supabaseClient) {
    return showAuthMessage("Service de connexion indisponible.");
  }

  const email = $("accountEmail").value.trim();
  const password = $("accountPassword").value;

  if (!email || password.length < 8) {
    return showAuthMessage(
      "Entre un email valide et un mot de passe d'au moins 8 caractères."
    );
  }

  const button = $("accountSubmit");
  button.disabled = true;

  try {
    if (authMode === "signup") {
      const { data, error } = await supabaseClient.auth.signUp({
        email,
        password
      });

      if (error) throw error;

      if (data.session) {
        showAuthMessage("Compte créé avec succès !");
        await loadAccount(data.session);
      } else {
        showAuthMessage(
          "Compte créé. Vérifie tes emails pour confirmer ton inscription."
        );
      }

    } else {
      const { data, error } =
        await supabaseClient.auth.signInWithPassword({
          email,
          password
        });

      if (error) throw error;

      showAuthMessage("Connexion réussie !");
      if (data.session) await loadAccount(data.session);
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

  window.currentPlan = "free";
  updateAccountButton(false);
  showLoggedOut();
  closeAccount();

  if (window.renderPlan) window.renderPlan();
}

function showAuthMessage(message) {
  const element = $("accountMessage");
  if (element) element.textContent = message;
}

async function redeemOwnerCode() {
  const input = $("ownerCodeInput");
  const message = $("ownerCodeMessage");
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

  const button = $("ownerCodeButton");
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

    window.currentPlan = "owner";
    message.textContent = "Accès propriétaire activé !";

    if (window.renderPlan) window.renderPlan();

    const { data: sessionData } = await supabaseClient.auth.getSession();

    if (sessionData.session) {
      await loadAccount(sessionData.session);
    }

  } catch (error) {
    message.textContent = error.message;

  } finally {
    button.disabled = false;
  }
}

document.addEventListener("DOMContentLoaded", () => {
  $("accountButton")?.addEventListener("click", openAccount);
  $("closeAccount")?.addEventListener("click", closeAccount);

  $("accountSubmit")?.addEventListener("click", submitAuth);

  $("accountSwitch")?.addEventListener("click", () => {
    setAuthMode(authMode === "login" ? "signup" : "login");
  });

  $("accountLogout")?.addEventListener("click", logout);

  $("ownerCodeButton")?.addEventListener("click", redeemOwnerCode);

  $("ownerCodeInput")?.addEventListener("keydown", event => {
    if (event.key === "Enter") redeemOwnerCode();
  });

  $("accountPassword")?.addEventListener("keydown", event => {
    if (event.key === "Enter") submitAuth(event);
  });

  initAuth();
});
