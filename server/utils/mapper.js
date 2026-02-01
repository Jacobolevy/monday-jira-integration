// Column IDs
const PARENT_JIRA_LINK_COLUMN_ID = 'link_mkz3e37y'; // Jira link on parent item (for project key)
const LABEL_COLUMN_ID = 'color_mkz2tbex'; // Subitem status/label column (Type of Issue)
const DESCRIPTION_CONTEXT_COLUMN_ID = 'dropdown_mkz29ax2'; // Language/component dropdown

// New columns for polling service
const STATUS_COLUMN_ID = 'color_mkz23qay'; // "Report to dev" status column
const SUBITEM_JIRA_LINK_COLUMN_ID = 'link_mkz21j9b'; // Jira link on subitem
const SUBITEM_BOARD_ID = '18393273008'; // Board ID for subitems

// Status values for the polling workflow
const STATUS_VALUES = {
    READY_FOR_JIRA: 'Ready for Jira',
    JIRA_CREATED: 'Jira Created',
    NOT_NEEDED: 'Not Needed'
};

// Smart Label Mapping based on Type of Issue + Keywords in issue name/description
const LABEL_MAPPING = {
    "UI issue": {
        keywords: {
            "cut off|truncat|overlap|hidden|cropped|clipped|not visible|can't see|missing text|text missing": "Productloc-UX-space",
            "align|layout|line break|design|position|margin|padding|wrap|responsive": "Productloc-UX-design",
            "image|icon|logo|screenshot|picture|graphic|banner": "Productloc-UX-image",
            "not work|broken|crash|error|fail|bug|click|tap|button": "Productloc-bug"
        },
        default: ["Productloc-UX-design"]
    },

    "Format Issue": {
        keywords: {
            "currency|€|\\$|£|¥|symbol|price|cost|amounts?|thousand|decimal|separator": "Productloc-format-currency",
            "\\baddress\\b|street|city|region|country|postal|zip|state|province": "Productloc-format-address",
            "\\bdate\\b|\\btime\\b|\\bhour\\b|\\bminute\\b|\\bAM\\b|\\bPM\\b|24h|12h|timezone|GMT|UTC": "Productloc-format-time",
            "spacing|punctuation|quote|ellips|comma|period|colon|semicolon|dash|hyphen": "Productloc-format-text",
            "parameter|variable|placeholder|\\{|\\}|%s|%d|token|dynamic": "Productloc-format-parameters"
        },
        default: ["Productloc-format-text"]
    },

    "Text in English": {
        keywords: {
            "hardcoded|hardcode|hard coded|in code|not translat": "Productloc-hardcoded",
            "image|icon|banner|graphic": "Productloc-UX-image"
        },
        default: ["Productloc-missing-translation"]
    },

    "ICU": {
        keywords: {
            "plural|gender|select|singular|count|number|one|other|few|many": "Productloc-format-text",
            "parameter|variable|placeholder|\\{|\\}|token|position|order": "Productloc-format-parameters"
        },
        default: ["Productloc-format-text", "Productloc-format-parameters"]
    },

    "Screenshot has different content": {
        keywords: {
            "image|screenshot|picture|visual": "Productloc-UX-image",
            "wrong|incorrect|mismatch|different|outdated": "Productloc-bug",
            "translation|translated|translat": "Productloc-incorrect-translation"
        },
        default: ["Productloc-UX-image"]
    },

    "Smartling has different content": {
        keywords: {
            "missing|not there|doesn't exist|empty": "Productloc-missing-translation",
            "wrong|incorrect|bad translation": "Productloc-incorrect-translation",
            "sync|update|pull|push|deploy": "Productloc-bug"
        },
        default: ["Productloc-bug"]
    },

    "GA issue": {
        keywords: {
            "missing|not translat|english": "Productloc-missing-translation",
            "wrong translat|incorrect translat|bad translat": "Productloc-incorrect-translation",
            "hardcode|hard code": "Productloc-hardcoded",
            "format|currency|date|time|address": "Productloc-format-text"
        },
        default: ["Productloc-bug"]
    },

    "General flow": {
        keywords: {
            "design|UX|user experience|confusing|unclear": "Productloc-UX-design",
            "space|cut|truncat|hidden|overlap": "Productloc-UX-space",
            "format|text|punctuation": "Productloc-format-text"
        },
        default: ["Productloc-bug"]
    },

    "KB article": {
        keywords: {
            "missing|not translat|english|untranslat": "Productloc-missing-translation",
            "wrong|incorrect|error|mistranslat": "Productloc-incorrect-translation",
            "format|spacing|bullet|list|markup|punctuation": "Productloc-format-text",
            "image|screenshot|picture": "Productloc-UX-image",
            "link|broken|not work|404": "Productloc-bug"
        },
        default: ["Productloc-missing-translation"]
    }
};

/**
 * Normalize Type of Issue to match mapping keys
 * Handles variations like "Format issues" vs "Format Issue"
 */
function normalizeTypeOfIssue(typeOfIssue) {
    if (!typeOfIssue) return null;
    
    const normalized = typeOfIssue.toLowerCase().trim();
    
    // Map variations to canonical names
    const aliases = {
        "ui issue": "UI issue",
        "ui issues": "UI issue",
        "format issue": "Format Issue",
        "format issues": "Format Issue",
        "text in english": "Text in English",
        "icu": "ICU",
        "icu issue": "ICU",
        "icu issues": "ICU",
        "screenshot has different content": "Screenshot has different content",
        "smartling has different content": "Smartling has different content",
        "ga issue": "GA issue",
        "ga issues": "GA issue",
        "general flow": "General flow",
        "kb article": "KB article",
        "kb articles": "KB article"
    };
    
    return aliases[normalized] || typeOfIssue;
}

/**
 * Select Jira labels based on Type of Issue and keywords in issue name/description
 * @param {string} typeOfIssue - The Type of Issue from Monday column
 * @param {string} issueName - The subitem name
 * @param {string} description - The description/update body text
 * @returns {string[]} Array of Jira labels
 */
function selectLabels(typeOfIssue, issueName, description = '') {
    const normalizedType = normalizeTypeOfIssue(typeOfIssue);
    const config = LABEL_MAPPING[normalizedType];
    
    // Fallback if type not found
    if (!config) {
        console.log(`Unknown Type of Issue: "${typeOfIssue}" (normalized: "${normalizedType}"), using fallback label`);
        return ["Productloc-bug"];
    }
    
    // Combine issue name and description for keyword search
    const textToSearch = `${issueName} ${description}`.toLowerCase();
    const matchedLabels = new Set();
    
    // Search for keywords
    for (const [pattern, label] of Object.entries(config.keywords)) {
        const regex = new RegExp(pattern, 'i');
        if (regex.test(textToSearch)) {
            matchedLabels.add(label);
        }
    }
    
    // Return matched labels or defaults
    if (matchedLabels.size > 0) {
        return Array.from(matchedLabels);
    }
    
    return config.default;
}

function extractProjectKeyFromUrl(url) {
    if (!url) return null;
    // Example: https://wix.atlassian.net/issues/?filter=-1&selectedIssue=DOM2-6333
    // We want DOM2
    try {
        const urlObj = new URL(url);
        const selectedIssue = urlObj.searchParams.get("selectedIssue");
        if (selectedIssue) {
            return selectedIssue.split('-')[0];
        }
    } catch (e) {
        console.error("Error parsing URL", url, e);
    }
    // Fallback regex if URL param not standard
    const match = url.match(/([A-Z0-9]+)-\d+/);
    return match ? match[1] : null;
}

function getColumnValue(item, columnId) {
    const col = item.column_values.find(c => c.id === columnId);
    if (!col) return null;
    try {
        return JSON.parse(col.value);
    } catch (e) {
        return col.value; // Return raw if not JSON
    }
}

function getColumnText(item, columnId) {
    const col = item.column_values.find(c => c.id === columnId);
    return col ? col.text : "";
}

function mapMondayToJira(subitem, parentItem) {
    // 1. Project Key
    const linkVal = getColumnValue(parentItem, PARENT_JIRA_LINK_COLUMN_ID);
    const projectKey = extractProjectKeyFromUrl(linkVal?.url);

    if (!projectKey) {
        throw new Error(`Could not extract Jira Project Key from parent item ${parentItem.name} column ${PARENT_JIRA_LINK_COLUMN_ID}`);
    }

    // 2. Summary
    const summary = `[LOC] ${subitem.name}`;

    // 3. Description
    // "We have found this issue affectng [column id - dropdown_mkz29ax2 of the subitems]"
    const affectedComponent = getColumnText(subitem, DESCRIPTION_CONTEXT_COLUMN_ID) || "Unknown Component";

    // Screenshot
    // Sort updates by created_at (cronologically first)
    // Note: Monday updates usually come most recent first from API? query limit=5
    // Let's sort to be safe.
    let screenshotLink = "";
    if (subitem.updates && subitem.updates.length > 0) {
        const sortedUpdates = [...subitem.updates].sort((a, b) => new Date(a.created_at) - new Date(b.created_at));

        // Naive assumption: the update BODY contains the link, or is a link?
        // User said: "The first of them... has a url for the screenshot"
        // It might be an HTML anchor or just text. We append the body.
        screenshotLink = sortedUpdates[0].body;
        // If it's an HTML body, we might want to strip generic tags or just include it.
        // Jira description supports ADF (Atlassian Document Format).
        // For simplicity, we'll try to treat it as text/markup.
    }

    const description = {
        type: "doc",
        version: 1,
        content: [
            {
                type: "paragraph",
                content: [
                    {
                        type: "text",
                        text: `Hi,\n\nWe have finalized the QA for ${subitem.name}. We have found this issue affecting ${affectedComponent}.\n\n`
                    }
                ]
            },
            {
                type: "paragraph",
                content: [
                    {
                        type: "text",
                        text: "Screenshot Reference: "
                    },
                    {
                        type: "text",
                        text: screenshotLink // This might need better formatting if it's raw HTML
                    }
                ]
            }
        ]
    };


    // 4. Labels - Smart selection based on Type of Issue + keywords
    const typeOfIssue = getColumnText(subitem, LABEL_COLUMN_ID);
    const descriptionText = screenshotLink; // Use update body for keyword matching
    const jiraLabels = selectLabels(typeOfIssue, subitem.name, descriptionText);
    console.log(`  → Type of Issue: "${typeOfIssue}" → Labels: [${jiraLabels.join(', ')}]`);

    // 5. Reporter
    // "Same as Column ID person" - Assumption: User means the person assigned in a people column?
    // Or literally the "Reporter"?
    // Monday people column value: {"personsAndTeams":[{"id":123,"kind":"person"}]}
    // We can't easily map Monday User ID to Jira User ID without email lookup.
    // For now, we will skip setting specific Reporter to avoid Auth errors (needs 'accountId').
    // Jira usually sets reporter to the API user by default.

    return {
        fields: {
            project: {
                key: projectKey
            },
            summary: summary,
            description: description,
            issuetype: {
                name: "Bug"
            },
            labels: jiraLabels
        }
    };
}

module.exports = {
    mapMondayToJira,
    extractProjectKeyFromUrl,
    getColumnValue,
    getColumnText,
    selectLabels,
    // Column IDs
    PARENT_JIRA_LINK_COLUMN_ID,
    LABEL_COLUMN_ID,
    DESCRIPTION_CONTEXT_COLUMN_ID,
    STATUS_COLUMN_ID,
    SUBITEM_JIRA_LINK_COLUMN_ID,
    SUBITEM_BOARD_ID,
    STATUS_VALUES,
    LABEL_MAPPING
};
