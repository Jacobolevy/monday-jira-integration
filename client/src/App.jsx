import React, { useEffect, useState } from 'react';
import mondaySdk from 'monday-sdk-js';

const monday = mondaySdk();

// Column IDs configured for the Localization QA board
const COLUMN_IDS = {
  language: 'dropdown_mkz29ax2',
  priority: 'color_mkz4hv6s',
  typeOfIssue: 'color_mkz2tbex',
  jiraLink: 'link_mkz3e37y',          // Link de Jira en el item padre
  jiraRequest: 'long_text_mm0cavf7',   // Subitem: JSON data for n8n to process
  jiraIssueLink: 'link_mkz21j9b'       // Subitem: Jira link written back by n8n
};

// Polling config
const POLL_INTERVAL_MS = 3000;   // Check every 3 seconds
const POLL_TIMEOUT_MS = 120000;  // Give up after 2 minutes

// Smart Label Mapping based on Type of Issue + Keywords
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
 */
function selectLabels(typeOfIssue, issueName, description = '') {
  const normalizedType = normalizeTypeOfIssue(typeOfIssue);
  const config = LABEL_MAPPING[normalizedType];
  
  if (!config) {
    console.log(`Unknown Type of Issue: "${typeOfIssue}" (normalized: "${normalizedType}"), using fallback`);
    return ["Productloc-bug"];
  }
  
  const textToSearch = `${issueName} ${description}`.toLowerCase();
  const matchedLabels = new Set();
  
  for (const [pattern, label] of Object.entries(config.keywords)) {
    const regex = new RegExp(pattern, 'i');
    if (regex.test(textToSearch)) {
      matchedLabels.add(label);
    }
  }
  
  return matchedLabels.size > 0 ? Array.from(matchedLabels) : config.default;
}

function App() {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [data, setData] = useState(null);
  const [copiedField, setCopiedField] = useState(null);
  const [creating, setCreating] = useState(false);
  const [jiraResult, setJiraResult] = useState(null);
  const [userEmail, setUserEmail] = useState(null);

  useEffect(() => {
    monday.execute('valueCreatedForUser');

    monday.listen('context', async (res) => {
      console.log('Full Context:', JSON.stringify(res.data, null, 2));

      // El itemId puede venir en diferentes lugares según el tipo de feature
      const itemId = res.data.itemId 
        || res.data.itemIds?.[0] 
        || res.data.focusedItems?.[0]?.itemId
        || res.data.selectedItems?.[0]?.itemId;
      
      console.log('Extracted itemId:', itemId);
      
      if (itemId) {
        await fetchItemData(itemId);
      } else {
        setError(`No se encontró itemId. Contexto recibido: ${JSON.stringify(res.data, null, 2)}`);
        setLoading(false);
      }
    });
  }, []);

  const fetchItemData = async (subitemId) => {
    try {
      // 1. Obtener datos del subitem usando query simplificada
      const subitemQuery = `
        query {
          items(ids: [${subitemId}]) {
            name
            board {
              id
            }
            parent_item {
              id
              name
              column_values {
                id
                text
                value
              }
            }
            column_values {
              id
              text
            }
            updates(limit: 20) {
              id
              body
              created_at
            }
          }
        }
      `;

      const subitemResult = await monday.api(subitemQuery);

      if (!subitemResult.data?.items?.length) {
        throw new Error('Subitem no encontrado');
      }

      const subitem = subitemResult.data.items[0];
      const parentItem = subitem.parent_item;

      // Función para extraer Space del link de Jira
      // Formato 1: https://wix.atlassian.net/browse/DOM2-6298 → DOM2
      // Formato 2: https://wix.atlassian.net/issues/?filter=-1&selectedIssue=DOM2-6333 → DOM2
      const extractSpaceFromJiraLink = (url) => {
        if (!url) return '';
        
        // Intentar extraer de selectedIssue parameter
        const urlParams = url.match(/selectedIssue=([A-Z0-9]+)-\d+/i);
        if (urlParams) {
          return urlParams[1].toUpperCase();
        }
        
        // Intentar extraer del path /browse/XXX-123
        const pathMatch = url.match(/\/browse\/([A-Z0-9]+)-\d+/i);
        if (pathMatch) {
          return pathMatch[1].toUpperCase();
        }
        
        // Fallback: buscar cualquier patrón XXX-123 en la URL
        const genericMatch = url.match(/([A-Z0-9]+)-\d+/i);
        return genericMatch ? genericMatch[1].toUpperCase() : '';
      };

      // Obtener columnas del item padre
      const getParentColumnText = (columnId) => {
        if (!parentItem?.column_values) return '';
        const col = parentItem.column_values.find(c => c.id === columnId);
        return col?.text || '';
      };

      // Extraer reporter email de la columna Person del parent item
      let reporterEmail = null;
      const personCol = parentItem?.column_values?.find(c => c.id === 'person');
      if (personCol?.value) {
        try {
          const personData = JSON.parse(personCol.value);
          const personId = personData.personsAndTeams?.[0]?.id;
          if (personId) {
            const userResult = await monday.api(`query { users(ids: [${personId}]) { email } }`);
            reporterEmail = userResult.data?.users?.[0]?.email || null;
            console.log('Reporter email from Person column:', reporterEmail);
          }
        } catch (e) {
          console.error('Error getting reporter email:', e);
        }
      }
      if (reporterEmail) {
        setUserEmail(reporterEmail);
      }

      // Extraer Space del link de Jira
      const jiraLinkUrl = getParentColumnText(COLUMN_IDS.jiraLink);
      const extractedSpace = extractSpaceFromJiraLink(jiraLinkUrl);
      
      // Si no se encuentra el Space, mostrar la URL para debug
      const space = extractedSpace || (jiraLinkUrl ? `⚠️ No encontrado en: ${jiraLinkUrl}` : 'No Jira link found');

      // 2. Extraer datos de las columnas
      const getColumnText = (columnId) => {
        const col = subitem.column_values.find(c => c.id === columnId);
        return col?.text || '';
      };

      // 3. Obtener el update más antiguo
      let oldestUpdate = null;
      if (subitem.updates?.length > 0) {
        const sortedUpdates = [...subitem.updates].sort(
          (a, b) => new Date(a.created_at) - new Date(b.created_at)
        );
        oldestUpdate = sortedUpdates[0];
      }

      // 4. Parsear description y screenshot del update
      const { description: updateDescription, screenshot } = parseUpdateBody(
        oldestUpdate?.body || ''
      );

      // 5. Construir los campos formateados
      const rawItemName = parentItem?.name || 'Unknown';
      const rawSubitemName = subitem.name;
      
      // Limpiar "LQA" del nombre del item y subitem
      const cleanLQA = (text) => text
        .replace(/\s*-?\s*LQA\s*-?\s*/gi, ' ')
        .replace(/\s+/g, ' ')
        .trim();
      
      // Hacer el texto impersonal para el summary de Jira
      const makeImpersonal = (text) => {
        let result = text.trim();
        
        // Patrones a transformar (de personal a impersonal)
        const transformations = [
          // "I cannot/can't" → "Cannot"
          [/^I\s+can'?t\s+/i, 'Cannot '],
          [/^I\s+cannot\s+/i, 'Cannot '],
          // "I am not able to" → "Unable to"
          [/^I\s+am\s+not\s+able\s+to\s+/i, 'Unable to '],
          [/^I\s+am\s+unable\s+to\s+/i, 'Unable to '],
          // "I can not" → "Cannot"
          [/^I\s+can\s+not\s+/i, 'Cannot '],
          // "I see/found/noticed/have" → remove and capitalize next word
          [/^I\s+see\s+/i, ''],
          [/^I\s+found\s+/i, ''],
          [/^I\s+noticed\s+/i, ''],
          [/^I\s+have\s+/i, ''],
          [/^I\s+got\s+/i, ''],
          [/^I\s+get\s+/i, ''],
          [/^I\s+am\s+seeing\s+/i, ''],
          [/^I\s+am\s+getting\s+/i, ''],
          // "We see/found/noticed" → remove
          [/^We\s+see\s+/i, ''],
          [/^We\s+found\s+/i, ''],
          [/^We\s+noticed\s+/i, ''],
          [/^We\s+have\s+/i, ''],
          [/^We\s+can'?t\s+/i, 'Cannot '],
          [/^We\s+cannot\s+/i, 'Cannot '],
          // "User cannot" → keep as is (already impersonal)
          // "There is/are" → keep as is
          // Generic "I am" → remove
          [/^I\s+am\s+/i, ''],
          // Just "I" at start followed by verb
          [/^I\s+/i, ''],
        ];
        
        for (const [pattern, replacement] of transformations) {
          if (pattern.test(result)) {
            result = result.replace(pattern, replacement);
            break; // Only apply first matching transformation
          }
        }
        
        // Capitalize first letter
        if (result.length > 0) {
          result = result.charAt(0).toUpperCase() + result.slice(1);
        }
        
        return result;
      };
      
      const itemName = cleanLQA(rawItemName);
      const subitemName = makeImpersonal(cleanLQA(rawSubitemName));
      
      const languages = getColumnText(COLUMN_IDS.language) || 'All languages';
      const priority = getColumnText(COLUMN_IDS.priority) || 'Medium';
      const typeOfIssue = getColumnText(COLUMN_IDS.typeOfIssue) || 'Bug';

      // Smart label selection based on Type of Issue + keywords
      const labels = selectLabels(typeOfIssue, rawSubitemName, updateDescription);
      console.log(`Type of Issue: "${typeOfIssue}" → Labels: [${labels.join(', ')}]`);

      // Summary: [LOC] item_name LQA - subitem_name
      const summary = `[LOC] ${itemName} LQA - ${subitemName}`;

      // Description formateada
      const description = `Hi!

We are done with the LQA for ${itemName}. We have found this issue:

Issue: ${updateDescription || subitemName}
Affected languages: ${languages}

Screenshot:
${screenshot || 'No screenshot available'}

Thanks!`;

      // Check if a Jira ticket was already created for this subitem
      const existingJiraLink = getColumnText(COLUMN_IDS.jiraIssueLink);

      setData({
        space,
        summary,
        description,
        priority,
        labels,
        typeOfIssue,
        screenshot,
        languages,
        rawUpdateBody: oldestUpdate?.body || 'No updates found',
        // Needed for Monday column writes
        subitemId: subitemId,
        boardId: subitem.board?.id || '',
        existingJiraLink
      });

    } catch (err) {
      console.error('Error fetching data:', err);
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  // Parsear el body HTML del update de Monday
  const parseUpdateBody = (htmlBody) => {
    if (!htmlBody) return { description: '', screenshot: '' };

    // Limpiar HTML
    const textContent = htmlBody
      .replace(/<br\s*\/?>/gi, '\n')
      .replace(/<[^>]*>/g, '')
      .trim();

    let description = '';
    let screenshot = '';

    // Extraer Description (buscar después de "Description:" hasta Screenshot, Thanks, o fin)
    const descMatch = textContent.match(/Description:\s*(.+?)(?=Screenshot:|Thanks|$)/is);
    if (descMatch) {
      description = descMatch[1].trim();
    }

    // Extraer Screenshot URL (buscar cualquier URL)
    const urlMatch = textContent.match(/(https?:\/\/[^\s]+)/i);
    if (urlMatch) {
      screenshot = urlMatch[1].trim();
    }

    return { description, screenshot };
  };

  const copyToClipboard = async (text, fieldName) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopiedField(fieldName);
      monday.execute('notice', {
        message: `${fieldName} copiado al portapapeles!`,
        type: 'success',
        timeout: 1500
      });
      setTimeout(() => setCopiedField(null), 2000);
    } catch (e) {
      // Fallback para navegadores que no soportan clipboard API
      const textarea = document.createElement('textarea');
      textarea.value = text;
      document.body.appendChild(textarea);
      textarea.select();
      document.execCommand('copy');
      document.body.removeChild(textarea);
      setCopiedField(fieldName);
      setTimeout(() => setCopiedField(null), 2000);
    }
  };

  // Extract Jira key from a URL like https://wix.atlassian.net/browse/DOM2-6742
  const extractKeyFromUrl = (url) => {
    if (!url) return url;
    const match = url.match(/\/browse\/([A-Z0-9]+-\d+)/i);
    return match ? match[1].toUpperCase() : url;
  };

  // Poll the subitem's Jira link column until it gets a value
  const pollForJiraLink = (subitemId) => {
    return new Promise((resolve) => {
      const startTime = Date.now();
      const interval = setInterval(async () => {
        try {
          const query = `query { items(ids: [${subitemId}]) { column_values(ids: ["${COLUMN_IDS.jiraIssueLink}"]) { text value } } }`;
          const result = await monday.api(query);
          const col = result.data?.items?.[0]?.column_values?.[0];

          // Extract URL from value (JSON: {"url":"...","text":"..."}) or fallback to text
          let jiraUrl = null;
          if (col?.value) {
            try {
              const parsed = JSON.parse(col.value);
              jiraUrl = parsed.url || null;
            } catch (e) {}
          }
          if (!jiraUrl && col?.text) {
            // Fallback: extract URL from text like "DOM2-6747 - https://..."
            const urlMatch = col.text.match(/(https:\/\/[^\s]+)/);
            jiraUrl = urlMatch ? urlMatch[1] : null;
          }

          if (jiraUrl && jiraUrl.includes('atlassian.net')) {
            clearInterval(interval);
            resolve(jiraUrl);
          } else if (Date.now() - startTime > POLL_TIMEOUT_MS) {
            clearInterval(interval);
            resolve(null);
          }
        } catch (err) {
          console.error('Polling error:', err);
          if (Date.now() - startTime > POLL_TIMEOUT_MS) {
            clearInterval(interval);
            resolve(null);
          }
        }
      }, POLL_INTERVAL_MS);
    });
  };

  const createJiraTicket = async () => {
    setCreating(true);
    setError(null);
    try {
      // 1. Write the ticket data as JSON to the Jira Request column
      const requestData = JSON.stringify({
        projectKey: data.space,
        summary: data.summary,
        description: data.description,
        issueType: 'Bug',
        labels: data.labels,
        reporterEmail: userEmail,
        subitemId: data.subitemId,
        boardId: data.boardId
      });

      const columnValue = JSON.stringify({ text: requestData });

      const mutation = `
        mutation {
          change_column_value(
            board_id: ${data.boardId},
            item_id: ${data.subitemId},
            column_id: "${COLUMN_IDS.jiraRequest}",
            value: ${JSON.stringify(columnValue)}
          ) {
            id
          }
        }
      `;

      await monday.api(mutation);
      console.log('Jira request written to Monday column');

      // 2. Poll for the Jira link to appear
      const jiraUrl = await pollForJiraLink(data.subitemId);

      if (jiraUrl) {
        const jiraKey = extractKeyFromUrl(jiraUrl);
        setJiraResult({ jiraKey, jiraUrl });
        monday.execute('notice', {
          message: `Jira ticket ${jiraKey} created!`,
          type: 'success',
          timeout: 3000
        });
      } else {
        setError('Timeout waiting for n8n to create the ticket. Check that the n8n workflow is active.');
      }
    } catch (err) {
      console.error('Error creating Jira ticket:', err);
      setError(`Error: ${err.message}`);
    } finally {
      setCreating(false);
    }
  };

  if (loading) {
    return (
      <div className="loading-container">
        <div className="spinner"></div>
        <p>Cargando datos del item...</p>
      </div>
    );
  }

  if (error && !data) {
    return (
      <div className="error-container">
        <span className="error-icon">⚠️</span>
        <p>{error}</p>
      </div>
    );
  }

  if (jiraResult) {
    return (
      <div className="app-container">
        <div className="success-container">
          <div className="success-icon">&#10003;</div>
          <h2>Jira Ticket Created</h2>
          <a
            className="jira-link"
            href={jiraResult.jiraUrl}
            target="_blank"
            rel="noopener noreferrer"
          >
            {jiraResult.jiraKey}
          </a>
          <p className="success-summary">{data.summary}</p>
          <div className="success-actions">
            <button
              className="btn btn-primary"
              onClick={() => {
                copyToClipboard(jiraResult.jiraUrl, 'Jira URL');
              }}
            >
              {copiedField === 'Jira URL' ? 'Copied!' : 'Copy Link'}
            </button>
            <button
              className="btn btn-secondary"
              onClick={() => monday.execute('closeAppFeatureModal')}
            >
              Close
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="app-container">
      <header className="header">
        <div className="logo">
          <svg viewBox="0 0 32 32" width="28" height="28">
            <defs>
              <linearGradient id="jira-gradient" x1="0%" y1="0%" x2="100%" y2="100%">
                <stop offset="0%" stopColor="#0052CC"/>
                <stop offset="100%" stopColor="#2684FF"/>
              </linearGradient>
            </defs>
            <path fill="url(#jira-gradient)" d="M26.7 15.3l-10-10a1 1 0 00-1.4 0l-10 10a1 1 0 000 1.4l10 10a1 1 0 001.4 0l10-10a1 1 0 000-1.4zM16 20l-4-4 4-4 4 4-4 4z"/>
          </svg>
        </div>
        <div className="header-text">
          <h1>Create Jira Ticket</h1>
          <p>Review the fields below, then create the ticket</p>
          {userEmail ? (
            <p style={{ fontSize: '11px', color: '#666' }}>Reporter: {userEmail}</p>
          ) : (
            <p style={{ fontSize: '11px', color: '#e53935' }}>Reporter email not detected</p>
          )}
        </div>
      </header>

      {data.existingJiraLink && (
        <div className="inline-error" style={{ background: '#e3f2fd', color: '#1565c0', borderColor: '#90caf9' }}>
          <span>ℹ️</span> A Jira ticket already exists:{' '}
          <a href={data.existingJiraLink} target="_blank" rel="noopener noreferrer">
            {extractKeyFromUrl(data.existingJiraLink)}
          </a>
        </div>
      )}

      <main className="fields-container">
        <CopyableField
          label="Space"
          value={data.space}
          onCopy={() => copyToClipboard(data.space, 'Space')}
          copied={copiedField === 'Space'}
        />

        <CopyableField
          label="Summary"
          value={data.summary}
          onCopy={() => copyToClipboard(data.summary, 'Summary')}
          copied={copiedField === 'Summary'}
        />

        <CopyableField
          label="Description"
          value={data.description}
          onCopy={() => copyToClipboard(data.description, 'Description')}
          copied={copiedField === 'Description'}
          multiline
        />

        <CopyableField
          label="Priority"
          value={data.priority}
          onCopy={() => copyToClipboard(data.priority, 'Priority')}
          copied={copiedField === 'Priority'}
        />

        <div className="labels-section">
          <label className="field-label">Labels ({data.labels?.length || 0})</label>
          <div className="labels-container">
            {data.labels?.map((lbl, idx) => (
              <div key={idx} className="label-chip">
                <span className="label-text">{lbl}</span>
                <button
                  className={`copy-btn-small ${copiedField === `Label-${idx}` ? 'copied' : ''}`}
                  onClick={() => copyToClipboard(lbl, `Label-${idx}`)}
                  title={`Copy ${lbl}`}
                >
                  {copiedField === `Label-${idx}` ? '✓' : '📋'}
                </button>
              </div>
            ))}
          </div>
          <button
            className="copy-all-labels-btn"
            onClick={() => copyToClipboard(data.labels?.join(', ') || '', 'All Labels')}
          >
            {copiedField === 'All Labels' ? '✓ Copied!' : '📋 Copy All Labels'}
          </button>
          <p className="type-hint">Type of Issue: {data.typeOfIssue}</p>
        </div>
      </main>

      {error && (
        <div className="inline-error">
          <span>⚠️</span> {error}
        </div>
      )}

      <footer className="footer">
        <button
          className="btn btn-secondary"
          onClick={() => {
            const allFields = `Space: ${data.space}\n\nSummary: ${data.summary}\n\nDescription:\n${data.description}\n\nPriority: ${data.priority}\nLabels: ${data.labels?.join(', ') || ''}`;
            copyToClipboard(allFields, 'All Fields');
          }}
        >
          {copiedField === 'All Fields' ? 'Copied!' : 'Copy All Fields'}
        </button>
        <button
          className="btn btn-primary btn-create"
          onClick={createJiraTicket}
          disabled={creating || !!data.existingJiraLink}
        >
          {creating ? (
            <>
              <span className="btn-spinner"></span>
              Waiting for n8n...
            </>
          ) : data.existingJiraLink ? (
            'Ticket Already Created'
          ) : (
            'Create Jira Ticket'
          )}
        </button>
      </footer>
    </div>
  );
}

function CopyableField({ label, value, onCopy, copied, multiline }) {
  return (
    <div className="field">
      <label className="field-label">{label}</label>
      <div className="field-row">
        {multiline ? (
          <textarea className="field-input" readOnly value={value} rows={5} />
        ) : (
          <input className="field-input" readOnly value={value} />
        )}
        <button
          className={`copy-btn ${copied ? 'copied' : ''}`}
          onClick={onCopy}
          title={`Copy ${label}`}
        >
          {copied ? '✓' : '📋'}
        </button>
      </div>
    </div>
  );
}

export default App;
