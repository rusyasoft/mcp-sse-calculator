import express from "express";
import { randomUUID } from "node:crypto";
import { McpServer, ResourceTemplate } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { isInitializeRequest } from "@modelcontextprotocol/sdk/types.js";
import { z } from "zod";



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
            { name: "date-formatting", uri: "docs://date-formatting", description: "Date formatting documentation" }
          ]
        })
      }),
      async (uri, { topic }) => ({
        contents: [{
          uri: uri.href,
          text: `Documentation for ${topic}\n\nThis is a sample documentation resource for the ${topic} feature.`
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

