// ABOUTME: Test script for the delivery_cost edge function
// ABOUTME: Tests various scenarios including GET meta info, POST calculations, and custom pricing

const FUNCTION_URL = "https://tmgwsihyyxakaimucncr.supabase.co/functions/v1/delivery_cost";

interface TestCase {
  name: string;
  method: "GET" | "POST";
  body?: any;
  expectedStatus: number;
  validate?: (response: any) => void;
}

const testCases: TestCase[] = [
  {
    name: "GET meta information",
    method: "GET",
    expectedStatus: 200,
    validate: (response) => {
      console.assert(response.name === "delivery_cost", "Expected name to be 'delivery_cost'");
      console.assert(response.description, "Expected description to be present");
      console.assert(response.actions, "Expected actions to be present");
      console.assert(Array.isArray(response.actions), "Expected actions to be an array");
      console.assert(response.actions.length === 1, "Expected 1 action");
      console.assert(response.actions[0].name === "calculate_cost", "Expected action name to be 'calculate_cost'");
      console.assert(response.actions[0].description, "Expected action description to be present");
      console.assert(response.actions[0].schema, "Expected action schema to be present");
      console.assert(response.configSchema, "Expected configSchema to be present");
      console.assert(response.defaultConfig, "Expected defaultConfig to be present");
      console.assert(response.defaultConfig.pricing_table, "Expected defaultConfig.pricing_table to be present");
      console.assert(response.defaultConfig.pricing_table.length === 20, "Expected 20 pricing tiers in default config");
      // Verify action schema only contains payload properties
      const actionSchema = response.actions[0].schema;
      console.assert(actionSchema.properties.width, "Expected width in action schema");
      console.assert(actionSchema.properties.height, "Expected height in action schema");
      console.assert(actionSchema.properties.length, "Expected length in action schema");
      console.assert(actionSchema.properties.weight, "Expected weight in action schema");
    }
  },
  {
    name: "POST with low density (< 100 kg/m³) - price per m³",
    method: "POST",
    body: {
      action: "calculate_cost",
      payload: {
        width: 1,
        height: 1,
        length: 1,
        weight: 50
      },
      session_id: "test-low-density"
    },
    expectedStatus: 200,
    validate: (response) => {
      console.assert(response.volume === 1, "Expected volume to be 1 m³");
      console.assert(response.density === 50, "Expected density to be 50 kg/m³");
      console.assert(response.price_per_kg === null, "Expected price_per_kg to be null");
      console.assert(response.price_per_m3 === 270, "Expected price_per_m3 to be 270");
      console.assert(response.total_price === 270, "Expected total_price to be 270");
    }
  },
  {
    name: "POST with normal density (>= 100 kg/m³) - price per kg",
    method: "POST",
    body: {
      action: "calculate_cost",
      payload: {
        width: 0.5,
        height: 0.3,
        length: 0.4,
        weight: 10
      },
      session_id: "test-normal-density"
    },
    expectedStatus: 200,
    validate: (response) => {
      console.assert(response.volume === 0.06, "Expected volume to be 0.06 m³");
      console.assert(response.density === 166.67, "Expected density to be 166.67 kg/m³");
      console.assert(response.price_per_kg === 2.65, "Expected price_per_kg to be 2.65");
      console.assert(response.price_per_m3 === null, "Expected price_per_m3 to be null");
      console.assert(response.total_price === 26.5, "Expected total_price to be 26.5");
    }
  },
  {
    name: "POST with custom pricing table",
    method: "POST",
    body: {
      action: "calculate_cost",
      payload: {
        width: 1,
        height: 1,
        length: 1,
        weight: 150
      },
      config: {
        pricing_table: [
          { density_from: null, density_to: 100, price_usd_per_m3: 500 },
          { density_from: 100, density_to: 200, price_usd_per_kg: 5 },
          { density_from: 200, density_to: null, price_usd_per_kg: 3 }
        ]
      },
      session_id: "test-custom-pricing"
    },
    expectedStatus: 200,
    validate: (response) => {
      console.assert(response.density === 150, "Expected density to be 150 kg/m³");
      console.assert(response.price_per_kg === 5, "Expected price_per_kg to be 5 (custom)");
      console.assert(response.total_price === 750, "Expected total_price to be 750 (150kg * 5)");
    }
  },
  {
    name: "POST with missing action",
    method: "POST",
    body: {
      payload: {
        width: 1,
        height: 1,
        length: 1,
        weight: 50
      },
      session_id: "test-missing-action"
    },
    expectedStatus: 400,
    validate: (response) => {
      console.assert(response.error, "Expected error message");
      console.assert(response.error.includes("Missing 'action'"), "Expected specific error message");
    }
  },
  {
    name: "POST with invalid action",
    method: "POST",
    body: {
      action: "invalid_action",
      payload: {
        width: 1,
        height: 1,
        length: 1,
        weight: 50
      },
      session_id: "test-invalid-action"
    },
    expectedStatus: 400,
    validate: (response) => {
      console.assert(response.error, "Expected error message");
      console.assert(response.error.includes("Unknown action"), "Expected specific error message");
    }
  },
  {
    name: "POST with missing payload",
    method: "POST",
    body: {
      action: "calculate_cost",
      session_id: "test-missing-payload"
    },
    expectedStatus: 400,
    validate: (response) => {
      console.assert(response.error, "Expected error message");
      console.assert(response.error.includes("Missing 'payload'"), "Expected specific error message");
    }
  },
  {
    name: "POST with invalid dimensions",
    method: "POST",
    body: {
      action: "calculate_cost",
      payload: {
        width: -1,
        height: 0.3,
        length: 0.4,
        weight: 10
      },
      session_id: "test-invalid-dimensions"
    },
    expectedStatus: 400,
    validate: (response) => {
      console.assert(response.error, "Expected error message");
      console.assert(response.error.includes("positive numbers"), "Expected validation error");
    }
  },
  {
    name: "POST with high density (> 1000 kg/m³)",
    method: "POST",
    body: {
      action: "calculate_cost",
      payload: {
        width: 0.1,
        height: 0.1,
        length: 0.1,
        weight: 2
      },
      session_id: "test-high-density"
    },
    expectedStatus: 200,
    validate: (response) => {
      console.assert(response.volume === 0.001, "Expected volume to be 0.001 m³");
      console.assert(response.density === 2000, "Expected density to be 2000 kg/m³");
      console.assert(response.price_per_kg === 1.75, "Expected price_per_kg to be 1.75 (max tier)");
      console.assert(response.total_price === 3.5, "Expected total_price to be 3.5");
    }
  },
  {
    name: "OPTIONS request for CORS",
    method: "OPTIONS" as any,
    expectedStatus: 200
  }
];

async function runTest(testCase: TestCase) {
  console.log(`\n🧪 Running test: ${testCase.name}`);
  
  try {
    const options: RequestInit = {
      method: testCase.method,
      headers: {
        "Content-Type": "application/json"
      }
    };
    
    if (testCase.body) {
      options.body = JSON.stringify(testCase.body);
    }
    
    const response = await fetch(FUNCTION_URL, options);
    
    // Check status
    if (response.status !== testCase.expectedStatus) {
      console.error(`❌ Expected status ${testCase.expectedStatus}, got ${response.status}`);
      const text = await response.text();
      console.error(`Response: ${text}`);
      return false;
    }
    
    // Parse response if not OPTIONS
    if (testCase.method !== "OPTIONS" as any && response.ok) {
      const data = await response.json();
      console.log(`Response:`, JSON.stringify(data, null, 2));
      
      // Run validation if provided
      if (testCase.validate) {
        testCase.validate(data);
      }
    }
    
    console.log(`✅ Test passed`);
    return true;
  } catch (error) {
    console.error(`❌ Test failed with error:`, error);
    return false;
  }
}

async function runAllTests() {
  console.log("🚀 Starting delivery_cost function tests...\n");
  
  let passed = 0;
  let failed = 0;
  
  for (const testCase of testCases) {
    const result = await runTest(testCase);
    if (result) {
      passed++;
    } else {
      failed++;
    }
  }
  
  console.log(`\n📊 Test Summary:`);
  console.log(`✅ Passed: ${passed}`);
  console.log(`❌ Failed: ${failed}`);
  console.log(`📈 Total: ${testCases.length}`);
  
  if (failed === 0) {
    console.log(`\n🎉 All tests passed!`);
  } else {
    console.log(`\n⚠️  Some tests failed`);
    Deno.exit(1);
  }
}

// Run tests if this is the main module
if (import.meta.main) {
  await runAllTests();
}