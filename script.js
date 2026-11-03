
const home = document.getElementById("home");
const searchPage = document.getElementById("searchPage");

const pseudoChoice = document.getElementById("pseudoChoice");
const generalChoice = document.getElementById("generalChoice");
const backBtn = document.getElementById("backBtn");

const searchInput = document.getElementById("searchInput");
const searchBtn = document.getElementById("searchBtn");
const statusText = document.getElementById("status");
const resultsBox = document.getElementById("results");

let currentMode = "pseudo";

pseudoChoice.addEventListener("click", () => {
    openSearch("pseudo");
});

generalChoice.addEventListener("click", () => {
    openSearch("general");
});

backBtn.addEventListener("click", () => {
    home.classList.remove("hidden");
    searchPage.classList.add("hidden");
    searchInput.value = "";
    resultsBox.innerHTML = "";
    statusText.textContent = "En attente d'une recherche...";
    updateStats(0, 0, 0);
    document.getElementById("progressBar").style.width = "0%";
});

function openSearch(mode) {
    currentMode = mode;

    home.classList.add("hidden");
    searchPage.classList.remove("hidden");

    if (mode === "pseudo") {
        document.getElementById("searchTitle").textContent =
            "Recherche de pseudo";

        document.getElementById("searchDescription").textContent =
            "Recherche des profils et mentions sur les réseaux sociaux.";

        searchInput.placeholder = "Entre un pseudo...";
        document.getElementById("resultsTitle").textContent =
            "RÉSULTATS DES PROFILS";
    } else {
        document.getElementById("searchTitle").textContent =
            "Recherche générale";

        document.getElementById("searchDescription").textContent =
            "Recherche un sujet sur plusieurs plateformes en même temps.";

        searchInput.placeholder = "Ex : Rocket League, actualité...";
        document.getElementById("resultsTitle").textContent =
            "RÉSULTATS DE RECHERCHE";
    }

    searchInput.focus();
}

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
                result.type || (
                    result.possibleMatch
                        ? "Profil possible"
                        : "Résultat à vérifier"
                )
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
