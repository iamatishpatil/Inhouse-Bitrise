// src/services/ai.service.js
const { GoogleGenerativeAI } = require("@google/generative-ai");
const pool = require("../config/db");

// Initialize Gemini API
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY || '');

// Define tools for Gemini
const buildTool = {
  name: "trigger_build",
  description: "Trigger a build for a project in Ddeploy.",
  parameters: {
    type: "object",
    properties: {
      project_name: {
        type: "string",
        description: "The name of the project (e.g., 'ttf-frontend'). Fuzzy matching is used.",
      },
      workflow_name: {
        type: "string",
        description: "The name of the workflow (e.g., 'staging ios'). Fuzzy matching is used.",
      },
      branch: {
        type: "string",
        description: "The branch to build (e.g., 'main').",
      },
    },
    required: ["project_name", "workflow_name", "branch"],
  },
};

const workflowTool = {
  name: "create_workflow",
  description: "Create a new CI/CD workflow for a project in Ddeploy.",
  parameters: {
    type: "object",
    properties: {
      project_name: {
        type: "string",
        description: "The name of the project to add the workflow to. Fuzzy matching is used.",
      },
      name: {
        type: "string",
        description: "The name of the new workflow (e.g., 'Production Deploy').",
      },
      platform: {
        type: "string",
        description: "The platform of the workflow (e.g., 'android', 'ios', 'web').",
      },
      yml_config: {
        type: "string",
        description: "The full YAML configuration string for the workflow (e.g. Fastlane or script).",
      },
    },
    required: ["project_name", "name", "platform", "yml_config"],
  },
};

const stopBuildTool = {
  name: "stop_build",
  description: "Abort or stop a currently running or pending build for a project.",
  parameters: {
    type: "object",
    properties: {
      project_name: {
        type: "string",
        description: "The name of the project (e.g., 'ttf-frontend'). Fuzzy matching is used.",
      },
      build_number: {
        type: "integer",
        description: "The specific build number to stop.",
      }
    },
  },
};

const enableAutoTriggerTool = {
  name: "enable_auto_trigger",
  description: "Enable automatic build triggering on GitHub push for a project.",
  parameters: {
    type: "object",
    properties: {
      project_name: {
        type: "string",
        description: "The name of the project. Fuzzy matching is used.",
      },
      branch: {
        type: "string",
        description: "The name of the GitHub branch to watch (e.g., 'main', 'release').",
      },
    },
    required: ["project_name", "branch"],
  },
};

const disableAutoTriggerTool = {
  name: "disable_auto_trigger",
  description: "Disable automatic build triggering for a project.",
  parameters: {
    type: "object",
    properties: {
      project_name: {
        type: "string",
        description: "The name of the project. Fuzzy matching is used.",
      },
    },
    required: ["project_name"],
  },
};

const tools = [
  {
    functionDeclarations: [buildTool, workflowTool, stopBuildTool, enableAutoTriggerTool, disableAutoTriggerTool],
  },
];

// Execute the `trigger_build` tool
async function executeTriggerBuild({ project_name, workflow_name, branch }) {
  try {
    let projectRes;
    if (project_name) {
      projectRes = await pool.query("SELECT id, name FROM projects WHERE name ILIKE $1 LIMIT 1", [`%${project_name}%`]);
    } else {
      projectRes = await pool.query("SELECT id, name FROM projects LIMIT 1");
    }

    if (projectRes.rows.length === 0) {
      return { success: false, message: project_name ? `Error: Project matching '${project_name}' not found.` : `Error: No projects found.` };
    }

    const project = projectRes.rows[0];

    const workflowRes = await pool.query(
      "SELECT id, name, platform FROM workflows WHERE project_id = $1 AND name ILIKE $2 LIMIT 1",
      [project.id, `%${workflow_name}%`]
    );

    if (workflowRes.rows.length === 0) {
      return { success: false, message: `Error: Workflow matching '${workflow_name}' not found in project '${project.name}'.` };
    }

    const workflow = workflowRes.rows[0];

    const buildNumberRes = await pool.query(
      "SELECT GREATEST(COALESCE(MAX(build_number), 0) + 1, 600) as next_number FROM builds WHERE project_id = $1",
      [project.id]
    );
    const buildNumber = buildNumberRes.rows[0].next_number;

    const buildRes = await pool.query(
      `INSERT INTO builds (project_id, workflow_id, status, branch, build_number, platform, trigger_source)
       VALUES ($1, $2, $3, $4, $5, $6, 'api')
       RETURNING id`,
      [project.id, workflow.id, 'pending', branch, buildNumber, workflow.platform || 'android']
    );

    const buildId = buildRes.rows[0].id;
    await pool.query(`NOTIFY new_build, '${buildId}'`);

    return { 
      success: true, 
      message: `Successfully triggered build #${buildNumber} for project '${project.name}' using workflow '${workflow.name}' on branch '${branch}'. Build ID: ${buildId}` 
    };
  } catch (error) {
    console.error("Error in trigger_build:", error);
    return { success: false, message: `Database error occurred: ${error.message}` };
  }
}

// Execute the `create_workflow` tool
async function executeCreateWorkflow({ project_name, name, platform, yml_config }) {
  try {
    const projectRes = await pool.query(
      "SELECT id, name FROM projects WHERE name ILIKE $1 LIMIT 1",
      [`%${project_name}%`]
    );

    if (projectRes.rows.length === 0) {
      return { success: false, message: `Error: Project matching '${project_name}' not found.` };
    }

    const project = projectRes.rows[0];

    const result = await pool.query(
      `INSERT INTO workflows (project_id, name, steps, yml_config, platform)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING id`,
      [project.id, name, JSON.stringify([]), yml_config, platform]
    );

    return { 
      success: true, 
      message: `Successfully created workflow '${name}' for project '${project.name}'. Workflow ID: ${result.rows[0].id}` 
    };
  } catch (error) {
    console.error("Error in create_workflow:", error);
    return { success: false, message: `Database error occurred: ${error.message}` };
  }
}

// Execute the `stop_build` tool
async function executeStopBuild({ project_name, build_number }) {
  try {
    let projectId = null;
    let projectName = project_name;

    if (project_name) {
      const projectRes = await pool.query(
        "SELECT id, name FROM projects WHERE name ILIKE $1 LIMIT 1",
        [`%${project_name}%`]
      );
      if (projectRes.rows.length === 0) return { success: false, message: `Error: Project matching '${project_name}' not found.` };
      projectId = projectRes.rows[0].id;
      projectName = projectRes.rows[0].name;
    }

    let query = `UPDATE builds SET status = $1, finished_at = NOW(), logs = COALESCE(logs, '') || '\n🚨 ABORTED: Build stopped by AI assistant.\n'
       WHERE status IN ('pending', 'running', 'pending_deploy', 'deploying', 'pending_testflight', 'deploying_testflight')`;
    let params = ['failed'];

    if (projectId && build_number) {
      query += ` AND project_id = $2 AND build_number = $3 RETURNING id`;
      params.push(projectId, build_number);
    } else if (projectId) {
      query += ` AND project_id = $2 RETURNING id`;
      params.push(projectId);
    } else if (build_number) {
      query += ` AND build_number = $2 RETURNING id`;
      params.push(build_number);
    } else {
      return { success: false, message: "Please specify a project name or build number to stop." };
    }

    const result = await pool.query(query, params);

    if (result.rows.length > 0) {
      const buildId = result.rows[0].id;
      try {
        await pool.query(`NOTIFY abort_build, '${buildId}'`);
      } catch (e) {
        // ignore
      }
      return { success: true, message: `Successfully stopped build${build_number ? ` #${build_number}` : ''}${projectName ? ` for project '${projectName}'` : ''}.` };
    } else {
      return { success: false, message: `No currently running or pending builds found matching your request.` };
    }
  } catch (error) {
    return { success: false, message: `Database error occurred: ${error.message}` };
  }
}

// Execute the `enable_auto_trigger` tool
async function executeEnableAutoTrigger({ project_name, branch }) {
  try {
    let projectRes;
    if (project_name) {
      projectRes = await pool.query("SELECT id, name FROM projects WHERE name ILIKE $1 LIMIT 1", [`%${project_name}%`]);
    } else {
      projectRes = await pool.query("SELECT id, name FROM projects LIMIT 1");
    }
    if (projectRes.rows.length === 0) return { success: false, message: project_name ? `Error: Project matching '${project_name}' not found.` : `Error: No projects found.` };
    const project = projectRes.rows[0];

    await pool.query(
      "UPDATE projects SET auto_trigger_enabled = true, auto_trigger_branch = $1 WHERE id = $2",
      [branch, project.id]
    );

    return { success: true, message: `Successfully enabled auto-trigger for project '${project.name}' on branch '${branch}'.` };
  } catch (error) {
    return { success: false, message: `Database error occurred: ${error.message}` };
  }
}

// Execute the `disable_auto_trigger` tool
async function executeDisableAutoTrigger({ project_name }) {
  try {
    let projectRes;
    if (project_name) {
      projectRes = await pool.query("SELECT id, name FROM projects WHERE name ILIKE $1 LIMIT 1", [`%${project_name}%`]);
    } else {
      projectRes = await pool.query("SELECT id, name FROM projects LIMIT 1");
    }
    if (projectRes.rows.length === 0) return { success: false, message: project_name ? `Error: Project matching '${project_name}' not found.` : `Error: No projects found.` };
    const project = projectRes.rows[0];

    await pool.query(
      "UPDATE projects SET auto_trigger_enabled = false, auto_trigger_branch = NULL WHERE id = $1",
      [project.id]
    );

    return { success: true, message: `Successfully disabled auto-trigger for project '${project.name}'.` };
  } catch (error) {
    return { success: false, message: `Database error occurred: ${error.message}` };
  }
}

// Main function to handle chat message and tool calls
async function handleChatMessage(message, history = []) {
  if (!process.env.GEMINI_API_KEY) {
    throw new Error("GEMINI_API_KEY is not configured.");
  }

  // Use gemini-2.5-flash.
  // 3.5-flash and latest are throwing 503s due to global overload.
  // 2.0-flash and 2.5-pro are throwing 429 quota 0 errors on this free tier key.
  const model = genAI.getGenerativeModel({
    model: "gemini-2.5-flash",
    tools: tools,
    systemInstruction: "You are Ddeploy AI, a helpful CI/CD assistant. You can trigger builds and create workflows for users. When asked to create a workflow, try to generate a reasonable YML config for it."
  });

  // Convert generic history to Gemini expected format
  // Gemini expects: { role: "user" | "model", parts: [{ text: "..." }] }
  let formattedHistory = history.map(msg => ({
    role: msg.role === "ai" ? "model" : "user",
    parts: [{ text: msg.text || "" }]
  }));

  // Gemini requires the first message in history to be from the 'user'
  while (formattedHistory.length > 0 && formattedHistory[0].role === "model") {
    formattedHistory.shift();
  }

  const chatSession = model.startChat({
    history: formattedHistory,
  });

  // Send the user's message with exponential backoff for 503 errors
  let result;
  let retries = 3;
  let delay = 2000;
  
  for (let i = 0; i < retries; i++) {
    try {
      result = await chatSession.sendMessage(message);
      break;
    } catch (err) {
      if (err.status === 503 && i < retries - 1) {
        console.warn(`[AI] Google Gemini 503 Overload. Retrying in ${delay}ms...`);
        await new Promise(res => setTimeout(res, delay));
        delay *= 2;
      } else {
        throw err;
      }
    }
  }
  
  // Check if Gemini wants to call a function
  const functionCalls = result.response.functionCalls();
  
  if (functionCalls && functionCalls.length > 0) {
    const call = functionCalls[0]; // Handle first tool call
    let toolResponse;
    
    if (call.name === "trigger_build") {
      toolResponse = await executeTriggerBuild(call.args);
    } else if (call.name === "create_workflow") {
      toolResponse = await executeCreateWorkflow(call.args);
    } else if (call.name === "stop_build") {
      toolResponse = await executeStopBuild(call.args);
    } else if (call.name === "enable_auto_trigger") {
      toolResponse = await executeEnableAutoTrigger(call.args);
    } else if (call.name === "disable_auto_trigger") {
      toolResponse = await executeDisableAutoTrigger(call.args);
    } else {
      toolResponse = { success: false, message: "Unknown function call." };
    }

    // Send the function result back to the model in the background so it stays in history
    // We intentionally do not await this, to return the UI response instantly!
    chatSession.sendMessage([{
      functionResponse: {
        name: call.name,
        response: toolResponse
      }
    }]).catch(err => console.error("Background Gemini sync failed:", err));

    return {
      text: toolResponse.message, // Return the raw tool success message instantly
      toolResponse
    };
  }

  // If no function call, just return the text
  return {
    text: result.response.text()
  };
}

module.exports = {
  handleChatMessage
};
