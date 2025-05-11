import express from "express";
import { randomUUID } from "node:crypto";
import { McpServer, ResourceTemplate } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { isInitializeRequest } from "@modelcontextprotocol/sdk/types.js";
import { z } from "zod";
import { GoogleGenerativeAI } from "@google/generative-ai";
import { promises as fs } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";
import dotenv from "dotenv";

// Load environment variables from .env file
dotenv.config();

// Initialize Gemini API using the API key from environment variables
const GEMINI_API_KEY = process.env.GEMINI_API_KEY || '';
if (!GEMINI_API_KEY) {
  console.warn('Warning: GEMINI_API_KEY not found in environment variables. The nl-to-sql tool will not work properly.');
}
const genAI = new GoogleGenerativeAI(GEMINI_API_KEY);

// Get the directory path using import.meta.url (ESM approach)
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Load database schemas from files
async function loadDatabaseSchemas() {
  const schemasDir = join(__dirname, 'schemas');
  const schemaFiles = await fs.readdir(schemasDir);
  const schemas: Record<string, string> = {};
  
  for (const file of schemaFiles) {
    if (file.endsWith('.sql')) {
      const tableName = file.replace('.sql', '');
      const filePath = join(schemasDir, file);
      const content = await fs.readFile(filePath, 'utf-8');
      schemas[tableName] = content;
    }
  }
  
  return schemas;
}

// Store loaded schemas
let databaseSchemas: Record<string, string> = {};

const app = express();
app.use(express.json());

// Map to store transports by session ID
const transports: { [sessionId: string]: StreamableHTTPServerTransport } = {};

// Handle POST requests for client-to-server communication
app.post('/mcp', async (req, res) => {
  // Check for existing session ID
  const sessionId = req.headers['mcp-session-id'] as string | undefined;
  let transport: StreamableHTTPServerTransport;

  if (sessionId && transports[sessionId]) {
    // Reuse existing transport
    transport = transports[sessionId];
  } else if (!sessionId && isInitializeRequest(req.body)) {
    // New initialization request
    transport = new StreamableHTTPServerTransport({
      sessionIdGenerator: () => randomUUID(),
      onsessioninitialized: (sessionId) => {
        // Store the transport by session ID
        transports[sessionId] = transport;
      }
    });

    // Clean up transport when closed
    transport.onclose = () => {
      if (transport.sessionId) {
        delete transports[transport.sessionId];
      }
    };
    const server = new McpServer({
      name: "calculator-server",
      version: "1.0.0"
    });

    // Set up server resources
    server.resource(
      "docs",
      new ResourceTemplate("docs://{topic}", { 
        list: async () => ({
          resources: [
            { name: "math", uri: "docs://math", description: "Math documentation" },
            { name: "conversion", uri: "docs://conversion", description: "Unit conversion documentation" },
            { name: "date-formatting", uri: "docs://date-formatting", description: "Date formatting documentation" },
            { name: "sql", uri: "docs://sql", description: "SQL query generation documentation" }
          ]
        })
      }),
      async (uri, { topic }) => ({
        contents: [{
          uri: uri.href,
          text: topic === "sql" 
            ? `Documentation for SQL Query Generation\n\n` +
              `The nl-to-sql tool converts natural language queries to SQL statements based on the available database schemas.\n\n` +
              `Example Queries:\n\n` +
              `1. Employee Queries:\n` +
              `   - "Find all employees in the IT department with a salary over 70000"\n` +
              `   - "What's the average salary by department?"\n` +
              `   - "List the top 5 highest paid employees with their manager names"\n` +
              `   - "Which employees were hired in 2023?"\n` +
              `   - "Show me all employees that report to manager with ID 5"\n\n` +
              `2. Project Queries:\n` +
              `   - "List all projects that are currently in progress"\n` +
              `   - "Find projects with a budget over 100000 managed by employees from the IT department"\n` +
              `   - "Show all employees working on the Marketing Campaign project"\n` +
              `   - "What's the total budget for all completed projects?"\n\n` +
              `3. Complex Queries:\n` +
              `   - "Find departments with more than 5 employees where the average salary is above 60000"\n` +
              `   - "List employees that are both project managers and also assigned to work on other projects"\n` +
              `   - "Which employees are not assigned to any projects?"\n` +
              `   - "Show the salary difference between employees and their managers"\n\n` +
              `To use this tool, simply call it with your natural language query:\n\n` +
              `{\n` +
              `  "query": "Find all employees in the IT department with a salary over 70000"\n` +
              `}\n\n` +
              `Note: All database schemas are already loaded in the server. You don't need to provide them.`
            : `Documentation for ${topic}\n\nThis is a sample documentation resource for the ${topic} feature.`
        }]
      })
    );

    server.resource(
      "calculator-history",
      new ResourceTemplate("calculator-history://{userId}", { 
        list: async () => ({
          resources: [
            { name: "user1", uri: "calculator-history://user1", description: "Calculation history for user1" },
            { name: "user2", uri: "calculator-history://user2", description: "Calculation history for user2" },
            { name: "user3", uri: "calculator-history://user3", description: "Calculation history for user3" }
          ]
        })
      }),
      async (uri, { userId }) => ({
        contents: [{
          uri: uri.href,
          text: `Calculator history for user ${userId}\n\nThis would typically contain the calculation history for a specific user.`
        }]
      })
    );
    
    // Set up server tools
    server.tool(
      "calculate",
      { 
        expression: z.string().describe("The mathematical expression to evaluate"),
      },
      async ({ expression }) => {
        try {
          // Simple evaluation - in production you'd want to use a safer method
          const result = eval(expression.replace(/[^-()*+/0-9.]/g, ''));
          return {
            content: [{ type: "text", text: `Result: ${result}` }]
          };
        } catch (error) {
          return {
            content: [{ type: "text", text: `Error: Could not evaluate expression '${expression}'` }]
          };
        }
      }
    );
    
    server.tool(
      "convert",
      { 
        value: z.number().describe("The value to convert"),
        fromUnit: z.string().describe("The unit to convert from"),
        toUnit: z.string().describe("The unit to convert to")
      },
      async ({ value, fromUnit, toUnit }) => {
        // Unit conversion implementations
        const conversions: Record<string, Record<string, (val: number) => number>> = {
          "celsius": { "fahrenheit": (c: number) => c * 9/5 + 32 },
          "fahrenheit": { "celsius": (f: number) => (f - 32) * 5/9 },
          "kilometers": { "miles": (km: number) => km * 0.621371 },
          "miles": { "kilometers": (mi: number) => mi * 1.60934 },
          "kilograms": { "pounds": (kg: number) => kg * 2.20462 },
          "pounds": { "kilograms": (lb: number) => lb * 0.453592 }
        };
        
        try {
          if (conversions[fromUnit] && conversions[fromUnit][toUnit]) {
            const result = conversions[fromUnit][toUnit](value);
            const formatted = Number(result).toFixed(4);
            return {
              content: [{ type: "text", text: `${value} ${fromUnit} = ${formatted} ${toUnit}` }]
            };
          }
          return {
            content: [{ type: "text", text: `Error: Conversion from ${fromUnit} to ${toUnit} is not supported.` }]
          };
        } catch (error) {
          return {
            content: [{ type: "text", text: `Error during conversion: ${error}` }]
          };
        }
      }
    );
    
    server.tool(
      "format-date",
      { 
        date: z.string().optional().describe("Date string to format (defaults to current date)"),
        format: z.string().optional().describe("Format string (e.g., 'YYYY-MM-DD')"),
      },
      async ({ date, format }) => {
        try {
          const inputDate = date ? new Date(date) : new Date();
          const formattedDate = format ? formatDate(inputDate, format) : inputDate.toISOString();
          return {
            content: [{ type: "text", text: formattedDate }]
          };
        } catch (error) {
          return {
            content: [{ type: "text", text: `Error formatting date: ${error}` }]
          };
        }
      }
    );
    
    server.tool(
      "nl-to-sql",
      {
        query: z.string().describe(
          "Convert natural language to SQL for our HR database. " +
          "Available tables: employees (with personal details, salary, department_id, manager_id), " +
          "departments (id, name, location, budget), " +
          "projects (id, name, dates, status, budget), " +
          "employee_projects (assignments of employees to projects). " +
          "Examples: 'Find employees in IT earning over 70k', 'List projects ending this year', 'Show managers with most direct reports'"
        )
      },
      async ({ query }) => {
        try {
          const model = genAI.getGenerativeModel({ model: "gemini-2.0-flash" });
          
          // Prepare the prompt with schema information and the query
          let promptText = "You are a SQL expert that converts natural language queries to precise SQL. ";
          promptText += "Based on the following database schema:\n\n";
          
          // Add each schema definition to the prompt
          Object.entries(databaseSchemas).forEach(([tableName, ddl]) => {
            promptText += `Table: ${tableName}\n${ddl}\n\n`;
          });
          
          // Add the natural language query
          promptText += `Convert this natural language query to valid SQL:\n"${query}"\n\n`;
          promptText += "Respond only with the SQL query, no explanation or other text.";
          
          // Generate content using Gemini
          const result = await model.generateContent(promptText);
          const response = await result.response;
          const sqlQuery = response.text().trim();
          
          return {
            content: [
              { type: "text", text: sqlQuery },
              { type: "text", text: "\n\nGenerated from natural language query: " + query }
            ]
          };
        } catch (error) {
          console.error("Error in nl-to-sql tool:", error);
          return {
            content: [{ type: "text", text: `Error generating SQL from natural language: ${error.message || error}` }]
          };
        }
      }
    );
    
    // Helper for date formatting
    function formatDate(date: Date, format: string): string {
      const year = date.getFullYear().toString();
      const month = (date.getMonth() + 1).toString().padStart(2, '0');
      const day = date.getDate().toString().padStart(2, '0');
      const hours = date.getHours().toString().padStart(2, '0');
      const minutes = date.getMinutes().toString().padStart(2, '0');
      const seconds = date.getSeconds().toString().padStart(2, '0');
      
      return format
        .replace(/YYYY/g, year)
        .replace(/MM/g, month)
        .replace(/DD/g, day)
        .replace(/HH/g, hours)
        .replace(/mm/g, minutes)
        .replace(/ss/g, seconds);
    }
    
    // Set up server prompts
    server.prompt(
      "calculator-help",
      { topic: z.string().optional() },
      ({ topic }) => ({
        messages: [{
          role: "user",
          content: {
            type: "text",
            text: topic 
              ? `Please provide help on how to use the calculator for ${topic}` 
              : "Please provide general help on how to use the calculator features"
          }
        }]
      })
    );
    
    server.prompt(
      "generate-math-problem",
      { 
        difficulty: z.enum(["easy", "medium", "hard"]).default("medium"),
        topic: z.string().optional()
      },
      ({ difficulty, topic }) => ({
        messages: [{
          role: "user",
          content: {
            type: "text",
            text: `Generate a ${difficulty} math problem${topic ? ` about ${topic}` : ''}.`
          }
        }]
      })
    );
    //////

    // Connect to the MCP server
    await server.connect(transport);
  } else {
    // Invalid request
    res.status(400).json({
      jsonrpc: '2.0',
      error: {
        code: -32000,
        message: 'Bad Request: No valid session ID provided',
      },
      id: null,
    });
    return;
  }

  // Handle the request
  await transport.handleRequest(req, res, req.body);
});

// Load schemas before handling requests
loadDatabaseSchemas().then(schemas => {
  databaseSchemas = schemas;
  console.log(`Loaded ${Object.keys(schemas).length} database schema(s):`, Object.keys(schemas));
}).catch(error => {
  console.error('Error loading database schemas:', error);
});

// Reusable handler for GET and DELETE requests
const handleSessionRequest = async (req: express.Request, res: express.Response) => {
  const sessionId = req.headers['mcp-session-id'] as string | undefined;
  if (!sessionId || !transports[sessionId]) {
    res.status(400).send('Invalid or missing session ID');
    return;
  }
  
  const transport = transports[sessionId];
  await transport.handleRequest(req, res);
};

// Handle GET requests for server-to-client notifications via SSE
app.get('/mcp', handleSessionRequest);

// Handle DELETE requests for session termination
app.delete('/mcp', handleSessionRequest);

app.listen(3000);

