
const express = require("express");
const path = require("path");

const app = express();

app.use(express.json({ limit: "10kb" }));
app.use(express.static(__dirname));

const API_KEY = process.env.SERPAPI_KEY;
const PORT = process.env.PORT || 3000;

const platforms = [
    { name: "Instagram", domain: "instagram.com" },
    { name: "TikTok", domain: "tiktok.com" },
    { name: "YouTube", domain: "youtube.com" },
    { name: "Twitch", domain: "twitch.tv" },
    { name: "Reddit", domain: "reddit.com" },
    { name: "GitHub", domain: "github.com" },
    { name: "X / Twitter", domain: "x.com" },
    { name: "Pinterest", domain: "pinterest.com" },
    { name: "Facebook", domain: "facebook.com" },
    { name: "Roblox", domain: "roblox.com" },
    { name: "Steam", domain: "steamcommunity.com" }
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

function looksLikeProfile(platform, url, pseudo) {
    const parts = url.pathname.split("/").filter(Boolean);
    const wanted = normalize(pseudo);

    if (!parts.length) return false;

    const first = normalize(parts[0]);

    const blocked = [
        "search", "explore", "videos", "video",
        "reels", "reel", "p", "posts", "watch",
        "shorts", "feed", "hashtag", "tags"
    ];

    if (blocked.includes(first)) return false;

    switch (platform) {
        case "Instagram":
        case "Twitch":
        case "GitHub":
        case "X / Twitter":
        case "Pinterest":
        case "Facebook":
            return parts.length === 1;

        case "TikTok":
            return parts[0].startsWith("@");

        case "YouTube":
            return (
                parts[0].startsWith("@") ||
                ["channel", "user", "c"].includes(first)
            );

        case "Reddit":
            return parts.length >= 2 &&
                ["user", "u"].includes(first);

        case "Roblox":
            return parts.length >= 3 &&
                first === "users" &&
                parts[2] === "profile";

        case "Steam":
            return ["id", "profiles"].includes(first);

        default:
            return false;
    }
}

async function searchPlatform(platform, pseudo) {
    const params = new URLSearchParams({
        engine: "google",
        q: `site:${platform.domain} ${pseudo}`,
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

    const rawResults = data.organic_results || [];

    console.log(
        platform.name,
        "Résultats Google :",
        rawResults.length
    );

    const results = rawResults
        .filter(item => {
            try {
                const url = new URL(item.link);

                const validDomain =
                    url.hostname === platform.domain ||
                    url.hostname.endsWith("." + platform.domain);

                return validDomain;
            } catch {
                return false;
            }
        })
        .map(item => {
            const url = new URL(item.link);

            const profile = looksLikeProfile(
                platform.name,
                url,
                pseudo
            );

            return {
                title: item.title || "Page trouvée",
                description: item.snippet || "",
                url: item.link,
                possibleMatch: profile,
                type: profile
                    ? "Profil possible"
                    : "Mention ou publication"
            };
        });

    console.log(
        platform.name,
        "Résultats conservés :",
        results.length
    );

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
                    output[index] = await searchPlatform(
                        platform,
                        pseudo
                    );
                } catch (error) {
                    console.error(
                        platform.name,
                        error.message
                    );

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

        await Promise.all([
            worker(),
            worker(),
            worker()
        ]);

        const totalResults = output.reduce(
            (sum, item) => sum + item.results.length,
            0
        );

        res.json({
            pseudo,
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
    console.log(
        "PSEUDO.FINDER V7 actif sur le port " + PORT
    );
});
