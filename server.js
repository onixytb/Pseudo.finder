
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

async function searchPlatform(platform, pseudo) {
    const params = new URLSearchParams({
        engine: "google",
        q: `site:${platform.domain} "${pseudo}"`,
        api_key: API_KEY,
        gl: "fr",
        hl: "fr",
        safe: "active",
        num: "10"
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

                return (
                    ["https:", "http:"].includes(url.protocol) &&
                    (
                        url.hostname === platform.domain ||
                        url.hostname.endsWith("." + platform.domain)
                    )
                );
            } catch {
                return false;
            }
        })
        .map(item => {
            const url = new URL(item.link);

            const searchableText = [
                url.pathname,
                item.title,
                item.snippet
            ].join(" ");

            const possibleMatch =
                normalize(searchableText).includes(normalize(pseudo));

            return {
                title: item.title || "Page sans titre",
                description: item.snippet || "",
                url: item.link,
                possibleMatch
            };
        });

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

        // Trois recherches simultanées maximum
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
                        platform.name + ":",
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
            checked: output.length,
            foundPlatforms: output.filter(
                item => item.status === "results"
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
    console.log("PSEUDO.FINDER V4 actif sur le port " + PORT);
});
