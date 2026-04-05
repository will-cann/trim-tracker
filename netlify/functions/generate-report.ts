import { Handler } from '@netlify/functions';
import { resolveContext } from './utils/auth';
import { pool } from './utils/db';
import { checkRateLimit } from './utils/rateLimit';
import { withSentry, captureError } from './utils/sentry';
import { compileReportSpec, getSchemaDescription, type ReportSpec } from './utils/reportCompiler';

const ANTHROPIC_API_URL = 'https://api.anthropic.com/v1/messages';

const SCHEMA_DESCRIPTION = getSchemaDescription();

const SYSTEM_PROMPT = `You are a data analyst for a cannabis cultivation and operations management application. Your job is to translate natural language questions into structured report specifications that will be compiled into SQL queries.

## Database Schema

${SCHEMA_DESCRIPTION}

## Column expression format

All column references MUST be table-qualified: "table_name.column_name". Never use bare column names.

## Critical constraints

- You can ONLY reference columns that exist in the schema. You CANNOT create computed expressions, derived columns, or formulas. If you need a ratio or calculation, use the raw columns and let the frontend handle display.
- For "productivity" or "per hour" requests, use SUM of weights (flower_weight, trim_weight etc.) and the raw time columns — do NOT invent columns like "grams_per_hour" or "productivity".
- For "yield" requests, return the raw input and output columns separately — do NOT compute ratios.

## Rules

1. Always use the exact table and column names from the schema above. Never invent column names.
2. Pick the most appropriate visualization type:
   - "bar" for categorical comparisons (e.g., weight by strain, count by status)
   - "line" for time series trends (e.g., harvest weights over time, daily production)
   - "area" for cumulative or stacked time series
   - "composed" for mixing bars and lines (e.g., volume bars + efficiency line)
   - "pie" for proportional breakdowns (e.g., allocation types, waste types)
   - "table" for detailed multi-column data
   - "metric" for single aggregate numbers (e.g., total harvest weight, average yield)
3. Use aggregations (sum, avg, count, min, max) when summarizing data. Always include a GROUP BY when using aggregations with non-aggregated columns.
4. For date filtering, use the "between" operator with ISO date strings. Today is ${new Date().toISOString().split('T')[0]}.
5. Use meaningful aliases that describe the data (e.g., "total_weight", "strain_name", "harvest_count").
6. Default to reasonable limits (50 rows for tables, no limit needed for aggregated results).
7. For time series, order by the date column ascending.
8. The xAxis should be the grouping/category column alias, yAxis should be the value column alias(es).

## Cannabis domain knowledge

- Harvests track plant harvesting through drying. Key metrics: wet weight, dry weight, waste, plant count.
- Trim sessions are work sessions where batches of flower are trimmed. Track flower/shake/trim/waste weights and trimmer productivity (grams/hour).
- Packages are final saleable units (flower, trim, shake, fresh_frozen, bubble_hash, rosin, rosin_cart).
- Extraction converts input material to concentrates. yield_percentage = output/input * 100.
- Plants have growth phases: vegetative → flowering → harvested/destroyed. Health is 0-100.
- Rooms have types: nursery, veg, flower, dry, general.
- human_tasks track operational work with priority (low/medium/high/urgent) and category.

## Common analytics patterns

- Trimmer productivity: join trimmers → trim_entries → trim_sessions. Use SUM(trimmers.flower_weight) grouped by trimmers.name. Show total flower weight per trimmer as a bar chart.
- Harvest totals: SUM or AVG of harvests.total_wet_weight, harvests.dry_weight grouped by strain or date.
- Extraction: SUM of extraction_logs.input_quantity and extraction_logs.output_quantity grouped by strain or extraction_type.
- Room utilization: COUNT of plants grouped by rooms.name and plants.growth_phase.
- Task completion: COUNT of human_tasks grouped by human_tasks.status or human_tasks.category.`;

const REPORT_TOOL = {
  name: 'generate_report',
  description: 'Generate a structured report specification from the user\'s natural language query',
  input_schema: {
    type: 'object' as const,
    properties: {
      title: { type: 'string', description: 'Short title for the report (max 60 chars)' },
      description: { type: 'string', description: 'One-sentence description of what this report shows' },
      visualization: {
        type: 'string',
        enum: ['bar', 'line', 'area', 'composed', 'pie', 'table', 'metric'],
        description: 'Chart type',
      },
      query: {
        type: 'object',
        properties: {
          from: { type: 'string', description: 'Primary table name' },
          joins: {
            type: 'array',
            items: {
              type: 'object',
              properties: {
                table: { type: 'string', description: 'Table to join' },
                on: {
                  type: 'array',
                  items: { type: 'string' },
                  minItems: 2,
                  maxItems: 2,
                  description: 'Join condition as [left_table.column, right_table.column]',
                },
              },
              required: ['table', 'on'],
            },
          },
          columns: {
            type: 'array',
            items: {
              type: 'object',
              properties: {
                expr: { type: 'string', description: 'Table-qualified column: table_name.column_name' },
                alias: { type: 'string', description: 'Output column alias (snake_case)' },
                agg: { type: 'string', enum: ['sum', 'avg', 'count', 'min', 'max'], description: 'Aggregation function' },
              },
              required: ['expr', 'alias'],
            },
          },
          filters: {
            type: 'array',
            items: {
              type: 'object',
              properties: {
                column: { type: 'string', description: 'Table-qualified column to filter' },
                op: { type: 'string', enum: ['=', '!=', '>', '<', '>=', '<=', 'in', 'between'] },
                value: { description: 'Filter value. For "in": array of values. For "between": [low, high].' },
              },
              required: ['column', 'op', 'value'],
            },
          },
          groupBy: {
            type: 'array',
            items: { type: 'string', description: 'Table-qualified column to group by' },
          },
          orderBy: {
            type: 'array',
            items: {
              type: 'object',
              properties: {
                column: { type: 'string', description: 'Alias from columns to order by' },
                dir: { type: 'string', enum: ['asc', 'desc'] },
              },
              required: ['column', 'dir'],
            },
          },
          limit: { type: 'number', description: 'Max rows to return (default 1000)' },
        },
        required: ['from', 'columns'],
      },
      chart: {
        type: 'object',
        properties: {
          xAxis: { type: 'string', description: 'Alias for x-axis (category/time)' },
          yAxis: {
            type: 'array',
            items: { type: 'string' },
            description: 'Alias(es) for y-axis values',
          },
          colorBy: { type: 'string', description: 'Alias for color/series grouping' },
          stacked: { type: 'boolean', description: 'Stack bars/areas' },
        },
        required: ['xAxis', 'yAxis'],
      },
    },
    required: ['title', 'description', 'visualization', 'query', 'chart'],
  },
};

const handler: Handler = async (event) => {
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: JSON.stringify({ error: 'Method not allowed' }) };
  }

  const authHeader = event.headers.authorization || '';
  const { companyId } = await resolveContext(authHeader);

  // Rate limit: 30 requests per minute
  const rateCheck = await checkRateLimit(companyId, 'generate-report', 30, 60);
  if (!rateCheck.allowed) {
    return {
      statusCode: 429,
      body: JSON.stringify({ error: 'Rate limit exceeded', retryAfter: rateCheck.retryAfterSeconds }),
    };
  }

  const claudeKey = process.env.CLAUDE_API_KEY;
  const anthropicKey = process.env.ANTHROPIC_API_KEY;
  console.log('CLAUDE_API_KEY:', claudeKey ? `${claudeKey.slice(0,10)}... (${claudeKey.length})` : 'MISSING');
  console.log('ANTHROPIC_API_KEY:', anthropicKey ? `${anthropicKey.slice(0,10)}... (${anthropicKey.length})` : 'MISSING');
  const apiKey = claudeKey || anthropicKey;
  if (!apiKey) {
    return { statusCode: 500, body: JSON.stringify({ error: 'AI service not configured' }) };
  }

  let body: { prompt: string; conversationHistory?: Array<{ role: string; content: string }> };
  try {
    body = JSON.parse(event.body || '{}');
  } catch {
    return { statusCode: 400, body: JSON.stringify({ error: 'Invalid JSON' }) };
  }

  if (!body.prompt || typeof body.prompt !== 'string') {
    return { statusCode: 400, body: JSON.stringify({ error: 'prompt is required' }) };
  }

  try {
    // Build messages — include conversation history for follow-up refinements
    const messages: Array<{ role: string; content: string }> = [];
    if (body.conversationHistory) {
      for (const msg of body.conversationHistory) {
        messages.push({ role: msg.role, content: msg.content });
      }
    }
    messages.push({ role: 'user', content: body.prompt });

    // Call Claude
    const response = await fetch(ANTHROPIC_API_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-20250514',
        max_tokens: 2048,
        system: SYSTEM_PROMPT,
        tools: [REPORT_TOOL],
        tool_choice: { type: 'tool', name: 'generate_report' },
        messages,
      }),
    });

    if (!response.ok) {
      const errText = await response.text();
      console.error('Claude API error:', response.status, errText);
      return { statusCode: 502, body: JSON.stringify({ error: `AI service error (${response.status}): ${errText.slice(0, 200)}` }) };
    }

    const result = await response.json();

    // Extract the tool call
    let spec: ReportSpec | null = null;
    let aiMessage = '';
    for (const block of result.content) {
      if (block.type === 'text') {
        aiMessage += block.text;
      } else if (block.type === 'tool_use' && block.name === 'generate_report') {
        spec = block.input as ReportSpec;
      }
    }

    if (!spec) {
      return {
        statusCode: 200,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ error: 'Could not generate a report from that query. Try being more specific.', message: aiMessage }),
      };
    }

    // Compile and execute
    const compiled = compileReportSpec(spec, companyId);

    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      await client.query('SET TRANSACTION READ ONLY');
      const { rows } = await client.query(compiled.text, compiled.values);
      await client.query('COMMIT');

      return {
        statusCode: 200,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ spec, data: rows, message: aiMessage }),
      };
    } catch (queryErr: any) {
      await client.query('ROLLBACK').catch(() => {});
      console.error('Query execution error:', queryErr.message, '\nSQL:', compiled.text);
      return {
        statusCode: 200,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ error: `Query failed: ${queryErr.message}. Try rephrasing your question.`, spec }),
      };
    } finally {
      client.release();
    }
  } catch (err: any) {
    captureError(err);
    console.error('generate-report error:', err);
    return { statusCode: 500, body: JSON.stringify({ error: 'Internal server error' }) };
  }
};

export { handler };
