// ABOUTME: Calculates delivery costs based on package dimensions and weight
// ABOUTME: Returns JSON schema on GET, calculates cost on POST

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { corsHeaders } from "../_shared/cors.ts";

const defaultPricingTable = [
  { density_from: null, density_to: 100, price_usd_per_m3: 270.0 },
  { density_from: 100, density_to: 110, price_usd_per_kg: 3.4 },
  { density_from: 110, density_to: 120, price_usd_per_kg: 3.1 },
  { density_from: 120, density_to: 130, price_usd_per_kg: 3.1 },
  { density_from: 130, density_to: 140, price_usd_per_kg: 3.0 },
  { density_from: 140, density_to: 150, price_usd_per_kg: 2.9 },
  { density_from: 150, density_to: 160, price_usd_per_kg: 2.8 },
  { density_from: 160, density_to: 170, price_usd_per_kg: 2.65 },
  { density_from: 170, density_to: 180, price_usd_per_kg: 2.65 },
  { density_from: 180, density_to: 190, price_usd_per_kg: 2.5 },
  { density_from: 190, density_to: 200, price_usd_per_kg: 2.2 },
  { density_from: 200, density_to: 250, price_usd_per_kg: 2.15 },
  { density_from: 250, density_to: 300, price_usd_per_kg: 2.05 },
  { density_from: 300, density_to: 350, price_usd_per_kg: 2.05 },
  { density_from: 350, density_to: 400, price_usd_per_kg: 1.95 },
  { density_from: 400, density_to: 500, price_usd_per_kg: 1.95 },
  { density_from: 500, density_to: 600, price_usd_per_kg: 1.95 },
  { density_from: 600, density_to: 800, price_usd_per_kg: 1.8 },
  { density_from: 800, density_to: 1000, price_usd_per_kg: 1.8 },
  { density_from: 1000, density_to: null, price_usd_per_kg: 1.75 }
];

const calculateCostSchema = {
  "$schema": "http://json-schema.org/draft-07/schema#",
  "type": "object",
  "properties": {
    "width": {
      "type": "number",
      "description": "Width in centimeters",
      "minimum": 0
    },
    "height": {
      "type": "number", 
      "description": "Height in centimeters",
      "minimum": 0
    },
    "length": {
      "type": "number",
      "description": "Length in centimeters", 
      "minimum": 0
    },
    "weight": {
      "type": "number",
      "description": "Weight in kilograms",
      "minimum": 0
    }
  },
  "required": ["width", "height", "length", "weight"],
  "additionalProperties": false
};

const actions = [
  {
    "name": "calculate_cost",
    "description": "Calculate delivery cost based on package dimensions and weight",
    "schema": calculateCostSchema
  }
];

const configSchema = {
  "$schema": "http://json-schema.org/draft-07/schema#",
  "type": "object",
  "properties": {
    "pricing_table": {
      "type": "array",
      "description": "Custom pricing table with density-based tiers",
      "items": {
        "type": "object",
        "properties": {
          "density_from": {
            "type": ["number", "null"],
            "description": "Minimum density (kg/m³) for this tier"
          },
          "density_to": {
            "type": ["number", "null"],
            "description": "Maximum density (kg/m³) for this tier"
          },
          "price_usd_per_kg": {
            "type": "number",
            "description": "Price per kilogram in USD"
          },
          "price_usd_per_m3": {
            "type": "number",
            "description": "Price per cubic meter in USD"
          }
        },
        "required": ["density_from", "density_to"]
      }
    }
  }
};

const defaultConfig = {
  pricing_table: defaultPricingTable
};

function calculatePrice(density: number, pricingTable: any[]): number {
  for (const tier of pricingTable) {
    const minDensity = tier.density_from ?? 0;
    const maxDensity = tier.density_to ?? Infinity;
    
    if (density >= minDensity && density < maxDensity) {
      return tier.price_usd_per_m3 ?? tier.price_usd_per_kg;
    }
  }
  
  return pricingTable[pricingTable.length - 1].price_usd_per_kg ?? pricingTable[pricingTable.length - 1].price_usd_per_m3;
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    if (req.method === "GET") {
      return new Response(
        JSON.stringify({
          name: "delivery_cost",
          description: "Calculates delivery costs based on package dimensions, weight, and density-based pricing tiers",
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

      if (body.action !== "calculate_cost") {
        return new Response(
          JSON.stringify({ error: `Unknown action: ${body.action}. Available actions: calculate_cost` }),
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

      const { width, height, length, weight } = body.payload;

      if (typeof width !== "number" || width <= 0 ||
          typeof height !== "number" || height <= 0 ||
          typeof length !== "number" || length <= 0 ||
          typeof weight !== "number" || weight <= 0) {
        return new Response(
          JSON.stringify({ error: "Invalid payload: all dimensions and weight must be positive numbers" }),
          {
            headers: { ...corsHeaders, "Content-Type": "application/json" },
            status: 400,
          }
        );
      }

      // Use custom pricing table from config if provided, otherwise use default
      const pricingTable = body.config?.pricing_table || defaultPricingTable;

      // Convert centimeters to meters for volume calculation
      const widthInMeters = width / 100;
      const heightInMeters = height / 100;
      const lengthInMeters = length / 100;
      
      const volume = widthInMeters * heightInMeters * lengthInMeters;
      const density = weight / volume;
      const price = calculatePrice(density, pricingTable);
      
      // For density < 100, the price is per m³, not per kg
      const totalPrice = density < 100 
        ? price * volume  // price is per m³
        : price * weight; // price is per kg

      return new Response(
        JSON.stringify({
          volume: Math.round(volume * 1000) / 1000,
          volume_unit: "m³",
          density: Math.round(density * 100) / 100,
          density_unit: "kg/m³",
          price_per_kg: density < 100 ? null : price,
          price_per_m3: density < 100 ? price : null,
          total_price: Math.round(totalPrice * 100) / 100,
          currency: "USD"
        }),
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