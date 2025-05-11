# MCP Server with Node.js

This is a Model Context Protocol (MCP) server implemented with Node.js and Express. It provides calculator functionality, date formatting, unit conversion, and natural language to SQL query conversion using Google's Gemini API.

## Setup

1. Install dependencies:
   ```bash
   npm install
   ```

2. Configure the Google Gemini API:
   - Get an API key from the [Google AI Studio](https://makersuite.google.com/)
   - Create a `.env` file in the project root by copying the example:
     ```bash
     cp .env.example .env
     ```
   - Open the `.env` file and add your Gemini API key:
     ```
     GEMINI_API_KEY=your_actual_api_key_here
     ```
   
   The server automatically loads the API key from the environment variables. If the key is not found, a warning will be displayed when starting the server.

## Running the server

```bash
# Development mode
npm run dev

# Production mode
npm run build
npm start
```

The server will start on port 3000 (or the port specified in your .env file).

## Endpoints

- MCP endpoint: http://localhost:3000/mcp
- SSE endpoint: http://localhost:3000/sse

## Available Tools

1. `calculate` - Evaluates mathematical expressions (e.g., '2 + 2 * 3')
2. `convert` - Converts values between different units (temperature, distance, weight)
3. `format-date` - Formats dates according to specified patterns
4. `nl-to-sql` - Converts natural language queries to SQL using Google's Gemini AI

### Natural Language to SQL Tool

The `nl-to-sql` tool enables you to generate SQL queries from natural language descriptions. It requires only one parameter:

- `query`: A natural language description of what data you want to query

The database schemas are loaded automatically from the server's `src/schemas` directory, so you don't need to provide them with each request.

#### Example Usage:

```javascript
// Example tool call
const result = await nlToSql({
  query: "Find all employees in the IT department with salary greater than 70000"
});
```

#### Available Database Schemas

The server includes the following database schemas:

1. **employees** - employee information including name, contact details, salary, etc.
2. **departments** - department information including name, location, and budget
3. **projects** - project information with associated departments and project managers
4. **employee_projects** - junction table showing which employees are assigned to which projects

#### How It Works:

1. The tool formats the provided schema and natural language query into a prompt
2. The prompt is sent to the Gemini API, which generates the corresponding SQL
3. The generated SQL is returned to the client

This approach scales to multiple tables and complex queries, as it leverages Gemini's understanding of SQL and database relations.

## Connect Claude Desktop to your MCP server

You can connect to your MCP server from Claude Desktop by following [Anthropic's Quickstart](https://modelcontextprotocol.io/quickstart/user) and within Claude Desktop go to Settings > Developer > Edit Config.

Update with this configuration:

```json
{
  "mcpServers": {
    "RustamMCP-Server": {
      "command": "npx",
      "args": [
        "mcp-remote",
        "http://localhost:3000/mcp" 
      ]
    }
  }
}
```

- Restart Claude and you should see the tools become available. (haven't tested yet)

- Have tested with Windsurf AI and it works
