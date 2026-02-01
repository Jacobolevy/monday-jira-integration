
const express = require('express');
const bodyParser = require('body-parser');
require('dotenv').config();

const mondayService = require('./services/monday-service');
const jiraService = require('./services/jira-service');
const { mapMondayToJira } = require('./utils/mapper');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(bodyParser.json());
app.use(express.static('../client/dist'));

// API: Get details to prefill the form
app.get('/api/details/:subitemId', async (req, res) => {
    try {
        const { subitemId } = req.params;
        console.log(`Fetching details for subitem: ${subitemId}`);

        const subitem = await mondayService.getSubitemDetails(subitemId);
        const parentId = subitem.parent_item ? subitem.parent_item.id : null;
        if (!parentId) throw new Error("Subitem has no parent");

        const parentItem = await mondayService.getParentItemDetails(parentId);

        // Reuse mapper logic but return raw fields for the UI to display/edit
        // effectively we want the inputs for the form
        const mappedData = mapMondayToJira(subitem, parentItem);

        // Extract values to send to UI
        const response = {
            projectKey: mappedData.fields.project.key,
            summary: mappedData.fields.summary,
            description: mappedData.fields.description, // detailed object
            label: mappedData.fields.labels[0] || "",
            subitemName: subitem.name
        };

        res.json(response);
    } catch (e) {
        console.error(e);
        res.status(500).json({ error: e.message });
    }
});

// API: Create the ticket (Final submission)
app.post('/api/create', async (req, res) => {
    try {
        const { issueData } = req.body; // Expecting { fields: { ... } }
        console.log('Creating Issue:', issueData.fields.summary);

        const jiraResponse = await jiraService.createIssue(issueData);

        return res.status(200).json({
            success: true,
            issueKey: jiraResponse.key,
            issueId: jiraResponse.id
        });

    } catch (error) {
        console.error('Error creating issue:', error);
        return res.status(500).json({ error: error.message });
    }
});

// Catch-all for React routing
app.get('*', (req, res) => {
    res.sendFile('index.html', { root: '../client/dist' });
});

app.listen(PORT, () => {
    console.log(`Server is running on port ${PORT}`);
});
