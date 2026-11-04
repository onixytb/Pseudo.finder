
const $ = id => document.getElementById(id);

const home = $("home");
const workspace = $("workspace");

const tools = {
    pseudo: {
        title: "PSEUDO.FINDER",
        description: "Recherche des profils publics sur plusieurs plateformes.",
        form: "searchForm",
        mode: "pseudo"
    },
    general: {
        title: "GENERAL SEARCH",
        description: "Recherche un sujet sur plusieurs plateformes.",
        form: "searchForm",
        mode: "general"
    },
    osint: {
        title: "OSINT.FINDER",
        description: "Recherche des sources publiques et professionnelles.",
        form: "searchForm",
        mode: "osint"
    },
    network: {
        title: "NETWORK.FINDER",
        description: "Informations sur ta connexion et Bluetooth.",
        form: "bluetoothPanel"
    },
    domain: {
        title: "DOMAIN.FINDER",
        description: "Consulte les informations DNS publiques d'un domaine.",
        form: "domainForm"
    },
    ip: {
        title: "IP.LOOKUP",
        description: "Consulte l'adresse IP publique de ta connexion.",
        form: "ipPanel"
    },
    url: {
        title: "URL.ANALYZER",
        description: "Examine un lien sans ouvrir le site.",
        form: "urlForm"
    },
    history: {
        title: "HISTORY",
        description: "Tes dernières recherches enregistrées sur cet appareil.",
        form: "historyPanel"
    }
};

let currentTool = null;

let history = [];

try {
    history = JSON.parse(localStorage.getItem("pf_history") || "[]");

    if (!Array.isArray(history)) {
        history = [];
    }
} catch {
    history = [];
}

document.querySelectorAll("[data-page]").forEach(button => {
    button.addEventListener("click", () => {
        openTool(button.dataset.page);
    });
});

$("logoHome").addEventListener("click", event => {
    event.preventDefault();
    goHome();
});

$("back").addEventListener("click", goHome);

function openTool(name) {
    const tool = tools[name];

    if (!tool) return;

    currentTool = name;

    home.classList.add("hidden");
    workspace.classList.remove("hidden");

    $("pageTitle").textContent = tool.title;
    $("pageDescription").textContent = tool.description;

    [
        "searchForm",
        "domainForm",
        "urlForm",
        "ipPanel",
        "bluetoothPanel",
        "historyPanel",
        "output"
    ].forEach(id => {
        $(id).classList.add("hidden");
    });

    $(tool.form).classList.remove("hidden");

    if (name === "pseudo") {
        $("query").placeholder = "Entre un pseudo...";
        $("nameFields").classList.add("hidden");
        $("query").classList.remove("hidden");
    }

    if (name === "general") {
        $("query").placeholder = "Ex : Rocket League...";
        $("nameFields").classList.add("hidden");
        $("query").classList.remove("hidden");
    }

    if (name === "osint") {
        $("nameFields").classList.remove("hidden");
        $("query").classList.add("hidden");
    }

    if ([
        "pseudo",
        "general",
        "osint",
        "domain",
        "url"
    ].includes(name)) {
        $("output").classList.remove("hidden");
        $("results").innerHTML = "";
        $("status").textContent = "";
    }

    if (name === "history") {
        displayHistory();
    }
}

function goHome() {
    workspace.classList.add("hidden");
    home.classList.remove("hidden");
    currentTool = null;
}

function saveHistory(type, value, count) {
    history.unshift({
        type,
        value,
        count,
        date: new Date().toLocaleString("fr-FR")
    });

    history = history.slice(0, 40);

    localStorage.setItem(
        "pf_history",
        JSON.stringify(history)
    );
}

function displayHistory() {
    const list = $("historyList");

    list.innerHTML = "";

    if (!history.length) {
        list.textContent = "Aucune recherche enregistrée.";
        return;
    }

    history.forEach(item => {
        const row = document.createElement("div");
        row.className = "history-item";

        const info = document.createElement("div");

        const name = document.createElement("strong");
        name.textContent = item.type + " : " + item.value;

        const date = document.createElement("small");
        date.textContent = item.date;

        info.append(
            name,
            document.createElement("br"),
            date
        );

        const count = document.createElement("span");
        count.textContent = item.count + " résultats";

        row.append(info, count);
        list.appendChild(row);
    });
}

$("clearHistory").addEventListener("click", () => {
    if (!confirm("Effacer tout l'historique ?")) return;

    history = [];

    localStorage.removeItem("pf_history");

    displayHistory();
});

// RECHERCHES

$("runSearch").addEventListener("click", runSearch);

async function runSearch() {
    if (!currentTool) return;

    const mode = tools[currentTool].mode;

    const body = { mode };

    if (mode === "osint") {
        body.first = $("firstName").value.trim();
        body.last = $("lastName").value.trim();

        if (!body.first || !body.last) {
            $("status").textContent = "Entre un nom et un prénom.";
            return;
        }
    } else {
        body.query = $("query").value.trim();

        if (body.query.length < 2) {
            $("status").textContent = "Recherche trop courte.";
            return;
        }
    }

    const button = $("runSearch");

    button.disabled = true;
    button.textContent = "RECHERCHE EN COURS...";

    $("results").innerHTML = "";
    $("status").textContent = "Connexion au moteur de recherche...";

    try {
        const endpoint = mode === "osint"
            ? "/api/osint"
            : "/api/search";

        const response = await fetch(endpoint, {
            method: "POST",
            headers: {
                "Content-Type": "application/json"
            },
            body: JSON.stringify(body)
        });

        const data = await response.json();

        if (!response.ok) {
            throw new Error(data.error || "Erreur de recherche.");
        }

        let groups;

        if (mode === "osint") {
            groups = data.groups || [];
        } else {
            groups = (data.platforms || []).map(platform => ({
                category: platform.name,
                results: platform.results || [],
                error: platform.error
            }));
        }

        displayGroups(groups);

        const count = groups.reduce(
            (sum, group) => sum + (group.results || []).length,
            0
        );

        const value = mode === "osint"
            ? body.first + " " + body.last
            : body.query;

        $("status").textContent =
            count + " résultat(s) trouvé(s).";

        saveHistory(currentTool, value, count);

    } catch (error) {
        $("status").textContent = error.message;
    } finally {
        button.disabled = false;
        button.textContent = "LANCER LA RECHERCHE ↗";
    }
}

function displayGroups(groups) {
    $("results").innerHTML = "";

    groups.forEach(group => {
        const card = document.createElement("article");
        card.className = "result-card";

        const heading = document.createElement("h3");

        heading.textContent =
            group.category || group.name || "Résultats";

        card.appendChild(heading);

        if (group.error) {
            const error = document.createElement("p");
            error.textContent = group.error;
            card.appendChild(error);
        }

        (group.results || []).forEach(item => {
            const title = document.createElement("h3");
            title.textContent = item.title || "Résultat sans titre";

            const description = document.createElement("p");
            description.textContent = item.description || "";

            card.append(title, description);

            if (item.url) {
                const link = document.createElement("a");

                link.textContent = "OUVRIR LA SOURCE ↗";
                link.href = item.url;
                link.target = "_blank";
                link.rel = "noopener noreferrer";

                card.appendChild(link);
            }
        });

        if (
            (!group.results || !group.results.length) &&
            !group.error
        ) {
            const empty = document.createElement("p");
            empty.textContent = "Aucun résultat trouvé.";
            card.appendChild(empty);
        }

        $("results").appendChild(card);
    });
}

// DOMAIN.FINDER

$("domainBtn").addEventListener("click", async () => {
    const domain = $("domainInput").value.trim();
    const button = $("domainBtn");

    if (!domain) {
        $("status").textContent = "Entre un nom de domaine.";
        return;
    }

    button.disabled = true;
    $("results").innerHTML = "";
    $("status").textContent = "Analyse DNS en cours...";

    try {
        const response = await fetch("/api/domain", {
            method: "POST",
            headers: {
                "Content-Type": "application/json"
            },
            body: JSON.stringify({ domain })
        });

        const data = await response.json();

        if (!response.ok) {
            throw new Error(data.error || "Erreur DNS.");
        }

        displayGroups(data.groups || []);

        $("status").textContent = "Analyse terminée.";

        saveHistory(
            "DOMAIN.FINDER",
            data.domain || domain,
            (data.groups || []).length
        );

    } catch (error) {
        $("status").textContent = error.message;
    } finally {
        button.disabled = false;
    }
});

// IP.LOOKUP

$("ipBtn").addEventListener("click", async () => {
    const button = $("ipBtn");

    button.disabled = true;
    $("myIP").textContent = "Chargement...";

    try {
        const response = await fetch(
            "https://api.ipify.org?format=json"
        );

        if (!response.ok) {
            throw new Error("Service indisponible.");
        }

        const data = await response.json();

        $("myIP").textContent = data.ip;

        saveHistory("IP.LOOKUP", "Mon IP publique", 1);

    } catch {
        $("myIP").textContent =
            "Impossible de récupérer l'IP.";
    } finally {
        button.disabled = false;
    }
});

// NETWORK.FINDER

$("bluetoothBtn").addEventListener("click", async () => {
    const output = $("bluetoothResult");

    if (!navigator.bluetooth) {
        output.textContent =
            "Bluetooth Web non disponible sur ce navigateur.";
        return;
    }

    $("bluetoothBtn").disabled = true;

    try {
        const device = await navigator.bluetooth.requestDevice({
            acceptAllDevices: true
        });

        output.textContent =
            "Appareil sélectionné : " +
            (device.name || "Nom non communiqué");

        saveHistory(
            "NETWORK.FINDER",
            "Appareil Bluetooth sélectionné",
            1
        );

    } catch {
        output.textContent =
            "Sélection annulée ou indisponible.";
    } finally {
        $("bluetoothBtn").disabled = false;
    }
});

// URL.ANALYZER

$("urlBtn").addEventListener("click", () => {
    const raw = $("urlInput").value.trim();

    $("results").innerHTML = "";

    try {
        const url = new URL(raw);

        if (!["http:", "https:"].includes(url.protocol)) {
            throw new Error("Protocole non accepté.");
        }

        const host = url.hostname.toLowerCase();
        const warnings = [];

        if (url.protocol !== "https:") {
            warnings.push("Le lien n'utilise pas HTTPS.");
        }

        if (
            host.startsWith("xn--") ||
            host.includes(".xn--")
        ) {
            warnings.push(
                "Le domaine contient des caractères internationalisés."
            );
        }

        if (/^\d{1,3}(\.\d{1,3}){3}$/.test(host)) {
            warnings.push(
                "Le lien utilise une adresse IP comme domaine."
            );
        }

        if (url.username || url.password) {
            warnings.push(
                "Le lien contient des identifiants intégrés."
            );
        }

        if (host.length > 60) {
            warnings.push(
                "Le nom de domaine est particulièrement long."
            );
        }

        const card = document.createElement("article");
        card.className = "result-card";

        const heading = document.createElement("h3");
        heading.textContent = "RÉSULTAT DE L'ANALYSE";

        const domain = document.createElement("p");
        domain.textContent = "Domaine : " + host;

        const protocol = document.createElement("p");
        protocol.textContent = "Protocole : " + url.protocol;

        const result = document.createElement("p");

        result.textContent = warnings.length
            ? warnings.join(" ")
            : "Aucun indicateur simple détecté.";

        const note = document.createElement("p");

        note.textContent =
            "Cette analyse locale ne garantit pas que le site est sûr.";

        card.append(
            heading,
            domain,
            protocol,
            result,
            note
        );

        $("results").appendChild(card);

        $("status").textContent =
            warnings.length + " indicateur(s) détecté(s).";

        saveHistory("URL.ANALYZER", host, warnings.length);

    } catch {
        $("status").textContent =
            "URL invalide. Vérifie le lien.";
    }
});
