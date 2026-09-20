// src/services/teamsNotifier.js
// ─────────────────────────────────────────────────────────────────────────────
// Microsoft Teams Notifier — Sends build link cards to a Teams channel
// via Power Automate "Send webhook alerts to a channel" workflow.
// ─────────────────────────────────────────────────────────────────────────────

const axios = require('axios');

const sendBuildCard = async (buildInfo) => {
  const webhookUrl = process.env.TEAMS_WEBHOOK_URL;

  if (!webhookUrl) {
    console.warn('⚠️ TEAMS_WEBHOOK_URL not configured. Skipping Teams notification.');
    return { success: false, reason: 'Webhook URL not configured' };
  }

  const {
    buildId,
    buildNumber,
    projectName,
    workflowName,
    platform,
    branch,
    version,
    status,
    artifactPath,
    buildUrl
  } = buildInfo;

  const platformName = platform === 'ios' ? 'iOS' : 'Android';
  const fileType = platform === 'ios' ? 'IPA' : 'APK';

  // Build download URL
  let downloadUrl = null;
  if (artifactPath) {
    if (artifactPath.startsWith('http')) {
      downloadUrl = artifactPath;
    } else {
      const baseUrl = process.env.MASTER_URL || 'http://localhost:5002';
      downloadUrl = `${baseUrl}${artifactPath}`;
    }
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Adaptive Card styled to match Ddeploy APK Bot card:
  //   🚀 New APK Build Ready
  //   Project: ttf
  //   Build Number: 342
  //   Install Page: <link>
  //   [Download APK] button
  // ─────────────────────────────────────────────────────────────────────────

  const cardBody = [
    {
      type: 'TextBlock',
      text: `🚀 New ${fileType} Build Ready`,
      weight: 'Bolder',
      size: 'Medium',
      wrap: true
    },
    {
      type: 'FactSet',
      facts: [
        { title: 'Project', value: projectName },
        { title: 'Build Number', value: `${buildNumber}` },
        { title: 'Branch', value: branch || 'main' },
        { title: 'Version', value: version || 'N/A' },
        { title: 'Platform', value: platformName },
        { title: 'Install Page', value: `[Open Install Page](${buildUrl})` }
      ]
    }
  ];

  const cardActions = [];
  const buttonTitle = platform === 'ios' ? 'View Build' : `Download ${fileType}`;

  cardActions.push({
    type: 'Action.OpenUrl',
    title: buttonTitle,
    url: buildUrl
  });

  const adaptiveCard = {
    $schema: 'http://adaptivecards.io/schemas/adaptive-card.json',
    type: 'AdaptiveCard',
    version: '1.2',
    body: cardBody,
    actions: cardActions
  };

  const payload = {
    type: 'message',
    attachments: [
      {
        contentType: 'application/vnd.microsoft.card.adaptive',
        contentUrl: null,
        content: adaptiveCard
      }
    ]
  };

  try {
    console.log(`📤 Sending build notification to Teams for Build #${buildNumber}...`);
    const response = await axios.post(webhookUrl, payload, {
      headers: { 'Content-Type': 'application/json' },
      timeout: 15000
    });
    console.log(`✅ Teams webhook responded: HTTP ${response.status}`);
    return { success: true };
  } catch (err) {
    console.error(`❌ Failed to send Teams notification:`, err.message);
    if (err.response) {
      console.error(`❌ Status: ${err.response.status}`);
      console.error(`❌ Body:`, JSON.stringify(err.response.data || '').slice(0, 500));
    }
    return { success: false, reason: err.message };
  }
};

module.exports = { sendBuildCard };
