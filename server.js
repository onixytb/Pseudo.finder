
const express = require("express");
const path = require("path");

const app = express();

app.use(express.json({ limit: "10kb" }));
app.use(express.static(__dirname));

const API_KEY = process.env.SERPAPI_KEY;
const PORT = process.env.PORT || 3000;

const platforms = [
    { name: "YouTube", domain: "youtube.com" },
    { name: "Reddit", domain: "reddit.com" },
    { name: "X / Twitter", domain: "x.com" },
    { name: "TikTok", domain: "tiktok.com" },
    { name: "Instagram", domain: "instagram.com" },
    { name: "Facebook", domain: "facebook.com" },
    { name: "Pinterest", domain: "pinterest.com" },
    { name: "Twitch", domain: "twitch.tv" },
    { name: "GitHub", domain: "github.com" },
    { name: "Steam", domain: "steamcommunity.com" },
    { name: "Roblox", domain: "roblox.com" }
];

app.get("/", (req, res) => {
    res.sendFile(path.join(__dirname, "index.html"));
});

function normalize(value) {
    return String(value || "")
        .toLowerCase()
        .replace(/^@/, "")
        .replace(/[^a-z0-9]/g, "");
}


function isProfile(platform, url, pseudo) {
    const parts = url.pathname.split("/").filter(Boolean);
    const wanted = normalize(pseudo);

    if (!parts.length) return false;

    const first = normalize(parts[0]);
    const second = normalize(parts[1] || "");

    switch (platform) {
        case "YouTube":
            if (parts.length === 1) {
                return first === wanted;
            }

            if (
                parts.length === 2 &&
                ["@", "c", "user"].some(prefix =>
                    parts[0].toLowerCase().startsWith(prefix)
                )
            ) {
                return second === wanted;
            }

            return false;

        case "Instagram":
        case "Twitch":
        case "GitHub":
        case "X / Twitter":
        case "Pinterest":
        case "Facebook":
            return parts.length === 1 && first === wanted;

        case "TikTok":
            return parts.length === 1 &&
                parts[0].startsWith("@") &&
                first === wanted;

        case "Reddit":
            return parts.length === 2 &&
                ["user", "u"].includes(parts[0].toLowerCase()) &&
                second === wanted;

        case "Steam":
            return parts.length === 2 &&
                parts[0] === "id" &&
                second === wanted;

        default:
            return false;
    }
}

async function searchGoogle(query, domain = null) {
    const searchQuery = domain
        ? `site:${domain} ${query}`
        : query;

    const params = new URLSearchParams({
        engine: "google",
        q: searchQuery,
        api_key: API_KEY,
        gl: "fr",
        hl: "fr",
        safe: "active",
        num: "20"
    });

    const response = await fetch(
        "https://serpapi.com/search.json?" + params,
        { signal: AbortSignal.timeout(25000) }
    );

    const data = await response.json();

    if (!response.ok || data.error) {
        throw new Error(data.error || "Erreur SerpApi");
    }

    return data.organic_results || [];
}

async function searchPlatform(platform, query, mode) {
    const rawResults = await searchGoogle(
        query,
        platform.domain
    );

    const results = rawResults
        .filter(item => {
            try {
                const url = new URL(item.link);

                const validDomain =
                    url.hostname === platform.domain ||
                    url.hostname.endsWith("." + platform.domain);

                if (!validDomain) return false;

                // En mode pseudo, on garde uniquement
                // les URL correspondant à un profil possible.
                if (mode === "pseudo") {
                    return isProfile(
                        platform.name,
                        url,
                        query
                    );
                }

                return true;

            } catch {
                return false;
            }
        })
        .map(item => ({
            title: item.title || "Page sans titre",
            description: item.snippet || "",
            url: item.link,
            possibleMatch: mode === "pseudo",
            type: mode === "pseudo"
                ? "Profil possible à vérifier"
                : "Résultat public"
        }));

    console.log(
        platform.name,
        "Résultats reçus :",
        rawResults.length,
        "| Résultats conservés :",
        results.length
    );

    return {
        name: platform.name,
        status: results.length ? "results" : "empty",
        results
    };
}

async function searchGeneralGoogle(query) {
    const rawResults = await searchGoogle(query);

    const results = rawResults
        .filter(item => {
            try {
                const url = new URL(item.link);
                return ["http:", "https:"].includes(url.protocol);
            } catch {
                return false;
            }
        })
        .map(item => ({
            title: item.title || "Page sans titre",
            description: item.snippet || "",
            url: item.link,
            possibleMatch: false,
            type: "Résultat Google"
        }));

    return {
        name: "Google",
        status: results.length ? "results" : "empty",
        results
    };
}

app.post("/api/search", async (req, res) => {
    try {
        const query = String(req.body.query || "").trim();
        const mode = req.body.mode;

        if (query.length < 2 || query.length > 150) {
            return res.status(400).json({
                error: "Recherche invalide."
            });
        }

        if (!["pseudo", "general"].includes(mode)) {
            return res.status(400).json({
                error: "Mode de recherche invalide."
            });
        }

        if (
            mode === "pseudo" &&
            !/^[a-zA-Z0-9_.@-]{2,50}$/.test(query)
        ) {
            return res.status(400).json({
                error: "Pseudo invalide."
            });
        }

        if (!API_KEY) {
            return res.status(500).json({
                error: "Clé SERPAPI_KEY manquante sur Render."
            });
        }

        const tasks = mode === "general"
            ? [
                () => searchGeneralGoogle(query),
                ...platforms.map(platform => () =>
                    searchPlatform(platform, query, mode)
                )
            ]
            : platforms.map(platform => () =>
                searchPlatform(platform, query, mode)
            );

        const output = new Array(tasks.length);
        let nextIndex = 0;

        async function worker() {
            while (nextIndex < tasks.length) {
                const index = nextIndex++;

                try {
                    output[index] = await tasks[index]();
                } catch (error) {
                    console.error(
                        "Recherche",
                        index,
                        error.message
                    );

                    output[index] = {
                        name: mode === "general" && index === 0
                            ? "Google"
                            : mode === "general"
                                ? platforms[index - 1].name
                                : platforms[index].name,
                        status: "error",
                        error: error.message,
                        results: []
                    };
                }
            }
        }

        await Promise.all([
            worker(),
            worker(),
            worker(),
            worker()
        ]);

        const totalResults = output.reduce(
            (sum, item) => sum + item.results.length,
            0
        );

        res.json({
            query,
            mode,
            platforms: output,
            totalResults,
            checked: output.filter(
                item => item.status !== "error"
            ).length,
            foundPlatforms: output.filter(
                item => item.results.length > 0
            ).length
        });

    } catch (error) {
        console.error(error);

        res.status(500).json({
            error: "Erreur serveur."
        });
    }
});

app.listen(PORT, () => {
    console.log("PSEUDO.FINDER V9 actif sur le port " + PORT);
});
