
const accountButton = document.getElementById("accountButton");
const accountModal = document.getElementById("accountModal");
const closeAccount = document.getElementById("closeAccount");

const accountTitle = document.getElementById("accountTitle");
const accountEmail = document.getElementById("accountEmail");
const accountPassword = document.getElementById("accountPassword");
const accountSubmit = document.getElementById("accountSubmit");
const accountSwitch = document.getElementById("accountSwitch");
const accountMessage = document.getElementById("accountMessage");

const accountForm = document.getElementById("accountForm");
const accountConnected = document.getElementById("accountConnected");
const accountUserEmail = document.getElementById("accountUserEmail");
const accountLogout = document.getElementById("accountLogout");

let supabaseClient = null;
let signupMode = false;
let currentUser = null;

function showAccountMessage(message, error = false) {
    accountMessage.textContent = message;
    accountMessage.style.color = error
        ? "#ff7777"
        : "#35e69a";
}

function updateFormMode() {
    accountTitle.textContent = signupMode
        ? "INSCRIPTION"
        : "CONNEXION";

    accountSubmit.textContent = signupMode
        ? "CRÉER MON COMPTE"
        : "SE CONNECTER";

    accountPassword.autocomplete = signupMode
        ? "new-password"
        : "current-password";

    accountSwitch.textContent = signupMode
        ? "Déjà un compte ? Se connecter"
        : "Pas encore de compte ? Créer un compte";
}

function updateAccountUI(user) {
    currentUser = user || null;

    if (currentUser) {
        accountForm.classList.add("hidden");
        accountSwitch.classList.add("hidden");
        accountConnected.classList.remove("hidden");

        accountTitle.textContent = "MON COMPTE";
        accountUserEmail.textContent =
            currentUser.email || "Compte connecté";

        accountButton.textContent = "MON COMPTE";

        showAccountMessage("Tu es connecté.");
    } else {
        accountForm.classList.remove("hidden");
        accountSwitch.classList.remove("hidden");
        accountConnected.classList.add("hidden");

        accountButton.textContent = "MON COMPTE";

        accountPassword.value = "";

        updateFormMode();
    }
}

async function initializeAccount() {
    try {
        if (!window.supabase) {
            throw new Error(
                "Le service Supabase n'a pas pu être chargé."
            );
        }

        const response = await fetch("/api/config", {
            cache: "no-store"
        });

        const config = await response.json();

        if (!response.ok) {
            throw new Error(
                config.error || "Configuration indisponible."
            );
        }

        if (
            !config.supabaseUrl ||
            !config.supabaseAnonKey
        ) {
            throw new Error(
                "Configuration Supabase incomplète."
            );
        }

        supabaseClient = window.supabase.createClient(
            config.supabaseUrl,
            config.supabaseAnonKey,
            {
                auth: {
                    persistSession: true,
                    autoRefreshToken: true,
                    detectSessionInUrl: true
                }
            }
        );

        const { data, error } =
            await supabaseClient.auth.getSession();

        if (error) throw error;

        updateAccountUI(data.session?.user || null);

        supabaseClient.auth.onAuthStateChange(
            (_event, session) => {
                updateAccountUI(session?.user || null);
            }
        );

    } catch (error) {
        console.error("Supabase :", error);

        showAccountMessage(
            error.message || "Impossible de contacter Supabase.",
            true
        );
    }
}

accountButton.addEventListener("click", () => {
    accountModal.classList.remove("hidden");

    if (currentUser) {
        updateAccountUI(currentUser);
    } else {
        updateFormMode();
    }
});

closeAccount.addEventListener("click", () => {
    accountModal.classList.add("hidden");
});

accountModal.addEventListener("click", event => {
    if (event.target === accountModal) {
        accountModal.classList.add("hidden");
    }
});

accountSwitch.addEventListener("click", () => {
    signupMode = !signupMode;

    accountPassword.value = "";

    showAccountMessage("");
    updateFormMode();
});

accountSubmit.addEventListener("click", async () => {
    if (!supabaseClient) {
        showAccountMessage(
            "Le service de compte n'est pas disponible. Vérifie la configuration.",
            true
        );
        return;
    }

    const email = accountEmail.value.trim();
    const password = accountPassword.value;

    if (!email || !accountEmail.checkValidity()) {
        showAccountMessage(
            "Entre une adresse e-mail valide.",
            true
        );
        return;
    }

    if (password.length < 8) {
        showAccountMessage(
            "Le mot de passe doit contenir au moins 8 caractères.",
            true
        );
        return;
    }

    accountSubmit.disabled = true;
    accountSubmit.textContent = "PATIENTE...";

    try {
        if (signupMode) {
            const { data, error } =
                await supabaseClient.auth.signUp({
                    email,
                    password,
                    options: {
                        emailRedirectTo: window.location.origin
                    }
                });

            if (error) throw error;

            if (data.session) {
                updateAccountUI(data.user);
                showAccountMessage(
                    "Compte créé et connecté !"
                );
            } else {
                showAccountMessage(
                    "Compte créé. Vérifie ta boîte e-mail pour confirmer ton inscription."
                );
            }
        } else {
            const { data, error } =
                await supabaseClient.auth.signInWithPassword({
                    email,
                    password
                });

            if (error) throw error;

            updateAccountUI(data.user);

            showAccountMessage("Connexion réussie !");
        }
    } catch (error) {
        showAccountMessage(
            error.message || "Une erreur est survenue.",
            true
        );
    } finally {
        accountSubmit.disabled = false;
        updateFormMode();
    }
});

accountLogout.addEventListener("click", async () => {
    if (!supabaseClient) return;

    accountLogout.disabled = true;

    try {
        const { error } =
            await supabaseClient.auth.signOut();

        if (error) throw error;

        signupMode = false;
        updateAccountUI(null);
        updateFormMode();

        showAccountMessage("Tu es déconnecté.");

    } catch (error) {
        showAccountMessage(
            error.message || "Erreur de déconnexion.",
            true
        );
    } finally {
        accountLogout.disabled = false;
    }
});

initializeAccount();
const ownerCodeButton = document.getElementById("ownerCodeButton");

ownerCodeButton.addEventListener("click", async () => {
    const code = document.getElementById("ownerCodeInput").value.trim();
    const message = document.getElementById("ownerCodeMessage");

    if (!supabaseClient || !currentUser) {
        message.textContent = "Connecte-toi à ton compte avant.";
        return;
    }

    if (!code) {
        message.textContent = "Entre ton code.";
        return;
    }

    ownerCodeButton.disabled = true;
    ownerCodeButton.textContent = "VÉRIFICATION...";

    try {
        const { data, error } =
            await supabaseClient.auth.getSession();

        if (error) throw error;

        if (!data.session) {
            throw new Error("Session expirée. Reconnecte-toi.");
        }

        const response = await fetch("/api/owner/redeem", {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                Authorization: "Bearer " + data.session.access_token
            },
            body: JSON.stringify({ code })
        });

        const result = await response.json();

        if (!response.ok) {
            throw new Error(result.error || "Code invalide.");
        }

        message.textContent = "OWNER activé avec succès !";
        message.style.color = "#35e69a";

        document.getElementById("ownerCodeInput").value = "";

    } catch (error) {
        message.textContent = error.message;
        message.style.color = "#ff7777";
    } finally {
        ownerCodeButton.disabled = false;
        ownerCodeButton.textContent = "ENVOYER";
    }
});