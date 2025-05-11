# MCP Server with Node.js

This is a Model Context Protocol (MCP) server implemented with Node.js and Express. It provides calculator functionality and a book search feature using a SQLite database.

## Setup

1. Install dependencies:
   ```bash
   npm install
   ```

2. Create a books database schema in the data directory:
   ```bash
   mkdir -p data
   ```
   
   You'll need to create a SQLite database with a structure compatible with the query in the code, or modify the code to match your database structure.

3. Configure environment variables:
   Edit the `.env` file and add your OpenAI API key.

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

1. `add` - Simple addition of two numbers
2. `calculate` - Calculator with multiple operations (add, subtract, multiply, divide)
3. `searchBooks` - Search books in the database by various criteria

## Connect Claude Desktop to your MCP server

You can connect to your MCP server from Claude Desktop by following [Anthropic's Quickstart](https://modelcontextprotocol.io/quickstart/user) and within Claude Desktop go to Settings > Developer > Edit Config.

Update with this configuration:

```json
{
  "mcpServers": {
    "calculator": {
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
