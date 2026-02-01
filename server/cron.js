#!/usr/bin/env node

/**
 * Cron Job Entry Point for Monday → Jira Polling Service
 * 
 * This script is designed to run as a scheduled cron job on Render.
 * It polls Monday for items with "Ready for Jira" status, creates
 * Jira tickets, and updates Monday with the ticket links.
 * 
 * Environment Variables Required:
 *   MONDAY_API_TOKEN - Monday.com API token
 *   MONDAY_BOARD_ID  - Board ID to monitor (defaults to 18393273008)
 *   JIRA_BASE_URL    - Jira instance URL (e.g., https://wix.atlassian.net)
 *   JIRA_EMAIL       - Jira account email
 *   JIRA_API_TOKEN   - Jira API token
 * 
 * Usage:
 *   node server/cron.js
 * 
 * Render Cron Schedule Examples:
 *   */5 * * * *   - Every 5 minutes
 *   */15 * * * *  - Every 15 minutes
 *   0 * * * *     - Every hour
 */

require('dotenv').config();

const pollingService = require('./services/polling-service');

// Validate required environment variables
function validateEnv() {
  const required = [
    'MONDAY_API_TOKEN',
    'JIRA_BASE_URL',
    'JIRA_EMAIL',
    'JIRA_API_TOKEN'
  ];

  const missing = required.filter(key => !process.env[key]);
  
  if (missing.length > 0) {
    console.error('Missing required environment variables:');
    missing.forEach(key => console.error(`  - ${key}`));
    process.exit(1);
  }
}

async function main() {
  console.log('╔════════════════════════════════════════════════════════════╗');
  console.log('║        Monday → Jira Polling Cron Job                      ║');
  console.log('╚════════════════════════════════════════════════════════════╝');
  console.log(`Started at: ${new Date().toISOString()}`);
  console.log('');

  try {
    // Validate environment
    validateEnv();

    // Run the polling service
    const results = await pollingService.poll();

    // Log summary
    console.log('\n╔════════════════════════════════════════════════════════════╗');
    console.log('║                    EXECUTION SUMMARY                       ║');
    console.log('╠════════════════════════════════════════════════════════════╣');
    console.log(`║  Items processed: ${String(results.processed).padEnd(39)}║`);
    console.log(`║  Items skipped:   ${String(results.skipped).padEnd(39)}║`);
    console.log(`║  Errors:          ${String(results.errors).padEnd(39)}║`);
    console.log('╚════════════════════════════════════════════════════════════╝');

    // Log individual results
    if (results.items && results.items.length > 0) {
      console.log('\nItem Details:');
      results.items.forEach((item, i) => {
        const statusIcon = item.status === 'success' ? '✓' : item.status === 'skipped' ? '○' : '✗';
        console.log(`  ${i + 1}. [${statusIcon}] ${item.itemName}`);
        if (item.jiraKey) {
          console.log(`       Jira: ${item.jiraKey} - ${item.jiraUrl}`);
        }
        if (item.error) {
          console.log(`       Error: ${item.error}`);
        }
        if (item.reason) {
          console.log(`       Reason: ${item.reason}`);
        }
      });
    }

    console.log(`\nCompleted at: ${new Date().toISOString()}`);

    // Exit with error code if there were errors
    if (results.fatalError || results.errors > 0) {
      process.exit(1);
    }

    process.exit(0);

  } catch (error) {
    console.error('\n╔════════════════════════════════════════════════════════════╗');
    console.error('║                    FATAL ERROR                             ║');
    console.error('╚════════════════════════════════════════════════════════════╝');
    console.error(error);
    process.exit(1);
  }
}

// Run the main function
main();
