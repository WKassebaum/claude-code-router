#!/usr/bin/env node

/**
 * Script to update model pricing data in the Claude Code Router database
 *
 * Pricing data as of January 2025
 */

const Database = require('better-sqlite3');
const { join } = require('path');
const { homedir } = require('os');

const DB_PATH = join(homedir(), '.claude-code-router', 'usage.db');

console.log('🔧 Updating model pricing data...');

// Open database
const db = new Database(DB_PATH);

// Comprehensive pricing data (as of January 2025)
const pricingData = [
  // OpenAI Models
  ['openai', 'gpt-4', 0.03, 0.06, 0.015, 0.03],
  ['openai', 'gpt-4-turbo', 0.01, 0.03, 0.005, 0.015],
  ['openai', 'gpt-4-turbo-preview', 0.01, 0.03, 0.005, 0.015],
  ['openai', 'gpt-3.5-turbo', 0.0005, 0.0015, 0.00025, 0.00075],
  ['openai', 'gpt-3.5-turbo-16k', 0.003, 0.004, 0.0015, 0.002],
  ['openai', 'o3-mini', 0.015, 0.06, 0.0075, 0.03],
  ['openai', 'o3', 0.015, 0.06, 0.0075, 0.03],
  ['openai', 'gpt-4o', 0.005, 0.015, 0.0025, 0.0075],
  ['openai', 'gpt-4o-mini', 0.00015, 0.0006, 0.000075, 0.0003],

  // Anthropic Models (Claude)
  ['anthropic', 'claude-3-opus', 0.015, 0.075, 0.0075, 0.0375],
  ['anthropic', 'claude-3-sonnet', 0.003, 0.015, 0.0015, 0.0075],
  ['anthropic', 'claude-3-haiku', 0.00025, 0.00125, 0.000125, 0.000625],
  ['anthropic', 'claude-3.5-sonnet', 0.003, 0.015, 0.0015, 0.0075],
  ['anthropic', 'claude-3.5-haiku', 0.0008, 0.004, 0.0004, 0.002],
  ['anthropic', 'claude-opus-4', 0.015, 0.075, 0.0075, 0.0375],
  ['anthropic', 'claude-sonnet-4-5-20250929', 0.003, 0.015, 0.0015, 0.0075],
  ['anthropic', 'claude-sonnet-4-5', 0.003, 0.015, 0.0015, 0.0075],
  ['anthropic', 'claude-sonnet-4', 0.003, 0.015, 0.0015, 0.0075],

  // xAI Models (Grok)
  ['xai', 'grok-3', 0.0005, 0.0015, 0.00025, 0.00075],
  ['xai', 'grok-3-fast', 0.0003, 0.0008, 0.00015, 0.0004],
  ['xai', 'grok-4-0709', 0.0005, 0.0015, 0.00025, 0.00075],
  ['xai', 'grok-4-heavy', 0.001, 0.003, 0.0005, 0.0015],
  ['xai', 'grok-4-fast', 0.0002, 0.0005, 0.0001, 0.00025],
  ['xai', 'grok-4-fast-reasoning', 0.0002, 0.0005, 0.0001, 0.00025],
  ['xai', 'grok-4-fast-non-reasoning', 0.0002, 0.0005, 0.0001, 0.00025],
  ['xai', 'grok-fast-code-1', 0.0002, 0.0005, 0.0001, 0.00025],

  // Google Models (Gemini)
  ['gemini', 'gemini-2.5-pro', 0.00125, 0.005, 0.0003125, 0.00125],
  ['gemini', 'gemini-2.5-flash', 0.000075, 0.0003, 0.0000375, 0.00015],
  ['gemini', 'gemini-2.0-flash', 0.000075, 0.0003, 0.0000375, 0.00015],
  ['gemini', 'gemini-2.0-flash-exp', 0.000075, 0.0003, 0.0000375, 0.00015],
  ['gemini', 'gemini-pro', 0.00125, 0.00375, 0.0003125, 0.000938],
  ['gemini', 'gemini-1.5-pro', 0.00125, 0.00375, 0.0003125, 0.000938],
  ['gemini', 'gemini-1.5-flash', 0.000075, 0.0003, 0.0000375, 0.00015],

  // Google Models (direct API compatibility)
  ['google', 'gemini-2.5-pro', 0.00125, 0.005, 0.0003125, 0.00125],
  ['google', 'gemini-2.5-flash', 0.000075, 0.0003, 0.0000375, 0.00015],
  ['google', 'gemini-2.0-flash', 0.000075, 0.0003, 0.0000375, 0.00015],

  // DeepSeek Models
  ['deepseek', 'deepseek-chat', 0.00014, 0.00028, 0.00007, 0.00014],
  ['deepseek', 'deepseek-coder', 0.00014, 0.00028, 0.00007, 0.00014],
  ['deepseek', 'deepseek-reasoner', 0.00055, 0.0022, 0.000275, 0.0011],
  ['deepseek', 'deepseek-r1', 0.00055, 0.0022, 0.000275, 0.0011],
  ['deepseek', 'deepseek-r1-0528', 0.00055, 0.0022, 0.000275, 0.0011],
  ['deepseek', 'deepseek-v3', 0.00014, 0.00028, 0.00007, 0.00014],

  // OpenRouter prefix models (for router access)
  ['openrouter', 'x-ai/grok-4-fast', 0.0002, 0.0005, 0.0001, 0.00025],
  ['openrouter', 'x-ai/grok-4-fast:free', 0.0, 0.0, 0.0, 0.0],
  ['openrouter', 'x-ai/grok-3', 0.0005, 0.0015, 0.00025, 0.00075],
  ['openrouter', 'anthropic/claude-sonnet-4-5', 0.003, 0.015, 0.0015, 0.0075],
  ['openrouter', 'anthropic/claude-sonnet-4', 0.003, 0.015, 0.0015, 0.0075],
  ['openrouter', 'anthropic/claude-3.5-sonnet', 0.003, 0.015, 0.0015, 0.0075],
  ['openrouter', 'google/gemini-2.5-pro-preview', 0.00125, 0.005, 0.0003125, 0.00125],
  ['openrouter', 'google/gemini-2.5-flash', 0.000075, 0.0003, 0.0000375, 0.00015],
  ['openrouter', 'deepseek/deepseek-r1-0528', 0.00055, 0.0022, 0.000275, 0.0011],
  ['openrouter', 'deepseek/deepseek-chat', 0.00014, 0.00028, 0.00007, 0.00014],
  ['openrouter', 'openai/o3-mini', 0.015, 0.06, 0.0075, 0.03],
  ['openrouter', 'openai/o3', 0.015, 0.06, 0.0075, 0.03],

  // Mistral AI Models
  ['mistral', 'mistral-large', 0.003, 0.009, 0.0015, 0.0045],
  ['mistral', 'mistral-medium', 0.0027, 0.0081, 0.00135, 0.00405],
  ['mistral', 'mistral-small', 0.001, 0.003, 0.0005, 0.0015],
  ['mistral', 'mistral-tiny', 0.00025, 0.00025, 0.000125, 0.000125],

  // Cohere Models
  ['cohere', 'command', 0.001, 0.002, 0.0005, 0.001],
  ['cohere', 'command-light', 0.00015, 0.0006, 0.000075, 0.0003],
  ['cohere', 'command-r', 0.0005, 0.0015, 0.00025, 0.00075],
  ['cohere', 'command-r-plus', 0.003, 0.015, 0.0015, 0.0075],

  // Groq Models (via API)
  ['groq', 'llama-3.2-70b', 0.00059, 0.00079, 0.000295, 0.000395],
  ['groq', 'llama-3.2-8b', 0.00005, 0.00008, 0.000025, 0.00004],
  ['groq', 'mixtral-8x7b', 0.00027, 0.00027, 0.000135, 0.000135],
  ['groq', 'gemma-7b', 0.00007, 0.00007, 0.000035, 0.000035],

  // Together AI Models
  ['together', 'llama-3.2-70b', 0.00088, 0.00088, 0.00044, 0.00044],
  ['together', 'llama-3.2-8b', 0.00018, 0.00018, 0.00009, 0.00009],
  ['together', 'mixtral-8x7b', 0.0006, 0.0006, 0.0003, 0.0003],
  ['together', 'mixtral-8x22b', 0.0012, 0.0012, 0.0006, 0.0006],

  // Perplexity Models
  ['perplexity', 'sonar-small', 0.0002, 0.0002, 0.0001, 0.0001],
  ['perplexity', 'sonar-medium', 0.0006, 0.0018, 0.0003, 0.0009],
  ['perplexity', 'sonar-large', 0.001, 0.005, 0.0005, 0.0025],
];

// Insert pricing data
const insertStmt = db.prepare(`
  INSERT OR REPLACE INTO model_pricing
  (provider, model, input_price_per_1k, output_price_per_1k, cached_input_price_per_1k, cached_output_price_per_1k)
  VALUES (?, ?, ?, ?, ?, ?)
`);

const insertAll = db.transaction((data) => {
  for (const row of data) {
    insertStmt.run(...row);
  }
});

try {
  insertAll(pricingData);
  console.log(`✅ Updated pricing for ${pricingData.length} models`);
} catch (error) {
  console.error('❌ Error updating pricing:', error);
  process.exit(1);
}

// Verify some pricing was added
const count = db.prepare('SELECT COUNT(*) as count FROM model_pricing').get();
console.log(`📊 Total pricing records in database: ${count.count}`);

// Show some sample pricing
console.log('\n📋 Sample pricing (per 1M tokens):');
const samples = db.prepare(`
  SELECT provider, model,
         ROUND(input_price_per_1k * 1000, 2) as input_price,
         ROUND(output_price_per_1k * 1000, 2) as output_price
  FROM model_pricing
  WHERE provider IN ('xai', 'gemini', 'anthropic', 'openai')
    AND model IN ('grok-4-fast', 'gemini-2.5-flash', 'claude-3.5-haiku', 'gpt-4o-mini')
`).all();

samples.forEach(s => {
  console.log(`  ${s.provider}/${s.model}: $${s.input_price} input, $${s.output_price} output`);
});

db.close();
console.log('\n✅ Pricing update complete!');