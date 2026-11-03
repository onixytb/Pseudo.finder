
const home = document.getElementById("home");
const searchPage = document.getElementById("searchPage");
const networkPage = document.getElementById("networkPage");

const searchInput = document.getElementById("searchInput");
const searchBtn = document.getElementById("searchBtn");
const statusText = document.getElementById("status");
const resultsBox = document.getElementById("results");

let currentMode = "pseudo";

function showPage(page) {
    home.classList.add("hidden");
    searchPage.classList.add("hidden");
    networkPage.classList.add("hidden");
    page.classList.remove("hidden");
}

document.getElementById("pseudoChoice").addEventListener("click", () => {
    currentMode = "pseudo";
    document.getElementById("searchTitle").textContent =
        "Recherche de pseudo";
    document.getElementById("searchDescription").textContent =
        "Recherche des profils sur les réseaux sociaux.";
    searchInput.placeholder = "Entre un pseudo...";
    showPage(searchPage);
});

document.getElementById("generalChoice").addEventListener("click", () => {
    currentMode = "general";
    document.getElementById("searchTitle").textContent =
        "Recherche générale";
    document.getElementById("searchDescription").textContent =
        "Recherche un sujet sur plusieurs plateformes.";
    searchInput.placeholder = "Ex : Rocket League...";
    showPage(searchPage);
});

document.getElementById("networkChoice").addEventListener("click", () => {
    showPage(networkPage);
});

document.getElementById("backBtn").addEventListener("click", () => {
    showPage(home);
    resultsBox.innerHTML = "";
    searchInput.value = "";
    statusText.textContent = "En attente d'une recherche...";
    updateStats(0, 0, 0);
    document.getElementById("progressBar").style.width = "0%";
});

document.getElementById("networkBackBtn").addEventListener("click", () => {
    showPage(home);
});

searchBtn.addEventListener("click", search);

searchInput.addEventListener("keydown", event => {
    if (event.key === "Enter") search();
});

function updateStats(total, found, checked) {
    document.getElementById("total").textContent = total;
    document.getElementById("found").textContent = found;
    document.getElementById("checked").textContent = checked;
}

function createElement(tag, className, content) {
    const element = document.createElement(tag);
    if (className) element.className = className;
    if (content !== undefined) element.textContent = content;
    return element;
}

async function search() {
    const query = searchInput.value.trim();

    if (query.length < 2) {
        statusText.textContent = "Entre au moins 2 caractères.";
        return;
    }

    searchBtn.disabled = true;
    resultsBox.innerHTML = "";
    updateStats(0, 0, 0);
    document.getElementById("progressBar").style.width = "0%";
    statusText.textContent = "Recherche en cours...";

    try {
        const response = await fetch("/api/search", {
            method: "POST",
            headers: {
                "Content-Type": "application/json"
            },
            body: JSON.stringify({
                query,
                mode: currentMode
            })
        });

        const data = await response.json();

        if (!response.ok) {
            throw new Error(data.error || "Erreur serveur.");
        }

        displayResults(data);

    } catch (error) {
        statusText.textContent = error.message;
    } finally {
        searchBtn.disabled = false;
    }
}

function displayResults(data) {
    resultsBox.innerHTML = "";

    const platforms = data.platforms || [];
    let total = 0;
    let found = 0;
    let checked = 0;

    platforms.forEach(platform => {
        if (platform.status !== "error") checked++;
        total += platform.results.length;

        if (platform.results.length > 0) found++;

        const card = createElement("article", "platform-card");
        const header = createElement("div", "platform-header");
        const name = createElement("strong", "", platform.name);

        let badgeText = "Aucun résultat";
        let badgeClass = "status-empty";

        if (platform.status === "error") {
            badgeText = "Erreur de recherche";
            badgeClass = "status-error";
        } else if (platform.results.length > 0) {
            badgeText = platform.results.length + " résultat(s)";
            badgeClass = "status-found";
        }

        const badge = createElement(
            "span",
            "status-badge " + badgeClass,
            badgeText
        );

        header.append(name, badge);
        card.appendChild(header);

        if (platform.error) {
            card.appendChild(
                createElement("p", "platform-message", platform.error)
            );
        }

        platform.results.forEach(result => {
            const item = createElement("div", "result-item");

            const title = createElement(
                "strong",
                "",
                result.title
            );

            const description = createElement(
                "p",
                "",
                result.description || "Pas de description."
            );

            const match = createElement(
                "small",
                result.possibleMatch ? "match-possible" : "match-unknown",
                result.type || "Résultat à vérifier"
            );

            const link = createElement("a", "", "OUVRIR ↗");
            link.href = result.url;
            link.target = "_blank";
            link.rel = "noopener noreferrer";

            item.append(title, description, match, link);
            card.appendChild(item);
        });

        resultsBox.appendChild(card);
    });

    updateStats(total, found, checked);
    document.getElementById("progressBar").style.width = "100%";

    statusText.textContent =
        `${total} résultat(s) trouvé(s) sur ${checked} plateformes vérifiées.`;
}

// Afficher uniquement ton adresse IP publique.
document.getElementById("ipBtn").addEventListener("click", async () => {
    const button = document.getElementById("ipBtn");
    const output = document.getElementById("ipAddress");

    button.disabled = true;
    output.textContent = "Récupération en cours...";

    try {
        const response = await fetch("https://api.ipify.org?format=json");

        if (!response.ok) {
            throw new Error("Service indisponible.");
        }

        const data = await response.json();

        if (!/^[0-9a-fA-F:.]+$/.test(data.ip || "")) {
            throw new Error("Adresse IP invalide.");
        }

        output.textContent = data.ip;

    } catch (error) {
        output.textContent = "Impossible de récupérer ton IP.";
    } finally {
        button.disabled = false;
    }
});

// Demander à l'utilisateur de choisir un appareil Bluetooth.
document.getElementById("bluetoothBtn").addEventListener("click", async () => {
    const button = document.getElementById("bluetoothBtn");
    const status = document.getElementById("bluetoothStatus");
    const result = document.getElementById("bluetoothResult");

    if (!navigator.bluetooth) {
        status.textContent =
            "Bluetooth Web non disponible dans ce navigateur.";
        return;
    }

    button.disabled = true;
    status.textContent = "Ouverture du sélecteur Bluetooth...";
    result.textContent = "";

    try {
        const device = await navigator.bluetooth.requestDevice({
            acceptAllDevices: true
        });

        status.textContent = "Appareil sélectionné";

        const name = device.name || "Nom non communiqué";
        result.textContent = "Nom : " + name;

    } catch (error) {
        if (error.name === "NotFoundError") {
            status.textContent = "Aucun appareil sélectionné.";
        } else {
            status.textContent =
                "Recherche annulée ou non autorisée.";
        }
    } finally {
        button.disabled = false;
    }
});
