
const axios = require('axios');

class MondayService {
  constructor() {
    this.apiUrl = 'https://api.monday.com/v2';
    this.apiToken = process.env.MONDAY_API_TOKEN;
  }

  async query(query, variables) {
    try {
      const response = await axios.post(
        this.apiUrl,
        { query, variables },
        {
          headers: {
            'Authorization': this.apiToken,
            'Content-Type': 'application/json',
          },
        }
      );

      if (response.data.errors) {
        throw new Error(JSON.stringify(response.data.errors));
      }
      return response.data.data;
    } catch (error) {
      console.error('Monday API Error:', error.response ? error.response.data : error.message);
      throw error;
    }
  }

  async getSubitemDetails(subitemId) {
    // We need:
    // 1. Column values (specifically dropdown_mkz29ax2 for description context, and color_mkz2tbex for Label)
    // 2. Parent item ID to fetch Project Key
    // 3. Name (Summary)
    // 4. Updates (for screenshot)

    const query = `
      query ($itemId: ID!) {
        items(ids: [$itemId]) {
          name
          parent_item {
            id
          }
          column_values {
            id
            text
            value
            type
          }
          updates (limit: 5) {
            id
            body
            created_at
          }
        }
      }
    `;

    const data = await this.query(query, { itemId: Number(subitemId) });
    if (!data.items || data.items.length === 0) {
        throw new Error(`Subitem ${subitemId} not found`);
    }
    return data.items[0];
  }

  async getParentItemDetails(parentId) {
    // We need:
    // 1. Jira Column link (link_mkz3e37y) to parse Project Key (Space)
    const query = `
      query ($itemId: ID!) {
        items(ids: [$itemId]) {
          name
          column_values(ids: ["link_mkz3e37y"]) {
            id
            text
            value
             ... on BoardRelationValue {
                display_value
             }
          }
        }
      }
    `;
    const data = await this.query(query, { itemId: Number(parentId) });
    if (!data.items || data.items.length === 0) {
        throw new Error(`Parent item ${parentId} not found`);
    }
    return data.items[0];
  }

  /**
   * Get all subitems from a board where status column matches a specific value
   * @param {string} boardId - The board ID to query
   * @param {string} statusColumnId - The status column ID to filter by
   * @param {string} statusValue - The status text value to match (e.g., "Ready for Jira")
   * @returns {Promise<Array>} Array of subitems matching the criteria
   */
  async getSubitemsReadyForJira(boardId, statusColumnId, statusValue) {
    // Query all items from the board and filter by status
    // Monday's API doesn't have direct column value filtering, so we fetch and filter
    const query = `
      query ($boardId: ID!) {
        boards(ids: [$boardId]) {
          items_page(limit: 500) {
            items {
              id
              name
              parent_item {
                id
                name
              }
              column_values {
                id
                text
                value
                type
              }
              updates(limit: 5) {
                id
                body
                created_at
              }
            }
          }
        }
      }
    `;

    const data = await this.query(query, { boardId: Number(boardId) });
    
    if (!data.boards || data.boards.length === 0) {
      console.log(`Board ${boardId} not found`);
      return [];
    }

    const allItems = data.boards[0].items_page?.items || [];
    
    // Filter items where the status column matches the target value
    const matchingItems = allItems.filter(item => {
      const statusCol = item.column_values.find(c => c.id === statusColumnId);
      return statusCol && statusCol.text === statusValue;
    });

    console.log(`Found ${matchingItems.length} items with status "${statusValue}" out of ${allItems.length} total`);
    return matchingItems;
  }

  /**
   * Update a column value for a specific item
   * @param {string} boardId - The board ID
   * @param {string} itemId - The item ID to update
   * @param {string} columnId - The column ID to update
   * @param {any} value - The value to set (will be JSON stringified)
   */
  async updateItemColumn(boardId, itemId, columnId, value) {
    const mutation = `
      mutation ($boardId: ID!, $itemId: ID!, $columnId: String!, $value: JSON!) {
        change_column_value(
          board_id: $boardId,
          item_id: $itemId,
          column_id: $columnId,
          value: $value
        ) {
          id
        }
      }
    `;

    const valueStr = typeof value === 'string' ? value : JSON.stringify(value);
    
    const data = await this.query(mutation, {
      boardId: Number(boardId),
      itemId: Number(itemId),
      columnId: columnId,
      value: valueStr
    });

    return data.change_column_value;
  }

  /**
   * Update the Jira link column on a subitem
   * @param {string} boardId - The board ID
   * @param {string} itemId - The item ID
   * @param {string} columnId - The link column ID
   * @param {string} url - The Jira ticket URL
   * @param {string} text - The display text for the link
   */
  async updateLinkColumn(boardId, itemId, columnId, url, text) {
    const linkValue = {
      url: url,
      text: text || url
    };
    return this.updateItemColumn(boardId, itemId, columnId, linkValue);
  }

  /**
   * Update a status/color column on an item
   * @param {string} boardId - The board ID
   * @param {string} itemId - The item ID
   * @param {string} columnId - The status column ID
   * @param {string} labelText - The label text to set (e.g., "Jira Created")
   */
  async updateStatusColumn(boardId, itemId, columnId, labelText) {
    // For status columns, we need to send the label text
    const statusValue = { label: labelText };
    return this.updateItemColumn(boardId, itemId, columnId, statusValue);
  }

  /**
   * Check if a subitem already has a Jira link
   * @param {object} item - The item object with column_values
   * @param {string} jiraLinkColumnId - The Jira link column ID
   * @returns {boolean} True if the item already has a Jira link
   */
  hasJiraLink(item, jiraLinkColumnId) {
    const linkCol = item.column_values.find(c => c.id === jiraLinkColumnId);
    if (!linkCol || !linkCol.value) return false;
    
    try {
      const parsed = JSON.parse(linkCol.value);
      return parsed && parsed.url && parsed.url.length > 0;
    } catch {
      return false;
    }
  }
}

module.exports = new MondayService();
