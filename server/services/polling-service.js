
const mondayService = require('./monday-service');
const jiraService = require('./jira-service');
const {
  mapMondayToJira,
  STATUS_COLUMN_ID,
  SUBITEM_JIRA_LINK_COLUMN_ID,
  SUBITEM_BOARD_ID,
  STATUS_VALUES
} = require('../utils/mapper');

class PollingService {
  constructor() {
    this.boardId = process.env.MONDAY_BOARD_ID || SUBITEM_BOARD_ID;
    this.jiraBaseUrl = process.env.JIRA_BASE_URL || 'https://wix.atlassian.net';
  }

  /**
   * Main polling function - finds items ready for Jira and processes them
   * @returns {Promise<{processed: number, errors: number, skipped: number, results: Array}>}
   */
  async poll() {
    console.log('='.repeat(60));
    console.log(`[${new Date().toISOString()}] Starting Monday → Jira polling...`);
    console.log(`Board ID: ${this.boardId}`);
    console.log('='.repeat(60));

    const results = {
      processed: 0,
      errors: 0,
      skipped: 0,
      items: []
    };

    try {
      // 1. Get all subitems with "Ready for Jira" status
      const readyItems = await mondayService.getSubitemsReadyForJira(
        this.boardId,
        STATUS_COLUMN_ID,
        STATUS_VALUES.READY_FOR_JIRA
      );

      if (readyItems.length === 0) {
        console.log('No items found with "Ready for Jira" status.');
        return results;
      }

      console.log(`Found ${readyItems.length} item(s) to process.`);

      // 2. Process each item
      for (const item of readyItems) {
        const itemResult = await this.processItem(item);
        results.items.push(itemResult);

        if (itemResult.status === 'success') {
          results.processed++;
        } else if (itemResult.status === 'skipped') {
          results.skipped++;
        } else {
          results.errors++;
        }
      }

    } catch (error) {
      console.error('Fatal error during polling:', error);
      results.fatalError = error.message;
    }

    console.log('\n' + '='.repeat(60));
    console.log('Polling complete.');
    console.log(`  Processed: ${results.processed}`);
    console.log(`  Skipped: ${results.skipped}`);
    console.log(`  Errors: ${results.errors}`);
    console.log('='.repeat(60));

    return results;
  }

  /**
   * Process a single item - create Jira ticket and update Monday
   * @param {object} item - The Monday item to process
   * @returns {Promise<object>} Result object with status and details
   */
  async processItem(item) {
    const result = {
      itemId: item.id,
      itemName: item.name,
      status: 'pending',
      jiraKey: null,
      jiraUrl: null,
      error: null
    };

    console.log(`\nProcessing item: ${item.name} (ID: ${item.id})`);

    try {
      // Check if already has a Jira link (prevent duplicates)
      if (mondayService.hasJiraLink(item, SUBITEM_JIRA_LINK_COLUMN_ID)) {
        console.log(`  → Skipping: Already has Jira link`);
        result.status = 'skipped';
        result.reason = 'Already has Jira link';
        return result;
      }

      // Get parent item for project key
      if (!item.parent_item || !item.parent_item.id) {
        throw new Error('Item has no parent - cannot determine Jira project');
      }

      console.log(`  → Fetching parent item: ${item.parent_item.id}`);
      const parentItem = await mondayService.getParentItemDetails(item.parent_item.id);

      // Map Monday data to Jira format
      console.log(`  → Mapping to Jira format...`);
      const jiraData = mapMondayToJira(item, parentItem);
      console.log(`  → Project: ${jiraData.fields.project.key}, Summary: ${jiraData.fields.summary.substring(0, 50)}...`);

      // Create Jira issue
      console.log(`  → Creating Jira issue...`);
      const jiraResponse = await jiraService.createIssue(jiraData);
      
      result.jiraKey = jiraResponse.key;
      result.jiraUrl = `${this.jiraBaseUrl}/browse/${jiraResponse.key}`;
      console.log(`  → Created: ${result.jiraKey}`);

      // Update Monday with Jira link
      console.log(`  → Updating Monday with Jira link...`);
      await mondayService.updateLinkColumn(
        this.boardId,
        item.id,
        SUBITEM_JIRA_LINK_COLUMN_ID,
        result.jiraUrl,
        result.jiraKey
      );

      // Update status to "Jira Created"
      console.log(`  → Updating status to "Jira Created"...`);
      await mondayService.updateStatusColumn(
        this.boardId,
        item.id,
        STATUS_COLUMN_ID,
        STATUS_VALUES.JIRA_CREATED
      );

      result.status = 'success';
      console.log(`  ✓ Successfully processed: ${result.jiraKey}`);

    } catch (error) {
      result.status = 'error';
      result.error = error.message;
      console.error(`  ✗ Error processing item ${item.id}: ${error.message}`);
    }

    return result;
  }
}

module.exports = new PollingService();
