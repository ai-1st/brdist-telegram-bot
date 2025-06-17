// ABOUTME: Example webtool that demonstrates the webtools interface specification
// ABOUTME: This can be used for testing the generic-bot webtools integration

import { serve } from "https://deno.land/std/http/server.ts";

// Example webtool metadata
const metadata = {
  name: "weather",
  description: "Get weather information for any location",
  actions: [
    {
      name: "current",
      description: "Get current weather for a location",
      schema: {
        "$schema": "http://json-schema.org/draft-07/schema#",
        type: "object",
        properties: {
          location: {
            type: "string",
            description: "City name or coordinates"
          },
          units: {
            type: "string",
            enum: ["metric", "imperial"],
            description: "Temperature units",
            default: "metric"
          }
        },
        required: ["location"]
      }
    },
    {
      name: "forecast",
      description: "Get weather forecast for a location",
      schema: {
        "$schema": "http://json-schema.org/draft-07/schema#",
        type: "object",
        properties: {
          location: {
            type: "string",
            description: "City name or coordinates"
          },
          days: {
            type: "integer",
            minimum: 1,
            maximum: 7,
            default: 3,
            description: "Number of days to forecast"
          }
        },
        required: ["location"]
      }
    }
  ],
  configSchema: {
    "$schema": "http://json-schema.org/draft-07/schema#",
    type: "object",
    properties: {
      apiKey: {
        type: "string",
        description: "Weather API key (optional)"
      },
      defaultUnits: {
        type: "string",
        enum: ["metric", "imperial"],
        default: "metric"
      }
    }
  },
  defaultConfig: {
    defaultUnits: "metric"
  }
};

serve(async (req) => {
  const headers = {
    "Content-Type": "application/json",
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type"
  };

  // Handle CORS preflight
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 204, headers });
  }

  // Handle GET - return metadata
  if (req.method === "GET") {
    return new Response(JSON.stringify(metadata), { headers });
  }

  // Handle POST - execute action
  if (req.method === "POST") {
    try {
      const body = await req.json();
      const { action, payload, config } = body;

      // Mock weather data
      const mockWeatherData = {
        current: {
          temperature: 22,
          condition: "Partly cloudy",
          humidity: 65,
          windSpeed: 12
        },
        forecast: [
          { day: "Monday", high: 25, low: 18, condition: "Sunny" },
          { day: "Tuesday", high: 23, low: 17, condition: "Cloudy" },
          { day: "Wednesday", high: 21, low: 15, condition: "Rainy" }
        ]
      };

      switch (action) {
        case "current":
          const units = payload.units || config?.defaultUnits || "metric";
          return new Response(JSON.stringify({
            location: payload.location,
            temperature: `${mockWeatherData.current.temperature}°${units === "metric" ? "C" : "F"}`,
            condition: mockWeatherData.current.condition,
            humidity: `${mockWeatherData.current.humidity}%`,
            windSpeed: `${mockWeatherData.current.windSpeed} ${units === "metric" ? "km/h" : "mph"}`
          }), { headers });

        case "forecast":
          const days = Math.min(payload.days || 3, mockWeatherData.forecast.length);
          return new Response(JSON.stringify({
            location: payload.location,
            forecast: mockWeatherData.forecast.slice(0, days)
          }), { headers });

        default:
          return new Response(JSON.stringify({ error: "Unknown action" }), { 
            status: 400, 
            headers 
          });
      }
    } catch (error) {
      return new Response(JSON.stringify({ 
        error: error instanceof Error ? error.message : "Internal server error" 
      }), { 
        status: 500, 
        headers 
      });
    }
  }

  return new Response(JSON.stringify({ error: "Method not allowed" }), { 
    status: 405, 
    headers 
  });
});