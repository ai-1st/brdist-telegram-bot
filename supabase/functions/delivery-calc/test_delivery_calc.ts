// ABOUTME: Test script for the delivery-calc edge function
// ABOUTME: Tests both actions: calcDensityAndVolume and calcCost

const FUNCTION_URL = "https://tmgwsihyyxakaimucncr.supabase.co/functions/v1/delivery-calc";

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
      console.assert(response.name === "delivery-calc", "Expected name to be 'delivery-calc'");
      console.assert(response.description, "Expected description to be present");
      console.assert(response.actions, "Expected actions to be present");
      console.assert(Array.isArray(response.actions), "Expected actions to be an array");
      console.assert(response.actions.length === 2, "Expected 2 actions");
      
      const actionNames = response.actions.map((a: any) => a.name);
      console.assert(actionNames.includes("calcDensityAndVolume"), "Expected calcDensityAndVolume action");
      console.assert(actionNames.includes("calcCost"), "Expected calcCost action");
      
      console.assert(response.configSchema, "Expected configSchema to be present");
      console.assert(response.defaultConfig, "Expected defaultConfig to be present");
      console.assert(response.defaultConfig.round_decimals === 2, "Expected default round_decimals to be 2");
    }
  },
  {
    name: "calcDensityAndVolume - basic calculation",
    method: "POST",
    body: {
      action: "calcDensityAndVolume",
      payload: {
        height_cm: 30,
        width_cm: 20,
        length_cm: 40,
        weight_kg: 5
      },
      session_id: "test-density-volume"
    },
    expectedStatus: 200,
    validate: (response) => {
      // Volume: 30cm * 20cm * 40cm = 24000 cm³ = 0.024 m³
      // Density: 5kg / 0.024 m³ = 208.33 kg/m³
      console.assert(response.volume_m3 === 0.024, `Expected volume_m3 to be 0.024, got ${response.volume_m3}`);
      console.assert(response.density === 208.33, `Expected density to be 208.33, got ${response.density}`);
    }
  },
  {
    name: "calcCost - basic calculation",
    method: "POST",
    body: {
      action: "calcCost",
      payload: {
        cost_per_kg: 2.5,
        weight_kg: 10,
        cost_per_m3: 100,
        volume_m3: 0.05
      },
      session_id: "test-cost"
    },
    expectedStatus: 200,
    validate: (response) => {
      // Cost by weight: 2.5 * 10 = 25
      // Cost by volume: 100 * 0.05 = 5
      // Total cost: 25 + 5 = 30
      console.assert(response.cost_by_weight === 25, `Expected cost_by_weight to be 25, got ${response.cost_by_weight}`);
      console.assert(response.cost_by_volume === 5, `Expected cost_by_volume to be 5, got ${response.cost_by_volume}`);
      console.assert(response.total_cost === 30, `Expected total_cost to be 30, got ${response.total_cost}`);
    }
  },
  {
    name: "Custom rounding configuration",
    method: "POST",
    body: {
      action: "calcDensityAndVolume",
      payload: {
        height_cm: 33,
        width_cm: 33,
        length_cm: 33,
        weight_kg: 7
      },
      config: {
        round_decimals: 4
      },
      session_id: "test-rounding"
    },
    expectedStatus: 200,
    validate: (response) => {
      // Volume: 33³ = 35937 cm³ = 0.035937 m³
      // Density: 7/0.035937 = 194.7368 kg/m³
      console.assert(response.volume_m3 === 0.0359, `Expected volume_m3 to be 0.0359, got ${response.volume_m3}`);
      console.assert(response.density === 194.7368, `Expected density to be 194.7368, got ${response.density}`);
    }
  },
  {
    name: "Missing action error",
    method: "POST",
    body: {
      payload: {
        height_cm: 10,
        width_cm: 10,
        length_cm: 10,
        weight_kg: 1
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
    name: "Invalid action error",
    method: "POST",
    body: {
      action: "invalidAction",
      payload: {
        height_cm: 10,
        width_cm: 10,
        length_cm: 10,
        weight_kg: 1
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
    name: "Invalid payload for calcDensityAndVolume",
    method: "POST",
    body: {
      action: "calcDensityAndVolume",
      payload: {
        height_cm: -10,
        width_cm: 10,
        length_cm: 10,
        weight_kg: 1
      },
      session_id: "test-invalid-payload"
    },
    expectedStatus: 400,
    validate: (response) => {
      console.assert(response.error, "Expected error message");
      console.assert(response.error.includes("positive numbers"), "Expected validation error");
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
  console.log("🚀 Starting delivery-calc function tests...\n");
  
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