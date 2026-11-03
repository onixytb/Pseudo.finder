
const pseudoInput = document.getElementById("pseudo");
const button = document.getElementById("searchBtn");
const statusText = document.getElementById("status");
const resultsBox = document.getElementById("results");

button.addEventListener("click", searchPseudo);

pseudoInput.addEventListener("keydown", event => {
    if (event.key === "Enter") searchPseudo();
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

async function searchPseudo() {
    const pseudo = pseudoInput.value.trim();

    if (!/^[a-zA-Z0-9_.-]{2,50}$/.test(pseudo)) {
        statusText.textContent = "Pseudo invalide.";
        return;
    }

    button.disabled = true;
    resultsBox.innerHTML = "";

    updateStats(0, 0, 0);

    document.getElementById("progressBar").style.width = "0%";

    statusText.textContent =
        "Recherche sur 11 plateformes...";

    try {
        const response = await fetch("/api/search", {
            method: "POST",
            headers: {
                "Content-Type": "application/json"
            },
            body: JSON.stringify({ pseudo })
        });

        const data = await response.json();

        if (!response.ok) {
            throw new Error(data.error || "Erreur serveur.");
        }

        displayResults(data);

    } catch (error) {
        statusText.textContent = error.message;
        updateStats(0, 0, 0);

    } finally {
        button.disabled = false;
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

        const name = createElement(
            "strong",
            "",
            platform.name
        );

        let badgeText = "Aucun résultat indexé";
        let badgeClass = "status-empty";

        if (platform.status === "error") {
            badgeText = "Erreur de recherche";
            badgeClass = "status-error";
        } else if (platform.status === "results") {
            badgeText = "Résultats à vérifier";
            badgeClass = "status-found";
        }

        const badge = createElement(
            "span",
            "status-badge " + badgeClass,
            badgeText
        );

        header.append(name, badge);
        card.appendChild(header);

        if (platform.status === "error") {
            card.appendChild(
                createElement(
                    "p",
                    "platform-message",
                    platform.error || "Recherche impossible."
                )
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
                result.possibleMatch
                    ? "Pseudo repéré dans la page"
                    : "Correspondance à vérifier"
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
        `${total} page(s) trouvée(s) sur ${checked} plateformes vérifiées.`;
}
