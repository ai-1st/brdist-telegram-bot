// ABOUTME: Delivery calculation webtool with density/volume and cost calculations
// ABOUTME: Provides two actions: calcDensityAndVolume and calcCost

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { corsHeaders } from "../_shared/cors.ts";

const calcDensityAndVolumeSchema = {
  "$schema": "http://json-schema.org/draft-07/schema#",
  "type": "object",
  "properties": {
    "height_cm": {
      "type": "number",
      "description": "Height in centimeters",
      "minimum": 0
    },
    "width_cm": {
      "type": "number",
      "description": "Width in centimeters",
      "minimum": 0
    },
    "length_cm": {
      "type": "number",
      "description": "Length in centimeters",
      "minimum": 0
    },
    "weight_kg": {
      "type": "number",
      "description": "Weight in kilograms",
      "minimum": 0
    }
  },
  "required": ["height_cm", "width_cm", "length_cm", "weight_kg"],
  "additionalProperties": false
};

const calcCostSchema = {
  "$schema": "http://json-schema.org/draft-07/schema#",
  "type": "object",
  "properties": {
    "cost_per_kg": {
      "type": "number",
      "description": "Cost per kilogram in USD",
      "minimum": 0
    },
    "weight_kg": {
      "type": "number",
      "description": "Weight in kilograms",
      "minimum": 0
    },
    "cost_per_m3": {
      "type": "number",
      "description": "Cost per cubic meter in USD",
      "minimum": 0
    },
    "volume_m3": {
      "type": "number",
      "description": "Volume in cubic meters",
      "minimum": 0
    }
  },
  "required": ["cost_per_kg", "weight_kg", "cost_per_m3", "volume_m3"],
  "additionalProperties": false
};


const actions = [
  {
    "name": "calcDensityAndVolume",
    "description": "Calculate density and volume from package dimensions and weight",
    "schema": calcDensityAndVolumeSchema
  },
  {
    "name": "calcCost",
    "description": "Calculate delivery cost from weight/volume pricing",
    "schema": calcCostSchema
  }
];

const configSchema = {
  "$schema": "http://json-schema.org/draft-07/schema#",
  "type": "object",
  "properties": {
    "round_decimals": {
      "type": "number",
      "description": "Number of decimal places to round results",
      "default": 2,
      "minimum": 0,
      "maximum": 10
    }
  }
};

const defaultConfig = {
  round_decimals: 2
};

function roundToDecimals(value: number, decimals: number): number {
  const factor = Math.pow(10, decimals);
  return Math.round(value * factor) / factor;
}

function calculateDensityAndVolume(height_cm: number, width_cm: number, length_cm: number, weight_kg: number, roundDecimals: number) {
  // Convert dimensions from cm to m
  const height_m = height_cm / 100;
  const width_m = width_cm / 100;
  const length_m = length_cm / 100;
  
  // Calculate volume in cubic meters
  const volume_m3 = height_m * width_m * length_m;
  
  // Calculate density in kg/m³
  const density = weight_kg / volume_m3;
  
  return {
    volume_m3: roundToDecimals(volume_m3, roundDecimals),
    density: roundToDecimals(density, roundDecimals)
  };
}

function calculateCost(cost_per_kg: number, weight_kg: number, cost_per_m3: number, volume_m3: number, roundDecimals: number) {
  const cost_by_weight = cost_per_kg * weight_kg;
  const cost_by_volume = cost_per_m3 * volume_m3;
  const total_cost = cost_by_weight + cost_by_volume;
  
  return {
    cost_by_weight: roundToDecimals(cost_by_weight, roundDecimals),
    cost_by_volume: roundToDecimals(cost_by_volume, roundDecimals),
    total_cost: roundToDecimals(total_cost, roundDecimals)
  };
}


serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    if (req.method === "GET") {
      return new Response(
        JSON.stringify({
          name: "delivery-calc",
          description: "Delivery calculation utilities for density, volume, and cost calculations",
          actions: actions,
          configSchema: configSchema,
          defaultConfig: defaultConfig
        }, null, 2),
        {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
          status: 200,
        }
      );
    }

    if (req.method === "POST") {
      const body = await req.json();
      
      if (!body.action) {
        return new Response(
          JSON.stringify({ error: "Missing 'action' property in request body" }),
          {
            headers: { ...corsHeaders, "Content-Type": "application/json" },
            status: 400,
          }
        );
      }

      const validActions = actions.map(a => a.name);
      if (!validActions.includes(body.action)) {
        return new Response(
          JSON.stringify({ error: `Unknown action: ${body.action}. Available actions: ${validActions.join(', ')}` }),
          {
            headers: { ...corsHeaders, "Content-Type": "application/json" },
            status: 400,
          }
        );
      }
      
      if (!body.payload) {
        return new Response(
          JSON.stringify({ error: "Missing 'payload' property in request body" }),
          {
            headers: { ...corsHeaders, "Content-Type": "application/json" },
            status: 400,
          }
        );
      }

      // Get configuration
      const config = { ...defaultConfig, ...body.config };
      const roundDecimals = config.round_decimals;

      let result;

      switch (body.action) {
        case "calcDensityAndVolume": {
          const { height_cm, width_cm, length_cm, weight_kg } = body.payload;
          
          if (typeof height_cm !== "number" || height_cm <= 0 ||
              typeof width_cm !== "number" || width_cm <= 0 ||
              typeof length_cm !== "number" || length_cm <= 0 ||
              typeof weight_kg !== "number" || weight_kg <= 0) {
            return new Response(
              JSON.stringify({ error: "Invalid payload: all dimensions and weight must be positive numbers" }),
              {
                headers: { ...corsHeaders, "Content-Type": "application/json" },
                status: 400,
              }
            );
          }

          result = calculateDensityAndVolume(height_cm, width_cm, length_cm, weight_kg, roundDecimals);
          break;
        }

        case "calcCost": {
          const { cost_per_kg, weight_kg, cost_per_m3, volume_m3 } = body.payload;
          
          if (typeof cost_per_kg !== "number" || cost_per_kg < 0 ||
              typeof weight_kg !== "number" || weight_kg <= 0 ||
              typeof cost_per_m3 !== "number" || cost_per_m3 < 0 ||
              typeof volume_m3 !== "number" || volume_m3 <= 0) {
            return new Response(
              JSON.stringify({ error: "Invalid payload: all values must be positive numbers (costs can be 0)" }),
              {
                headers: { ...corsHeaders, "Content-Type": "application/json" },
                status: 400,
              }
            );
          }

          result = calculateCost(cost_per_kg, weight_kg, cost_per_m3, volume_m3, roundDecimals);
          break;
        }

      }

      return new Response(
        JSON.stringify(result),
        {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
          status: 200,
        }
      );
    }

    return new Response(
      JSON.stringify({ error: "Method not allowed. Use GET or POST." }),
      {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 405,
      }
    );
  } catch (error) {
    console.error("Error processing request:", error);
    return new Response(
      JSON.stringify({ error: "Internal server error" }),
      {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 500,
      }
    );
  }
});