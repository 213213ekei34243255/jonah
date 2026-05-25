require("dotenv").config();

const express = require("express");
const axios = require("axios");
const cors = require("cors");

const app = express();
app.use(cors());

/* =========================
   🔒 TRUSTED DOMAINS
========================= */
const trustedDomains = [
    "google.com", "youtube.com", "instagram.com",
    "facebook.com", "twitter.com", "x.com",
    "discord.com", "amazon.com", "wikipedia.org",
    "linkedin.com", "github.com", "microsoft.com",
    "apple.com", "netflix.com", "web.whatsapp.com",
    "chatgpt.com", "cogniaistudios.com",
    "bing.com", "grok.com", "snapchat.com",
    "tiktok.com", "cloudflare.com"
];

function isTrusted(domain) {
    return trustedDomains.some(d => domain.includes(d));
}

/* =========================
   🧠 BRAND EXTRACTION
========================= */
function getBrand(domain) {
    return domain
        .replace("www.", "")
        .split(".")[0]
        .replace(/[-_]/g, " ")
        .toLowerCase();
}

/* =========================
   ⏱ SLEEP HELPER
========================= */
function sleep(ms) {
    return new Promise(r => setTimeout(r, ms));
}

/* =========================
   🔥 REDDIT FETCH
========================= */
const userAgents = [
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/123.0.0.0 Safari/537.36",
    "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36",
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:124.0) Gecko/20100101 Firefox/124.0",
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 14_4) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4 Safari/605.1.15"
];

function randomUA() {
    return userAgents[Math.floor(Math.random() * userAgents.length)];
}

async function fetchRedditAPI(query, retries = 3) {
    for (let attempt = 1; attempt <= retries; attempt++) {
        try {
            const url = `https://www.reddit.com/search.json?q=${encodeURIComponent(query)}&limit=10&sort=relevance`;

            const res = await axios.get(url, {
                headers: {
                    "User-Agent": randomUA(),
                    "Accept": "application/json, text/plain, */*",
                    "Accept-Language": "en-US,en;q=0.9",
                    "Accept-Encoding": "gzip, deflate, br",
                    "Connection": "keep-alive",
                    "Cache-Control": "no-cache",
                    "Pragma": "no-cache",
                    "Sec-Fetch-Dest": "empty",
                    "Sec-Fetch-Mode": "cors",
                    "Sec-Fetch-Site": "same-origin"
                },
                timeout: 8000
            });

            return res.data.data.children || [];

        } catch (e) {
            const status = e.response?.status;
            console.log(`Reddit attempt ${attempt} failed: ${status}`);

            if (status === 429) {
                const wait = Math.pow(2, attempt) * 3000; // 6s, 12s, 24s
                console.log(`Rate limited. Waiting ${wait}ms...`);
                await sleep(wait);
            } else {
                break; // Don't retry on non-429 errors
            }
        }
    }

    return [];
}

/* =========================
   🔍 GOOGLE FALLBACK
========================= */
async function fetchViaGoogle(query) {
    try {
        const url = `https://www.google.com/search?q=${encodeURIComponent(query + " reddit")}`;

        const res = await axios.get(url, {
            headers: {
                "User-Agent": randomUA(),
                "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
                "Accept-Language": "en-US,en;q=0.9"
            },
            timeout: 8000
        });

        const links = [...res.data.matchAll(/https:\/\/www\.reddit\.com\/r\/[^"&]+/g)]
            .map(m => m[0]);

        return links.slice(0, 5);
    } catch {
        return [];
    }
}

/* =========================
   🤖 GEMINI CLASSIFIER
========================= */
async function classifyWithGemini(texts) {
    try {
        const apiKey = process.env.GEMINI_API_KEY;

        const prompt = `
Classify each text into ONE of:
SCAM, COMPLAINT, POSITIVE, IRRELEVANT

Return ONLY a JSON array with no explanation, no markdown, no backticks.

Texts:
${texts.map((t, i) => `${i + 1}. ${t}`).join("\n")}
`;

        const res = await axios.post(
            `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${apiKey}`,
            {
                contents: [{ parts: [{ text: prompt }] }]
            },
            { timeout: 15000 }
        );

        const output = res.data.candidates?.[0]?.content?.parts?.[0]?.text;

        const match = output?.match(/\[.*?\]/s);
        if (!match) return null;

        return JSON.parse(match[0]);

    } catch (err) {
        console.log("Gemini failed:", err.message);
        return null;
    }
}

/* =========================
   🚀 TRUST API
========================= */
app.get("/trust", async (req, res) => {
    const domain = req.query.domain;

    if (!domain) {
        return res.status(400).json({ error: "Missing domain parameter" });
    }

    const brand = getBrand(domain);

    try {
        /* ✅ TRUSTED SHORTCUT */
        if (isTrusted(domain)) {
            return res.json({
                score: 85,
                community: 85,
                security: "Trusted platform",
                issues: ["Widely recognized service"]
            });
        }

        /* 🔍 REDDIT QUERIES — keep to 2 to avoid rate limits */
        const queries = [
            `${brand} scam OR fraud`,
            `${brand} review legit`
        ];

        let posts = [];

        for (let q of queries) {
            const data = await fetchRedditAPI(q);
            posts.push(...data);
            // 4–6s between queries to avoid triggering rate limits
            await sleep(4000 + Math.random() * 2000);
        }

        /* 🔄 GOOGLE FALLBACK if Reddit returned nothing */
        if (posts.length === 0) {
            console.log("Reddit empty, trying Google fallback...");
            let links = [];

            for (let q of queries) {
                const l = await fetchViaGoogle(q);
                links.push(...l);
            }

            posts = links.map(link => ({
                data: { title: link, selftext: "" }
            }));
        }

        /* 🚫 No data at all */
        if (posts.length === 0) {
            return res.json({
                score: 65,
                community: 65,
                security: "No data found",
                issues: ["No community discussions found for this site"]
            });
        }

        /* =========================
           🤖 AI CLASSIFICATION
        ========================= */
        const texts = posts
            .map(p => (p.data.title + " " + p.data.selftext).toLowerCase())
            .filter(t => t.includes(brand))
            .slice(0, 10);

        let scamCount = 0;
        let complaintCount = 0;
        let positiveCount = 0;
        let issues = [];

        if (texts.length > 0) {
            const classifications = await classifyWithGemini(texts);

            if (classifications) {
                classifications.forEach(label => {
                    if (label === "SCAM") {
                        scamCount++;
                        issues.push("Users report scam behavior");
                    } else if (label === "COMPLAINT") {
                        complaintCount++;
                    } else if (label === "POSITIVE") {
                        positiveCount++;
                    }
                });
            } else {
                /* 🔁 KEYWORD FALLBACK if Gemini fails */
                texts.forEach(text => {
                    if (text.includes("scam") || text.includes("fraud") || text.includes("fake")) {
                        scamCount++;
                        issues.push("Users report scam behavior");
                    } else if (text.includes("problem") || text.includes("refund") || text.includes("complaint")) {
                        complaintCount++;
                    } else if (text.includes("good") || text.includes("trusted") || text.includes("legit")) {
                        positiveCount++;
                    }
                });
            }
        }

        /* =========================
           📊 SCORING
        ========================= */
        let score = 50;

        score -= scamCount * 15;
        score -= complaintCount * 3;
        score += positiveCount * 6;

        score = Math.max(0, Math.min(100, score));

        /* =========================
           📌 SUMMARY
        ========================= */
        let summary = "Mixed feedback";

        if (scamCount >= 3) {
            summary = "⚠️ High scam reports detected";
        } else if (scamCount >= 1 && complaintCount >= 2) {
            summary = "⚠️ Some scam reports and complaints";
        } else if (complaintCount > positiveCount) {
            summary = "Frequent complaints from users";
        } else if (positiveCount > scamCount + complaintCount) {
            summary = "Mostly positive reputation";
        }

        res.json({
            score,
            community: score,
            security: summary,
            issues: issues.length ? [...new Set(issues)] : [summary],
            breakdown: {
                scamCount,
                complaintCount,
                positiveCount,
                postsAnalyzed: texts.length
            }
        });

    } catch (err) {
        console.error("Trust API error:", err.message);
        res.json({
            score: 50,
            community: 50,
            security: "System error",
            issues: ["Internal failure"]
        });
    }
});

/* =========================
   🚀 START SERVER
========================= */
const PORT = process.env.PORT || 3000;

app.listen(PORT, () => {
    console.log(`✅ Trust API running on port ${PORT}`);
});
