# Webtools Interface Specification

This document describes the standardized interface for webtools that can be dynamically integrated into frontend applications.

## Overview

Webtools follow a consistent pattern that allows frontend applications to:
- Discover webtool capabilities through metadata
- Understand required inputs and optional context
- Execute webtools with proper validation
- Handle responses in a predictable format

## HTTP Methods

### GET - Webtool Metadata

Returns metadata about the webtool, including its purpose and schema definitions.

**Response Format:**
```json
{
  "name": "webtool_name",
  "description": "Human-readable description of what this webtool does",
  "actions": [
    {
      "name": "action_name",
      "description": "What this action does",
      "schema": { /* JSON Schema for this action's payload */ }
    }
  ],
  "configSchema": { /* JSON Schema for configuration */ },
  "defaultConfig": { /* Default configuration values */ }
}
```

### POST - Webtool Execution

Executes the webtool with provided parameters.

**Request Format:**
```json
{
  "session_id": "unique-session-identifier",
  "action": "action_name",
  "config": { /* Optional configuration object */ },
  "payload": { /* Required payload matching the action's schema */ }
}
```

## Schema Definitions

### Action Schemas

Each action in the `actions` array has its own schema that defines the expected payload structure:

```json
{
  "name": "action_name",
  "description": "What this action does",
  "schema": {
    "$schema": "http://json-schema.org/draft-07/schema#",
    "type": "object",
    "properties": {
      /* Action-specific payload properties */
    },
    "required": [ /* Required fields */ ]
  }
}
```

### Config Schema

The `configSchema` defines optional configuration that modifies webtool behavior:

```json
{
  "$schema": "http://json-schema.org/draft-07/schema#",
  "type": "object",
  "properties": {
    /* Webtool-specific configuration properties */
  }
}
```

### Default Config

The `defaultConfig` provides the default configuration values used when no custom config is provided.

## Key Concepts

### Session ID
- Used for tracking and correlating requests
- Helpful for logging, debugging, and analytics
- Does not affect function execution

### Key Concepts Explained

#### Actions
- Each webtool can expose multiple actions
- Actions represent different operations the webtool can perform
- Each action has its own name, description, and payload schema
- The POST request must specify which action to invoke

#### Config vs Payload
- **Payload**: The primary input data for the specific action
- **Config**: Optional configuration that modifies how the webtool behaves across all actions

### Examples

**Weather Webtool with Multiple Actions:**
```json
{
  "action": "get_current",
  "config": {
    "units": "metric",
    "language": "en"
  },
  "payload": {
    "location": "New York"
  }
}

// Another action on the same webtool
{
  "action": "get_forecast",
  "config": {
    "units": "metric",
    "language": "en"
  },
  "payload": {
    "location": "New York",
    "days": 7
  }
}
```

**Code Execution:**
```json
{
  "action": "execute",
  "config": {
    "runtime": "python3",
    "timeout": 30000
  },
  "payload": {
    "code": "print('Hello World')"
  }
}
```

**Web Search:**
```json
{
  "action": "search",
  "config": {
    "max_results": 10,
    "safe_search": true,
    "region": "us"
  },
  "payload": {
    "query": "latest technology news"
  }
}
```

## Frontend Integration

To integrate these webtools in a frontend:

1. **Discovery**: Make a GET request to retrieve webtool metadata
2. **Action Selection**: Present available actions to the user
3. **Schema Parsing**: Use the selected action's schema to build dynamic forms
4. **Execution**: POST with action name and properly formatted payload
5. **Response Handling**: Process the action-specific response format

### UI Generation Tips

- Display all available actions with their descriptions
- Use the selected action's `schema.properties` to generate input forms
- Use `configSchema.properties` to create advanced settings
- Display `defaultConfig` values as placeholders or defaults
- Show action and property descriptions as help text or tooltips
- Validate inputs against schemas before sending requests
- Handle both successful responses and error messages

### Error Handling

Webtools return appropriate HTTP status codes:
- `200`: Success
- `400`: Invalid input (validation errors)
- `500`: Internal server error

Error responses include a descriptive message:
```json
{
  "error": "Detailed error message"
}
```

Common errors:
- Missing or invalid action name
- Action not found in available actions
- Missing required payload fields
- Invalid payload data types or values

## Benefits

This standardized interface enables:
- **Dynamic UI Generation**: Build forms automatically from action schemas
- **Multi-Function Tools**: Single webtool can expose multiple related actions
- **Type Safety**: Validate inputs against action-specific schemas
- **Discoverability**: Webtools self-document all available actions
- **Flexibility**: Config allows customization across all actions
- **Consistency**: Predictable patterns across different webtool types