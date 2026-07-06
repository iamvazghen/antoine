/**
 * Multi-agent debate orchestrator. Spawns 4 specialist subagents in sequence:
 *   1. bull    - general-purpose research view
 *   2. bear    - devils-advocate view
 *   3. quant   - numerical analysis (comps, dcf, position-sizing)
 *   4. macro   - macro overlay
 * Then a `judge` subagent synthesizes the four into one conclusion.
 */
import { DynamicStructuredTool } from '@langchain/core/tools';
import type { RunnableConfig } from '@langchain/core/runnables';
import { z } from 'zod';
import { formatToolResult } from '../types.js';
import {
  SUBAGENT_TYPES,
  DEFAULT_SUBAGENT_TYPE,
  resolveSubagentTools,
} from './types.js';

export const RUN_DEBATE_DESCRIPTION = `
Run a full multi-agent debate on a single investment thesis. Spawns 4 specialist
subagents in sequence (bull / bear / quant / macro) and a judge subagent to
synthesize. Returns the four specialist views plus the judge's structured
conclusion (BULL / BEAR / NEUTRAL with conviction + time horizon).

Use this for high-conviction trades where the user wants the strongest possible
counter-argument surfaced before committing capital.

Cost: this runs 5 subagent loops in sequence. Expect 60-90 seconds and
roughly 5x the normal token cost of a single answer.
`.trim();

const RunDebateInputSchema = z.object({
  thesis: z.string().describe('The investment thesis to debate (e.g., "Long NVDA: AI capex cycle extends through FY27, datacenters build out doubles again").'),
  ticker: z.string().optional().describe('Optional ticker for context.'),
  context: z.string().optional().describe('Optional additional context (current price, position size, etc.).'),
});

interface SpecialistOutput {
  role: 'bull' | 'bear' | 'quant' | 'macro' | 'judge';
  answer: string;
  duration_ms: number;
}

export function createRunDebate(model: string): DynamicStructuredTool {
  return new DynamicStructuredTool({
    name: 'run_debate',
    description: 'Run a 4-specialist investment debate + judge synthesis. High cost; reserve for high-conviction trades.',
    schema: RunDebateInputSchema,
    func: async (input, _runManager, config?: RunnableConfig) => {
      const onProgress = config?.metadata?.onProgress as ((msg: string) => void) | undefined;
      const signal = config?.signal as AbortSignal | undefined;

      const baseContext = [
        input.ticker ? `Ticker: ${input.ticker}` : null,
        input.context ? `Context: ${input.context}` : null,
      ].filter(Boolean).join('\n');

      // Lazy import to avoid circular dep with agent.js.
      const { Agent } = await import('../../agent/agent.js');

      const specialists: Array<{ role: SpecialistOutput['role']; type: string; prompt: string }> = [
        {
          role: 'bull',
          type: 'general-purpose',
          prompt: `Construct the strongest possible BULL case for this thesis. Use data, precedent, and named catalysts. Do NOT acknowledge the bear case - your job is to make the strongest affirmative argument.\n\nThesis: ${input.thesis}${baseContext ? `\n\n${baseContext}` : ''}`,
        },
        {
          role: 'bear',
          type: 'devils-advocate',
          prompt: `${input.thesis}${baseContext ? `\n\n${baseContext}` : ''}`,
        },
        {
          role: 'quant',
          type: 'analysis',
          prompt: `Provide a QUANTITATIVE analysis of this thesis. Use comps, DCF, reverse-DCF, or position-sizing math. Be specific with numbers.\n\nThesis: ${input.thesis}${baseContext ? `\n\n${baseContext}` : ''}`,
        },
        {
          role: 'macro',
          type: 'macro-overlay',
          prompt: `${input.thesis}${baseContext ? `\n\n${baseContext}` : ''}`,
        },
      ];

      const outputs: SpecialistOutput[] = [];

      for (const { role, type, prompt } of specialists) {
        const t0 = Date.now();
        onProgress?.(`Debate: ${role} thinking...`);
        const typeCfg = SUBAGENT_TYPES[type] ?? SUBAGENT_TYPES[DEFAULT_SUBAGENT_TYPE];
        const toolAllowlist = resolveSubagentTools(type);
        const subagent = await Agent.create({
          model,
          maxIterations: typeCfg.maxIterations,
          signal,
          memoryEnabled: false,
          toolAllowlist,
          systemPromptOverride: typeCfg.systemPrompt,
          agentLabel: type,
        });
        let answer = '';
        for await (const ev of subagent.run(prompt)) {
          if (ev.type === 'done') answer = ev.answer;
        }
        outputs.push({ role, answer, duration_ms: Date.now() - t0 });
      }

      // Run the judge subagent on the four specialist outputs.
      const t1 = Date.now();
      const judgeTask = `Investment debate to synthesize:

Thesis: ${input.thesis}${baseContext ? `\n\n${baseContext}` : ''}

${outputs.map((o) => `### ${o.role.toUpperCase()} VIEW\n${o.answer}`).join('\n\n')}

Synthesize the four specialist views above into one coherent conclusion. Follow your standard judge workflow.`;

      const judgeCfg = SUBAGENT_TYPES['judge'] ?? SUBAGENT_TYPES[DEFAULT_SUBAGENT_TYPE];
      const judgeAllowlist = resolveSubagentTools('judge');
      const judge = await Agent.create({
        model,
        maxIterations: judgeCfg.maxIterations,
        signal,
        memoryEnabled: false,
        toolAllowlist: judgeAllowlist,
        systemPromptOverride: judgeCfg.systemPrompt,
        agentLabel: 'judge',
      });
      let judgeAnswer = '';
      for await (const ev of judge.run(judgeTask)) {
        if (ev.type === 'done') judgeAnswer = ev.answer;
      }
      outputs.push({ role: 'judge', answer: judgeAnswer, duration_ms: Date.now() - t1 });

      const total_ms = outputs.reduce((s, o) => s + o.duration_ms, 0);

      return formatToolResult({
        thesis: input.thesis,
        ticker: input.ticker,
        specialist_outputs: outputs,
        judge_synthesis: judgeAnswer,
        total_duration_ms: total_ms,
      });
    },
  });
}