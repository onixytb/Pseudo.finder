
const API_URL = "/api/search";

const pseudoInput = document.getElementById("pseudo");
const button = document.getElementById("searchBtn");
const statusText = document.getElementById("status");
const resultsBox = document.getElementById("results");

button.addEventListener("click", searchPseudo);

pseudoInput.addEventListener("keydown", event => {
    if (event.key === "Enter") searchPseudo();
});

async function searchPseudo() {
    const pseudo = pseudoInput.value.trim();

    if (!pseudo) {
        statusText.textContent = "Entre un pseudo.";
        return;
    }

    if (pseudo.length < 2) {
        statusText.textContent = "Pseudo trop court.";
        return;
    }

    button.disabled = true;
    resultsBox.innerHTML = "";
    statusText.textContent = "Recherche sur Internet...";
    document.getElementById("progressBar").style.width = "30%";

    try {
        const response = await fetch(API_URL, {
            method: "POST",
            headers: {
                "Content-Type": "application/json"
            },
            body: JSON.stringify({ pseudo })
        });

        const data = await response.json();

        if (!response.ok) {
            throw new Error(data.error || "Erreur serveur");
        }

        displayResults(data.results || []);

    } catch (error) {
        statusText.textContent = "Erreur : " + error.message;
    } finally {
        button.disabled = false;
        document.getElementById("progressBar").style.width = "100%";
    }
}

function displayResults(results) {
    resultsBox.innerHTML = "";

    const found = results.length;

    document.getElementById("total").textContent = found;
    document.getElementById("found").textContent = found;
    document.getElementById("checked").textContent = "11";

    statusText.textContent =
        found + " résultat(s) public(s) récupéré(s).";

    if (found === 0) {
        resultsBox.textContent =
            "Aucun résultat public trouvé.";
        return;
    }

    results.forEach(result => {
        const card = document.createElement("article");
        card.className = "result";

        const title = document.createElement("strong");
        title.textContent = result.title || "Page sans titre";

        const description = document.createElement("p");
        description.textContent =
            result.description || "Aucune description disponible.";

        const link = document.createElement("a");
        link.href = result.url;
        link.target = "_blank";
        link.rel = "noopener noreferrer";
        link.textContent = "OUVRIR LA PAGE ↗";

        card.append(title, description, link);
        resultsBox.appendChild(card);
    });
}
