
const { mapMondayToJira } = require('../utils/mapper');

// Mock Data
const mockSubitem = {
    id: 111,
    name: "Fix login button",
    updates: [
        { id: 1, created_at: "2023-01-01T10:00:00Z", body: "http://example.com/screenshot.png" },
        { id: 2, created_at: "2023-01-02T10:00:00Z", body: "Fixed it" }
    ],
    column_values: [
        { id: "dropdown_mkz29ax2", text: "Login Module", value: null },
        { id: "color_mkz2tbex", value: "{\"index\": 0}", text: "Bug" }
    ]
};

const mockParentItem = {
    id: 222,
    name: "Auth Feature",
    column_values: [
        {
            id: "link_mkz3e37y",
            value: "{\"url\":\"https://wix.atlassian.net/issues/?filter=-1&selectedIssue=DOM2-6333\"}",
            text: "Ticket Link"
        }
    ]
};

async function testMapper() {
    console.log("Testing Mapper...");
    try {
        const issueData = mapMondayToJira(mockSubitem, mockParentItem);
        console.log("Successfully Mapped Data:");
        console.log(JSON.stringify(issueData, null, 2));

        // Assertions
        if (issueData.fields.project.key !== 'DOM2') throw new Error("Wrong Project Key");
        if (!issueData.fields.description.content[1].content[1].text.includes("http://example.com/screenshot.png")) throw new Error("Screenshot link missing");
        if (issueData.fields.labels[0] !== 'Bug') throw new Error("Wrong Label");

        console.log("✅ Mapper Test Passed");
    } catch (e) {
        console.error("❌ Mapper Test Failed:", e);
    }
}

testMapper();
