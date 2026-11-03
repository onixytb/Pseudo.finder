
const express = require("express");
const path = require("path");

const app = express();

app.use(express.json({ limit: "10kb" }));
app.use(express.static(__dirname));

const API_KEY = process.env.SERPAPI_KEY;
const PORT = process.env.PORT || 3000;

const platforms = [
    { name: "Instagram", domain: "instagram.com", type: "instagram" },
    { name: "TikTok", domain: "tiktok.com", type: "tiktok" },
    { name: "YouTube", domain: "youtube.com", type: "youtube" },
    { name: "Twitch", domain: "twitch.tv", type: "twitch" },
    { name: "Reddit", domain: "reddit.com", type: "reddit" },
    { name: "GitHub", domain: "github.com", type: "github" },
    { name: "X / Twitter", domain: "x.com", type: "twitter" },
    { name: "Pinterest", domain: "pinterest.com", type: "pinterest" },
    { name: "Facebook", domain: "facebook.com", type: "facebook" },
    { name: "Roblox", domain: "roblox.com", type: "roblox" },
    { name: "Steam", domain: "steamcommunity.com", type: "steam" }
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

function isProfile(platform, url, pseudo, title) {
    const parts = url.pathname.split("/").filter(Boolean);
    const wanted = normalize(pseudo);

    if (!parts.length) return false;

    switch (platform.type) {
        case "instagram":
            return parts.length === 1 &&
                normalize(parts[0]) === wanted;

        case "tiktok":
            return parts.length === 1 &&
                parts[0].startsWith("@") &&
                normalize(parts[0]) === wanted;

        case "youtube":
            return parts.length === 1 &&
                parts[0].startsWith("@") &&
                normalize(parts[0]) === wanted;

        case "twitch":
            return parts.length === 1 &&
                normalize(parts[0]) === wanted;

        case "reddit":
            return parts.length === 2 &&
                ["user", "u"].includes(parts[0].toLowerCase()) &&
                normalize(parts[1]) === wanted;

        case "github":
            return parts.length === 1 &&
                normalize(parts[0]) === wanted;

        case "twitter":
            return parts.length === 1 &&
                normalize(parts[0]) === wanted;

        case "pinterest":
            return parts.length === 1 &&
                normalize(parts[0]) === wanted;

        case "facebook":
            return parts.length === 1 &&
                normalize(parts[0]) === wanted;

        case "roblox":
            return parts.length === 3 &&
                parts[0] === "users" &&
                parts[2] === "profile" &&
                normalize(title).includes(wanted);

        case "steam":
            return parts.length === 2 &&
                ["id", "profiles"].includes(parts[0]) &&
                (normalize(parts[1]) === wanted ||
                 (parts[0] === "id" && normalize(parts[1]) === wanted));

        default:
            return false;
    }
}

async function searchPlatform(platform, pseudo) {
    const params = new URLSearchParams({
        engine: "google",
        q: `site:${platform.domain} "${pseudo}"`,
        api_key: API_KEY,
        gl: "fr",
        hl: "fr",
        safe: "active",
        num: "20"
    });

    const response = await fetch(
        "https://serpapi.com/search.json?" + params,
        { signal: AbortSignal.timeout(20000) }
    );

    const data = await response.json();

    if (!response.ok || data.error) {
        throw new Error(data.error || "Erreur API");
    }

    const results = (data.organic_results || [])
        .filter(item => {
            try {
                const url = new URL(item.link);

                const validDomain =
                    url.hostname === platform.domain ||
                    url.hostname.endsWith("." + platform.domain) ||
                    (platform.type === "twitter" &&
                     ["twitter.com", "www.twitter.com"].includes(url.hostname));

                return validDomain &&
                    isProfile(platform, url, pseudo, item.title || "");
            } catch {
                return false;
            }
        })
        .map(item => ({
            title: item.title || "Profil sans titre",
            description: item.snippet || "",
            url: item.link,
            possibleMatch: true
        }));

    return {
        name: platform.name,
        domain: platform.domain,
        status: results.length ? "results" : "empty",
        results
    };
}

app.post("/api/search", async (req, res) => {
    try {
        const pseudo = String(req.body.pseudo || "").trim();

        if (!/^[a-zA-Z0-9_.-]{2,50}$/.test(pseudo)) {
            return res.status(400).json({
                error: "Pseudo invalide."
            });
        }

        if (!API_KEY) {
            return res.status(500).json({
                error: "Clé SerpApi manquante."
            });
        }

        const output = new Array(platforms.length);
        let nextIndex = 0;

        async function worker() {
            while (nextIndex < platforms.length) {
                const index = nextIndex++;
                const platform = platforms[index];

                try {
                    output[index] = await searchPlatform(platform, pseudo);
                } catch (error) {
                    console.error(platform.name, error.message);

                    output[index] = {
                        name: platform.name,
                        domain: platform.domain,
                        status: "error",
                        error: error.message,
                        results: []
                    };
                }
            }
        }

        await Promise.all([worker(), worker(), worker()]);

        const totalResults = output.reduce(
            (sum, item) => sum + item.results.length,
            0
        );

        res.json({
            pseudo,
            platforms: output,
            totalResults,
            checked: output.filter(item => item.status !== "error").length,
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
    console.log("PSEUDO.FINDER V5 actif sur le port " + PORT);
});
