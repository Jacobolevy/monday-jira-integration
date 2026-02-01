
const axios = require('axios');

class JiraService {
    constructor() {
        this.baseUrl = process.env.JIRA_BASE_URL;
        this.email = process.env.JIRA_EMAIL;
        this.apiToken = process.env.JIRA_API_TOKEN;
    }

    async createIssue(issueData) {
        if (!this.baseUrl || !this.email || !this.apiToken) {
            throw new Error('Missing Jira credentials in environment variables.');
        }

        const auth = Buffer.from(`${this.email}:${this.apiToken}`).toString('base64');

        try {
            const response = await axios.post(
                `${this.baseUrl}/rest/api/3/issue`,
                issueData,
                {
                    headers: {
                        'Authorization': `Basic ${auth}`,
                        'Content-Type': 'application/json',
                        'Accept': 'application/json'
                    }
                }
            );
            return response.data;
        } catch (error) {
            console.error('Jira API Error:', error.response ? JSON.stringify(error.response.data) : error.message);
            throw error;
        }
    }
}

module.exports = new JiraService();
