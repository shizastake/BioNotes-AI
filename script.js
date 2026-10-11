/* =====================================================================
   BioNotes AI — script.js
   Handles: dataset loading (from data.json, with an embedded fallback),
   search/filter logic, dropdown + category pill building, note
   rendering, font switching, and PDF export via html2pdf.js.
   Requires: index.html (DOM structure), styles.css (visual styles),
   data.json (70-topic biology dataset), data-embedded.js (fallback copy).
   NOTE: fetch('data.json') works when this project is served through a
   local server. If opened directly via file:// (double-clicking
   index.html), Chrome blocks that fetch for security (CORS) — in that
   case loadBiologyDataset() automatically falls back to the embedded
   copy in data-embedded.js so the app still shows all the data.
========================================================================= */

        /* =================================================================
           SECTION 1: DATASET LOADING (external data.json + fallback)
           The 70-topic biology dataset lives in data.json and is loaded
           here via fetch() at startup. If that fetch fails for any
           reason (most commonly: the page was opened via file:// and
           the browser blocked the request), we fall back to the copy
           embedded in data-embedded.js (loaded earlier via a normal
           <script> tag, which is NOT subject to the same restriction).
           biologyTopics starts empty and is populated once loading
           resolves; initApp() (Section 13) waits for this before wiring
           up the rest of the UI.
        ================================================================= */
        let biologyTopics = [];

        async function loadBiologyDataset() {
            // 1st attempt: fetch the standalone data.json file
            try {
                const response = await fetch('data.json');
                if (!response.ok) throw new Error('HTTP ' + response.status);
                const data = await response.json();
                biologyTopics = data.topics || [];
                return;
            } catch (err) {
                console.warn('fetch("data.json") failed (likely opened via file://). Falling back to embedded data.', err);
            }

            // 2nd attempt: use the embedded fallback loaded by data-embedded.js
            if (window.__BIONOTES_FALLBACK_DATA__ && Array.isArray(window.__BIONOTES_FALLBACK_DATA__.topics)) {
                biologyTopics = window.__BIONOTES_FALLBACK_DATA__.topics;
                return;
            }

            // Both attempts failed — show a clear, honest message instead of a silent blank UI
            biologyTopics = [];
            alert('Could not load the biology dataset. Please make sure data.json and data-embedded.js are in the same folder as index.html.');
        }


        /* =================================================================
           SECTION 2: EXAM TIP LIBRARY
           Since the dataset doesn't include a dedicated "exam tip" field,
           we generate a short, relevant "Remember This!" tip per category
           so every note card feels complete. This runs entirely offline.
        ================================================================= */
        const examTipsByCategory = {
            "Cell Biology (khaliya)": "Cell organelles ke naam aur unke 'nickname' (Powerhouse, Brain, Factory) yaad rakhein — exam me aksar match-the-column aata hai.",
            "Genetics & DNA": "DNA vs RNA ka farq aur Transcription/Translation ki tarteeb (DNA -> RNA -> Protein) hamesha yaad rakhein.",
            "Plant Physiology (Paudon Ka Nizam)": "Xylem hamesha 'oopar' (one-way) aur Phloem 'har taraf' (two-way) le jata hai — is farq ko confuse na karein.",
            "Human Body Systems": "Har organ ka aik hi kaam yaad karne ke bajaye uski 'real-life example' se link karein — asani se yaad rahega.",
            "Ecology & Environment": "Food Chain seedhi line hoti hai, Food Web bohat si chains ka jaal — diagram bana kar farq samjhein.",
            "Evolution & Microbes": "Bacteria aur Virus dono chhote hote hain lekin Virus khud se zinda nahi reh sakta — ye sabse common exam trick hai."
        };
        const defaultExamTip = "Is topic ki definition ko apne alfaaz me dobara likhne ki practice karein — isse yaad rakhna asan ho jata hai.";

        /* =================================================================
           SECTION 3: DOM REFERENCES
           Caching all elements we will interact with, for performance
           and readability.
        ================================================================= */
        const topicSearchInput   = document.getElementById('topicSearchInput');
        const searchSuggestions  = document.getElementById('searchSuggestions');
        const topicSelectDropdown= document.getElementById('topicSelectDropdown');
        const customContextInput = document.getElementById('customContextInput');
        const noteFontSelect     = document.getElementById('noteFontSelect');
        const categoryPillsContainer = document.getElementById('categoryPillsContainer');
        const generateNotesBtn   = document.getElementById('generateNotesBtn');
        const notePaperCard      = document.getElementById('notePaperCard');
        const notebookWrapper    = document.getElementById('notebookWrapper');
        const noteContentBlock   = document.getElementById('noteContentBlock');
        const downloadBtnWrapper = document.getElementById('downloadBtnWrapper');
        const downloadPdfBtn     = document.getElementById('downloadPdfBtn');

        /* New elements: AI settings modal, loading overlay, error banner, mode pill */
        const aiProviderSelect    = document.getElementById('aiProviderSelect');
        const aiApiKeyInput       = document.getElementById('aiApiKeyInput');
        const saveApiSettingsBtn  = document.getElementById('saveApiSettingsBtn');
        const clearApiSettingsBtn = document.getElementById('clearApiSettingsBtn');
        const aiLoadingOverlay    = document.getElementById('aiLoadingOverlay');
        const aiLoadingText       = document.getElementById('aiLoadingText');
        const aiErrorBanner       = document.getElementById('aiErrorBanner');
        const aiErrorBannerText   = document.getElementById('aiErrorBannerText');
        const aiErrorBannerClose  = document.getElementById('aiErrorBannerClose');
        const aiModeIndicator     = document.getElementById('aiModeIndicator');

        /* Keeps track of which topic (by id, or 'custom') is currently active */
        let activeSelectedTopicId = null;
        let activeCategoryFilter  = null;

        /* =================================================================
           SECTION 4: BUILD THE CATEGORY DROPDOWN (grouped by category)
           Groups the 50 topics under <optgroup> tags matching their
           category, in the order categories first appear in the dataset.
        ================================================================= */
        function buildTopicDropdown() {
            // Preserve category order of first appearance
            const orderedCategories = [];
            biologyTopics.forEach(t => {
                if (!orderedCategories.includes(t.category)) orderedCategories.push(t.category);
            });

            orderedCategories.forEach(cat => {
                const group = document.createElement('optgroup');
                group.label = cat;
                biologyTopics
                    .filter(t => t.category === cat)
                    .forEach(t => {
                        const opt = document.createElement('option');
                        opt.value = t.id;
                        opt.textContent = t.topic_name;
                        group.appendChild(opt);
                    });
                topicSelectDropdown.appendChild(group);
            });
        }

        /* =================================================================
           SECTION 5: BUILD CATEGORY QUICK-FILTER PILLS
        ================================================================= */
        function buildCategoryPills() {
            const orderedCategories = [];
            biologyTopics.forEach(t => {
                if (!orderedCategories.includes(t.category)) orderedCategories.push(t.category);
            });

            orderedCategories.forEach(cat => {
                const pill = document.createElement('span');
                pill.className = 'category-pill me-2 mb-1 d-inline-block';
                pill.textContent = cat.split('(')[0].trim(); // shorter label without Urdu parenthetical
                pill.dataset.category = cat;
                pill.addEventListener('click', () => {
                    // toggle active filter: clicking same pill again clears filter
                    if (activeCategoryFilter === cat) {
                        activeCategoryFilter = null;
                        pill.classList.remove('active');
                    } else {
                        document.querySelectorAll('.category-pill').forEach(p => p.classList.remove('active'));
                        activeCategoryFilter = cat;
                        pill.classList.add('active');
                    }
                    renderSearchSuggestions(topicSearchInput.value.trim());
                });
                categoryPillsContainer.appendChild(pill);
            });
        }

        /* =================================================================
           SECTION 6: LIVE SEARCH SUGGESTIONS
           Filters biologyTopics by topic_name (and category, if a pill
           filter is active) and shows a dropdown list under the search box.
        ================================================================= */
        function renderSearchSuggestions(query) {
            let matches = biologyTopics;

            if (activeCategoryFilter) {
                matches = matches.filter(t => t.category === activeCategoryFilter);
            }
            if (query) {
                const q = query.toLowerCase();
                matches = matches.filter(t =>
                    t.topic_name.toLowerCase().includes(q) ||
                    t.definition_english.toLowerCase().includes(q) ||
                    t.category.toLowerCase().includes(q)
                );
            }

            // If there's no query and no filter, hide suggestions entirely
            if (!query && !activeCategoryFilter) {
                searchSuggestions.style.display = 'none';
                searchSuggestions.innerHTML = '';
                return;
            }

            if (matches.length === 0) {
                searchSuggestions.innerHTML = `<div class="suggestion-item text-muted">No matching topic found. Click "Generate" to create a custom note instead.</div>`;
                searchSuggestions.style.display = 'block';
                return;
            }

            searchSuggestions.innerHTML = matches.slice(0, 12).map(t => `
                <div class="suggestion-item" data-id="${t.id}">
                    ${t.topic_name}
                    <small>${t.category}</small>
                </div>
            `).join('');
            searchSuggestions.style.display = 'block';

            // Bind click handlers to each newly rendered suggestion item
            searchSuggestions.querySelectorAll('.suggestion-item[data-id]').forEach(item => {
                item.addEventListener('click', () => {
                    const id = parseInt(item.dataset.id, 10);
                    activeSelectedTopicId = id;
                    topicSelectDropdown.value = id;
                    const topic = biologyTopics.find(t => t.id === id);
                    topicSearchInput.value = topic.topic_name;
                    searchSuggestions.style.display = 'none';
                });
            });
        }

        /* =================================================================
           SECTION 6B: FONT PICKER — lets the user change the handwriting
           font used inside the notebook note card. Updates the --note-font
           CSS variable on the root element so every note text block
           (title, definition, explanation, examples, tip) switches
           instantly, including notes already on screen.
        ================================================================= */
        noteFontSelect.addEventListener('change', () => {
            document.documentElement.style.setProperty('--note-font', noteFontSelect.value);
        });

        /* =================================================================
           SECTION 6C: AI SETTINGS (Gemini / OpenAI API KEY) — localStorage
           Persists the chosen provider + API key in the browser only.
           Nothing is ever sent anywhere except directly to the chosen
           provider's own API endpoint from the user's browser.
        ================================================================= */
        const STORAGE_KEY_PROVIDER = 'bionotes_ai_provider';
        const STORAGE_KEY_APIKEY   = 'bionotes_ai_apikey';

        function loadSavedAiSettings() {
            const savedProvider = localStorage.getItem(STORAGE_KEY_PROVIDER) || 'none';
            const savedKey = localStorage.getItem(STORAGE_KEY_APIKEY) || '';
            aiProviderSelect.value = savedProvider;
            aiApiKeyInput.value = savedKey;
            updateAiModeIndicator();
        }

        function updateAiModeIndicator() {
            const provider = localStorage.getItem(STORAGE_KEY_PROVIDER) || 'none';
            const key = localStorage.getItem(STORAGE_KEY_APIKEY) || '';
            if (provider !== 'none' && key) {
                const label = provider === 'gemini' ? 'Gemini AI Mode' : 'ChatGPT AI Mode';
                aiModeIndicator.innerHTML = `<i class="bi bi-stars"></i> ${label}`;
                aiModeIndicator.classList.add('ai-active');
            } else {
                aiModeIndicator.innerHTML = `<i class="bi bi-hdd-network"></i> Local Dataset Mode`;
                aiModeIndicator.classList.remove('ai-active');
            }
        }

        saveApiSettingsBtn.addEventListener('click', () => {
            localStorage.setItem(STORAGE_KEY_PROVIDER, aiProviderSelect.value);
            localStorage.setItem(STORAGE_KEY_APIKEY, aiApiKeyInput.value.trim());
            updateAiModeIndicator();
        });

        clearApiSettingsBtn.addEventListener('click', () => {
            localStorage.removeItem(STORAGE_KEY_PROVIDER);
            localStorage.removeItem(STORAGE_KEY_APIKEY);
            aiProviderSelect.value = 'none';
            aiApiKeyInput.value = '';
            updateAiModeIndicator();
        });

        /* =================================================================
           SECTION 6D: LOADING OVERLAY + ERROR BANNER HELPERS
        ================================================================= */
        function showAiLoading(message) {
            aiLoadingText.textContent = message || 'Querying AI Model & Generating Vector Diagram...';
            aiLoadingOverlay.style.display = 'flex';
        }
        function hideAiLoading() {
            aiLoadingOverlay.style.display = 'none';
        }
        function showAiError(message) {
            aiErrorBannerText.textContent = message;
            aiErrorBanner.style.display = 'flex';
        }
        function hideAiError() {
            aiErrorBanner.style.display = 'none';
        }
        aiErrorBannerClose.addEventListener('click', hideAiError);

        /* =================================================================
           SECTION 6E: OFFLINE SVG DIAGRAM GENERATOR
           Produces a simple, clean, labelled vector diagram entirely
           offline (no API needed) using only Blue/White/Sky-Blue tones,
           so every note — local dataset or custom fallback — always
           shows an actual visual image instead of plain text. Shape is
           chosen based on the topic's category.
        ================================================================= */
        function buildOfflineDiagramSVG(topic) {
            const label = (topic.topic_name || 'Topic').slice(0, 26);
            const cat = topic.category || '';

            // Pick a simple representative shape per category
            let shapeSvg = '';
            if (cat.includes('Cell')) {
                shapeSvg = `
                    <ellipse cx="150" cy="90" rx="120" ry="70" fill="#E0F2FE" stroke="#2563EB" stroke-width="3"/>
                    <circle cx="150" cy="90" r="30" fill="#93C5FD" stroke="#1E3A8A" stroke-width="2.5"/>
                    <circle cx="95" cy="60" r="10" fill="#38BDF8" stroke="#1E3A8A" stroke-width="1.5"/>
                    <circle cx="205" cy="115" r="10" fill="#38BDF8" stroke="#1E3A8A" stroke-width="1.5"/>`;
            } else if (cat.includes('Genetics') || cat.includes('DNA')) {
                shapeSvg = `
                    <path d="M110 20 C160 45, 100 65, 150 90 C200 115, 140 135, 190 160" fill="none" stroke="#2563EB" stroke-width="4"/>
                    <path d="M190 20 C140 45, 200 65, 150 90 C100 115, 160 135, 110 160" fill="none" stroke="#0F172A" stroke-width="4"/>
                    <line x1="118" y1="30" x2="182" y2="30" stroke="#93C5FD" stroke-width="3"/>
                    <line x1="120" y1="65" x2="180" y2="65" stroke="#93C5FD" stroke-width="3"/>
                    <line x1="118" y1="100" x2="182" y2="100" stroke="#93C5FD" stroke-width="3"/>
                    <line x1="120" y1="135" x2="180" y2="135" stroke="#93C5FD" stroke-width="3"/>`;
            } else if (cat.includes('Plant')) {
                shapeSvg = `
                    <rect x="140" y="80" width="10" height="80" fill="#2563EB"/>
                    <path d="M145 90 C90 70, 70 30, 100 15 C120 40, 140 65, 145 90 Z" fill="#DBEAFE" stroke="#1E3A8A" stroke-width="2.5"/>
                    <path d="M145 90 C200 70, 220 30, 190 15 C170 40, 150 65, 145 90 Z" fill="#E0F2FE" stroke="#1E3A8A" stroke-width="2.5"/>
                    <circle cx="60" cy="10" r="14" fill="none" stroke="#38BDF8" stroke-width="2"/>`;
            } else if (cat.includes('Human') || cat.includes('Body')) {
                shapeSvg = `
                    <circle cx="150" cy="45" r="24" fill="#DBEAFE" stroke="#1E3A8A" stroke-width="2.5"/>
                    <rect x="120" y="72" width="60" height="80" rx="14" fill="#E0F2FE" stroke="#2563EB" stroke-width="2.5"/>
                    <circle cx="150" cy="112" r="16" fill="#93C5FD" stroke="#1E3A8A" stroke-width="2"/>`;
            } else if (cat.includes('Ecology') || cat.includes('Environment')) {
                shapeSvg = `
                    <circle cx="90" cy="120" r="24" fill="#DBEAFE" stroke="#1E3A8A" stroke-width="2.5"/>
                    <circle cx="150" cy="70" r="24" fill="#E0F2FE" stroke="#2563EB" stroke-width="2.5"/>
                    <circle cx="210" cy="120" r="24" fill="#93C5FD" stroke="#1E3A8A" stroke-width="2.5"/>
                    <line x1="110" y1="110" x2="135" y2="82" stroke="#2563EB" stroke-width="2.5"/>
                    <line x1="165" y1="82" x2="190" y2="110" stroke="#2563EB" stroke-width="2.5"/>`;
            } else if (cat.includes('Evolution') || cat.includes('Microbes')) {
                shapeSvg = `
                    <ellipse cx="150" cy="90" rx="55" ry="30" fill="#E0F2FE" stroke="#2563EB" stroke-width="3"/>
                    <path d="M95 90 Q75 70 60 80" fill="none" stroke="#1E3A8A" stroke-width="3"/>
                    <path d="M95 95 Q75 110 60 105" fill="none" stroke="#1E3A8A" stroke-width="3"/>
                    <circle cx="150" cy="90" r="10" fill="#93C5FD" stroke="#1E3A8A" stroke-width="1.5"/>`;
            } else {
                shapeSvg = `
                    <rect x="70" y="40" width="160" height="100" rx="12" fill="#E0F2FE" stroke="#2563EB" stroke-width="3"/>
                    <circle cx="150" cy="90" r="26" fill="#93C5FD" stroke="#1E3A8A" stroke-width="2.5"/>`;
            }

            return `<svg viewBox="0 0 300 190" width="300" height="190" xmlns="http://www.w3.org/2000/svg">
                <rect x="0" y="0" width="300" height="190" fill="#FFFFFF"/>
                ${shapeSvg}
                <text x="150" y="180" text-anchor="middle" font-family="Poppins, sans-serif" font-size="11" fill="#1E3A8A" font-weight="600">${escapeHtml(label)}</text>
            </svg>`;
        }

        /* =================================================================
           SECTION 6G: SECOND OFFLINE DIAGRAM — "CLOSER LOOK" VISUAL
           Every note can now carry TWO real images. The first (Section 6E)
           is a category-shape overview diagram. This second one is a
           distinct "labelled parts" style card — a numbered list inside a
           framed box — so it visually differs from Diagram 1 instead of
           repeating it. Used whenever a topic has a diagram_description_2.
        ================================================================= */
        function buildOfflineDiagramSVG2(topic) {
            const title = (topic.topic_name || topic.topic_title || 'Topic').split('(')[0].trim().slice(0, 28);
            const cat = topic.category || '';

            return `<svg viewBox="0 0 300 190" width="300" height="190" xmlns="http://www.w3.org/2000/svg">
                <rect x="0" y="0" width="300" height="190" rx="10" fill="#FFFFFF" stroke="#93C5FD" stroke-width="2"/>
                <rect x="0" y="0" width="300" height="32" rx="10" fill="#2563EB"/>
                <rect x="0" y="16" width="300" height="16" fill="#2563EB"/>
                <text x="150" y="21" text-anchor="middle" font-family="Poppins, sans-serif" font-size="12" fill="#FFFFFF" font-weight="700">${escapeHtml(title)}</text>
                <circle cx="40" cy="70" r="9" fill="#E0F2FE" stroke="#1E3A8A" stroke-width="2"/>
                <text x="40" y="74" text-anchor="middle" font-family="Poppins, sans-serif" font-size="10" fill="#1E3A8A" font-weight="700">1</text>
                <line x1="55" y1="70" x2="260" y2="70" stroke="#CBD5E1" stroke-width="1.5" stroke-dasharray="3,3"/>
                <circle cx="40" cy="105" r="9" fill="#DBEAFE" stroke="#1E3A8A" stroke-width="2"/>
                <text x="40" y="109" text-anchor="middle" font-family="Poppins, sans-serif" font-size="10" fill="#1E3A8A" font-weight="700">2</text>
                <line x1="55" y1="105" x2="260" y2="105" stroke="#CBD5E1" stroke-width="1.5" stroke-dasharray="3,3"/>
                <circle cx="40" cy="140" r="9" fill="#93C5FD" stroke="#1E3A8A" stroke-width="2"/>
                <text x="40" y="144" text-anchor="middle" font-family="Poppins, sans-serif" font-size="10" fill="#1E3A8A" font-weight="700">3</text>
                <line x1="55" y1="140" x2="260" y2="140" stroke="#CBD5E1" stroke-width="1.5" stroke-dasharray="3,3"/>
                <text x="150" y="168" text-anchor="middle" font-family="Poppins, sans-serif" font-size="9" fill="#64748B">${escapeHtml(cat)}</text>
            </svg>`;
        }

        /* =================================================================
           SECTION 6F: AI PROMPT BUILDER + PROVIDER API CALLS
           Builds the system+user prompt instructing the AI to respond
           strictly in JSON (matching the note-card structure below,
           including a raw ai_svg_diagram), then calls whichever provider
           the user configured.
        ================================================================= */
        function buildAiPrompt(topicQuery, contextText) {
            const context = contextText ? `\n\nAdditional reference text supplied by the user:\n"""${contextText}"""` : '';
            return `You are BioNotes AI, an expert biology teacher who writes deeply detailed, human, exam-focused study notes for students who are more comfortable in Roman Urdu mixed with simple English. The note should be thorough enough to fill about 2-3 printed notebook pages — not a short summary.

Topic requested: "${topicQuery}"${context}

Respond with STRICT, VALID JSON ONLY (no markdown fences, no commentary, no extra text before or after) matching EXACTLY this structure:
{
  "topic_title": "string - clean topic name",
  "category": "string - a short biology sub-field label",
  "definition": "string - one comprehensive English definition with scientific background",
  "simple_explanation": "string - thorough, multi-sentence, step-by-step explanation in easy Roman Urdu mixed with simple English, breaking down the mechanism in a friendly, human tone",
  "detailed_sections": [
    { "heading": "string", "content": "string - a full paragraph, not one line", "real_world_examples": "string" }
  ],
  "ai_svg_diagram": "string - a single raw <svg viewBox=\\"0 0 300 190\\" width=\\"300\\" height=\\"190\\" xmlns=\\"http://www.w3.org/2000/svg\\">...</svg> element, a clean educational vector diagram (Diagram 1: overview) relevant to this topic, using ONLY these colors: #FFFFFF, #F8FAFC, #0F172A, #1E3A8A, #2563EB, #3B82F6, #E0F2FE, #DBEAFE, #93C5FD. No other colors. No text longer than a short label.",
  "diagram_explanation": "string - one or two sentences explaining what Diagram 1 shows",
  "ai_svg_diagram_2": "string - a SECOND, DIFFERENT raw <svg viewBox=\\"0 0 300 190\\" width=\\"300\\" height=\\"190\\" xmlns=\\"http://www.w3.org/2000/svg\\">...</svg> element (Diagram 2: a closer/labelled-parts or process-flow view), same color rules as above",
  "diagram_explanation_2": "string - one or two sentences explaining what Diagram 2 shows",
  "real_world_connection": "string - a paragraph on how this topic applies in real life, medicine, agriculture, or industry",
  "common_mistake": "string - one common misunderstanding students have about this topic and how to avoid it",
  "key_takeaways": ["string", "string", "string", "string"],
  "exam_tip": "string - one high-yield exam tip in Roman Urdu/English"
}

Provide 3 to 5 items in detailed_sections, each with a full paragraph of content (not a single short sentence). Keep both ai_svg_diagram and ai_svg_diagram_2 valid, minimal, and renderable — these are the most important fields, do not omit either one.`;
        }

        /* Extracts a clean JSON object from an AI text response, stripping
           any ```json ... ``` code fences the model might add anyway. */
        function parseAiJsonResponse(rawText) {
            let cleaned = rawText.trim();
            cleaned = cleaned.replace(/^```json/i, '').replace(/^```/, '').replace(/```$/, '').trim();
            // In case the model added stray text, isolate the outermost { ... }
            const firstBrace = cleaned.indexOf('{');
            const lastBrace = cleaned.lastIndexOf('}');
            if (firstBrace !== -1 && lastBrace !== -1) {
                cleaned = cleaned.substring(firstBrace, lastBrace + 1);
            }
            return JSON.parse(cleaned);
        }

        /* Calls Google Gemini's generateContent endpoint */
        async function callGeminiApi(apiKey, prompt) {
            // Gemini 3.1 Pro (preview) — current flagship Gemini 3.1 model.
            // If it's unavailable for this key/region, we automatically
            // retry once with the lighter gemini-3.1-flash-lite model.
            const models = ['gemini-3.1-pro-preview', 'gemini-3.1-flash-lite'];
            let lastError = null;

            for (const model of models) {
                const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${encodeURIComponent(apiKey)}`;
                try {
                    const response = await fetch(url, {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({
                            contents: [{ parts: [{ text: prompt }] }]
                        })
                    });
                    if (!response.ok) {
                        const errBody = await response.text().catch(() => '');
                        throw new Error(`Gemini API error (${response.status}) on ${model}. ${response.status === 400 ? 'Check that your API key is valid.' : errBody.slice(0, 140)}`);
                    }
                    const data = await response.json();
                    const text = data?.candidates?.[0]?.content?.parts?.[0]?.text;
                    if (!text) throw new Error(`Gemini (${model}) returned an empty response.`);
                    return parseAiJsonResponse(text);
                } catch (err) {
                    lastError = err;
                    console.warn(`Gemini model "${model}" failed, trying next fallback if available.`, err);
                }
            }
            throw lastError || new Error('All Gemini model attempts failed.');
        }

        /* Calls OpenAI's chat completions endpoint */
        async function callOpenAiApi(apiKey, prompt) {
            const response = await fetch('https://api.openai.com/v1/chat/completions', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${apiKey}`
                },
                body: JSON.stringify({
                    model: 'gpt-4o-mini',
                    messages: [{ role: 'user', content: prompt }],
                    temperature: 0.7
                })
            });
            if (!response.ok) {
                const errBody = await response.json().catch(() => ({}));
                const msg = errBody?.error?.message || `OpenAI API error (${response.status}).`;
                throw new Error(response.status === 401 ? 'Invalid OpenAI API key.' : msg);
            }
            const data = await response.json();
            const text = data?.choices?.[0]?.message?.content;
            if (!text) throw new Error('OpenAI returned an empty response.');
            return parseAiJsonResponse(text);
        }

        /* =================================================================
           SECTION 7: EVENT LISTENERS — search input & dropdown selection
        ================================================================= */
        topicSearchInput.addEventListener('input', () => {
            activeSelectedTopicId = null; // typing clears an explicit dropdown pick
            renderSearchSuggestions(topicSearchInput.value.trim());
        });
        topicSearchInput.addEventListener('focus', () => {
            renderSearchSuggestions(topicSearchInput.value.trim());
        });
        // Hide suggestions when clicking anywhere outside the search box
        document.addEventListener('click', (e) => {
            if (!e.target.closest('.position-relative')) {
                searchSuggestions.style.display = 'none';
            }
        });

        topicSelectDropdown.addEventListener('change', () => {
            const id = parseInt(topicSelectDropdown.value, 10);
            if (!isNaN(id)) {
                activeSelectedTopicId = id;
                const topic = biologyTopics.find(t => t.id === id);
                topicSearchInput.value = topic.topic_name;
                searchSuggestions.style.display = 'none';
            }
        });

        /* =================================================================
           SECTION 8: FALLBACK / MOCK NOTE GENERATOR
           If the user's search/text doesn't match any of the 50 dataset
           topics, we build a structured note dynamically using the same
           visual format, based on whatever text they provided.
        ================================================================= */
        function buildFallbackTopic(rawQuery, contextText) {
            const titleSource = rawQuery && rawQuery.trim() ? rawQuery.trim() : "Custom Topic";
            const contextSource = contextText && contextText.trim() ? contextText.trim() : null;

            return {
                id: 'custom',
                category: "Custom / Not in Dataset",
                topic_name: titleSource,
                definition_english: contextSource
                    ? contextSource.split('.')[0] + '.'
                    : `A biology concept related to "${titleSource}" that is not part of the built-in 50-topic dataset.`,
                simple_explanation: contextSource
                    ? "Aap ke diye gaye reference text ke mutabiq: " + contextSource
                    : `"${titleSource}" ke bare me tafseeli maloomat is waqt dataset me mojood nahi. Aap upar text box me apna reference paragraph paste kar ke iska humanized note bana sakte hain.`,
                examples_or_details: contextSource
                    ? "Examples aapke diye gaye text se derive kiye gaye hain."
                    : "Koi specific example is waqt mojood nahi — reference text add karein.",
                diagram_description: `A conceptual diagram representing "${titleSource}" — add your own reference image or sketch for better visual recall.`
            };
        }

        /* =================================================================
           SECTION 9: RESOLVE WHICH TOPIC TO RENDER
           Priority: 1) explicitly selected dropdown/suggestion topic
                     2) exact/partial text match on search input
                     3) fallback generated note using search text + context
        ================================================================= */
        function resolveTopicToRender() {
            const query = topicSearchInput.value.trim();
            const context = customContextInput.value.trim();

            // 1. Explicit selection (dropdown or clicked suggestion)
            if (activeSelectedTopicId && activeSelectedTopicId !== 'custom') {
                const found = biologyTopics.find(t => t.id === activeSelectedTopicId);
                if (found) return found;
            }

            // 2. Try to match typed query against dataset (case-insensitive)
            if (query) {
                const q = query.toLowerCase();
                const exact = biologyTopics.find(t => t.topic_name.toLowerCase() === q);
                if (exact) return exact;

                const partial = biologyTopics.find(t => t.topic_name.toLowerCase().includes(q));
                if (partial) return partial;
            }

            // 3. If only custom context was pasted with no matching topic name
            if (query || context) {
                return buildFallbackTopic(query, context);
            }

            return null; // nothing to generate from
        }

        /* =================================================================
           SECTION 10: RENDER THE HUMANIZED NOTEBOOK NOTE CARD
           (Local dataset / fallback shape: topic_name, definition_english,
           simple_explanation, examples_or_details, diagram_description)
        ================================================================= */
        function renderNoteCard(topic) {
            const tip = examTipsByCategory[topic.category] || defaultExamTip;

            noteContentBlock.innerHTML = `
                <div class="note-category-chip">
                    <i class="bi bi-tag-fill"></i> ${escapeHtml(topic.category)}
                </div>
                <h2 class="note-topic-title">${escapeHtml(topic.topic_name)}</h2>
                <p class="note-definition">${escapeHtml(topic.definition_english)}</p>

                <div class="note-section-heading">
                    <i class="bi bi-pencil-square"></i> Simple Explanation (Roman Urdu / Easy English)
                </div>
                <div class="note-box-explanation">
                    ${escapeHtml(topic.simple_explanation)}
                </div>

                ${topic.in_depth_explanation ? `
                <div class="note-section-heading">
                    <i class="bi bi-journal-text"></i> In-Depth Explanation (How It Works)
                </div>
                <div class="note-box-examples">
                    ${escapeHtml(topic.in_depth_explanation)}
                </div>
                ` : ''}

                <div class="note-section-heading">
                    <i class="bi bi-list-stars"></i> Examples &amp; Key Takeaways
                </div>
                <div class="note-box-examples">
                    ${escapeHtml(topic.examples_or_details)}
                </div>

                ${topic.real_world_connection ? `
                <div class="note-section-heading">
                    <i class="bi bi-globe-asia-australia"></i> Real-World Connection
                </div>
                <div class="note-box-realworld">
                    <i class="bi bi-link-45deg"></i>
                    <span>${escapeHtml(topic.real_world_connection)}</span>
                </div>
                ` : ''}

                <div class="note-section-heading">
                    <i class="bi bi-bounding-box-circles"></i> Diagram 1 — Overview
                </div>
                <div class="note-box-diagram">
                    <div class="diagram-visual-frame">${buildOfflineDiagramSVG(topic)}</div>
                    <div class="diagram-caption">
                        <i class="bi bi-info-circle"></i>
                        <span>${escapeHtml(topic.diagram_description)}</span>
                    </div>
                </div>

                ${topic.diagram_description_2 ? `
                <div class="note-section-heading">
                    <i class="bi bi-bounding-box-circles"></i> Diagram 2 — Closer Look
                </div>
                <div class="note-box-diagram">
                    <div class="diagram-visual-frame">${buildOfflineDiagramSVG2(topic)}</div>
                    <div class="diagram-caption">
                        <i class="bi bi-info-circle"></i>
                        <span>${escapeHtml(topic.diagram_description_2)}</span>
                    </div>
                </div>
                ` : ''}

                ${topic.common_mistake ? `
                <div class="note-section-heading">
                    <i class="bi bi-exclamation-diamond"></i> Common Mistake to Avoid
                </div>
                <div class="note-box-mistake">
                    <i class="bi bi-exclamation-diamond-fill"></i>
                    <span>${escapeHtml(topic.common_mistake)}</span>
                </div>
                ` : ''}

                <div class="note-section-heading">
                    <i class="bi bi-lightbulb-fill"></i> Exam Tip
                </div>
                <div class="note-box-tip">
                    <i class="bi bi-lightbulb-fill"></i>
                    <div>
                        <strong>Remember This!</strong>
                        <p>${escapeHtml(tip)}</p>
                    </div>
                </div>
            `;

            notebookWrapper.style.display = 'block';
            noteContentBlock.style.display = 'block';
            downloadBtnWrapper.style.setProperty('display', 'flex', 'important');
        }

        /* =================================================================
           SECTION 10B: RENDER AN AI-GENERATED "DEEP NOTE" CARD
           (AI response shape: topic_title, category, definition,
           simple_explanation, detailed_sections[], ai_svg_diagram,
           diagram_explanation, key_takeaways[], exam_tip)
           The key difference from renderNoteCard(): the diagram box shows
           the REAL <svg> returned by the AI model instead of the offline
           placeholder shape, and extra "detailed_sections" are rendered
           as additional mini sections for a deeper, longer note.
        ================================================================= */
        function renderAiNoteCard(note) {
            const sectionsHtml = (note.detailed_sections || []).map(sec => `
                <div class="note-section-heading">
                    <i class="bi bi-journal-text"></i> ${escapeHtml(sec.heading || 'More Detail')}
                </div>
                <div class="note-box-examples">
                    ${escapeHtml(sec.content || '')}
                    ${sec.real_world_examples ? `<br><em>${escapeHtml(sec.real_world_examples)}</em>` : ''}
                </div>
            `).join('');

            const takeawaysHtml = (note.key_takeaways || []).map(k => `<li>${escapeHtml(k)}</li>`).join('');

            // Validate the AI's SVGs before trusting them — must actually start with <svg
            const svgIsValid = typeof note.ai_svg_diagram === 'string' && note.ai_svg_diagram.trim().startsWith('<svg');
            const diagramVisual = svgIsValid ? note.ai_svg_diagram : buildOfflineDiagramSVG({
                topic_name: note.topic_title, category: note.category || ''
            });

            const svg2IsValid = typeof note.ai_svg_diagram_2 === 'string' && note.ai_svg_diagram_2.trim().startsWith('<svg');
            const diagramVisual2 = svg2IsValid ? note.ai_svg_diagram_2 : buildOfflineDiagramSVG2({
                topic_name: note.topic_title, category: note.category || ''
            });

            noteContentBlock.innerHTML = `
                <div class="note-category-chip">
                    <i class="bi bi-stars"></i> AI Deep Note &middot; ${escapeHtml(note.category || 'Biology')}
                </div>
                <h2 class="note-topic-title">${escapeHtml(note.topic_title || 'Untitled Topic')}</h2>
                <p class="note-definition">${escapeHtml(note.definition || '')}</p>

                <div class="note-section-heading">
                    <i class="bi bi-pencil-square"></i> Simple Explanation (Roman Urdu / Easy English)
                </div>
                <div class="note-box-explanation">
                    ${escapeHtml(note.simple_explanation || '')}
                </div>

                ${sectionsHtml}

                ${takeawaysHtml ? `
                <div class="note-section-heading">
                    <i class="bi bi-list-stars"></i> Key Takeaways
                </div>
                <ul class="note-box-examples">${takeawaysHtml}</ul>
                ` : ''}

                ${note.real_world_connection ? `
                <div class="note-section-heading">
                    <i class="bi bi-globe-asia-australia"></i> Real-World Connection
                </div>
                <div class="note-box-realworld">
                    <i class="bi bi-link-45deg"></i>
                    <span>${escapeHtml(note.real_world_connection)}</span>
                </div>
                ` : ''}

                <div class="note-section-heading">
                    <i class="bi bi-bounding-box-circles"></i> Diagram 1 — AI Generated Overview
                </div>
                <div class="note-box-diagram">
                    <div class="diagram-visual-frame">${diagramVisual}</div>
                    <div class="diagram-caption">
                        <i class="bi bi-info-circle"></i>
                        <span>${escapeHtml(note.diagram_explanation || '')}</span>
                    </div>
                </div>

                <div class="note-section-heading">
                    <i class="bi bi-bounding-box-circles"></i> Diagram 2 — Closer Look
                </div>
                <div class="note-box-diagram">
                    <div class="diagram-visual-frame">${diagramVisual2}</div>
                    <div class="diagram-caption">
                        <i class="bi bi-info-circle"></i>
                        <span>${escapeHtml(note.diagram_explanation_2 || '')}</span>
                    </div>
                </div>

                ${note.common_mistake ? `
                <div class="note-section-heading">
                    <i class="bi bi-exclamation-diamond"></i> Common Mistake to Avoid
                </div>
                <div class="note-box-mistake">
                    <i class="bi bi-exclamation-diamond-fill"></i>
                    <span>${escapeHtml(note.common_mistake)}</span>
                </div>
                ` : ''}

                <div class="note-section-heading">
                    <i class="bi bi-lightbulb-fill"></i> Exam Tip
                </div>
                <div class="note-box-tip">
                    <i class="bi bi-lightbulb-fill"></i>
                    <div>
                        <strong>Remember This!</strong>
                        <p>${escapeHtml(note.exam_tip || defaultExamTip)}</p>
                    </div>
                </div>
            `;

            notebookWrapper.style.display = 'block';
            noteContentBlock.style.display = 'block';
            downloadBtnWrapper.style.setProperty('display', 'flex', 'important');
        }

        /* Small helper to avoid raw HTML injection from any user-typed text */
        function escapeHtml(str) {
            const div = document.createElement('div');
            div.textContent = str;
            return div.innerHTML;
        }

        /* =================================================================
           SECTION 11: "GENERATE HUMAN NOTES" BUTTON CLICK HANDLER
           If the user has connected a Gemini or OpenAI API key, this
           calls that AI to generate a deep note (with a real AI-drawn
           SVG diagram) for whatever they typed. Otherwise it falls back
           to the instant local 50-topic dataset / offline generator.
        ================================================================= */
        generateNotesBtn.addEventListener('click', async () => {
            hideAiError();

            const provider = localStorage.getItem(STORAGE_KEY_PROVIDER) || 'none';
            const apiKey   = (localStorage.getItem(STORAGE_KEY_APIKEY) || '').trim();
            const query    = topicSearchInput.value.trim();
            const context  = customContextInput.value.trim();

            // AI mode: only kicks in when a provider + key are both configured
            if (provider !== 'none' && apiKey) {
                if (!query && !context) {
                    topicSearchInput.classList.add('is-invalid');
                    topicSearchInput.setAttribute('placeholder', 'Type a topic to generate AI notes for...');
                    setTimeout(() => topicSearchInput.classList.remove('is-invalid'), 1500);
                    return;
                }

                const prompt = buildAiPrompt(query || 'the pasted reference text', context);
                showAiLoading('Querying AI Model & Generating Vector Diagram...');
                generateNotesBtn.disabled = true;

                try {
                    const aiNote = provider === 'gemini'
                        ? await callGeminiApi(apiKey, prompt)
                        : await callOpenAiApi(apiKey, prompt);

                    renderAiNoteCard(aiNote);
                    notePaperCard.scrollIntoView({ behavior: 'smooth', block: 'start' });
                } catch (err) {
                    console.error('AI generation failed:', err);
                    showAiError(err.message || 'AI request failed. Please check your API key and internet connection, or switch to Local Dataset Mode.');
                } finally {
                    hideAiLoading();
                    generateNotesBtn.disabled = false;
                }
                return;
            }

            // Local dataset / offline fallback mode
            const topic = resolveTopicToRender();

            if (!topic) {
                // Nothing typed/selected — gently prompt the user
                topicSearchInput.classList.add('is-invalid');
                topicSearchInput.setAttribute('placeholder', 'Please type or select a topic first...');
                setTimeout(() => topicSearchInput.classList.remove('is-invalid'), 1500);
                return;
            }

            renderNoteCard(topic);

            // Smooth scroll down to the generated note for better UX
            notePaperCard.scrollIntoView({ behavior: 'smooth', block: 'start' });
        });

        /* Allow pressing Enter inside the search box to trigger generation */
        topicSearchInput.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') {
                e.preventDefault();
                generateNotesBtn.click();
            }
        });

        /* =================================================================
           SECTION 12: PDF DOWNLOAD USING html2pdf.js
           Exports the #notePaperCard element (the visible notebook note)
           as a clean, print-ready PDF file named after the topic.
        ================================================================= */
        downloadPdfBtn.addEventListener('click', () => {
            const topicTitleEl = noteContentBlock.querySelector('.note-topic-title');
            const fileTitle = topicTitleEl ? topicTitleEl.textContent.trim().replace(/[^\w\s-]/g, '') : 'BioNotes';

            // Temporarily hide the download button row so it doesn't appear in the PDF
            downloadBtnWrapper.style.setProperty('display', 'none', 'important');

            const pdfOptions = {
                margin: 0.4,
                filename: `${fileTitle || 'BioNote'}.pdf`,
                image: { type: 'jpeg', quality: 0.98 },
                html2canvas: { scale: 2, backgroundColor: '#FFFFFF' },
                jsPDF: { unit: 'in', format: 'a4', orientation: 'portrait' },
                pagebreak: { mode: ['css', 'avoid-all'] }
            };

            html2pdf().set(pdfOptions).from(notePaperCard).save().then(() => {
                // Restore the download button after PDF generation completes
                downloadBtnWrapper.style.setProperty('display', 'flex', 'important');
            });
        });

        /* =================================================================
           SECTION 13: INITIALIZE APP ON PAGE LOAD
        ================================================================= */
        async function initApp() {
            await loadBiologyDataset();
            buildTopicDropdown();
            buildCategoryPills();
            loadSavedAiSettings();
        }
        document.addEventListener('DOMContentLoaded', initApp);
