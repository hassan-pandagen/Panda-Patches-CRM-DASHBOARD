# Claude Certified Architect — Foundations: Study Plan

**Owner:** Hassan Jamal
**Started:** 2026-04-28
**Target exam date:** ~2026-05-19 (2 weeks study + 5 practice tests before)
**Pass score:** 720 / 1000
**Practice exam target:** 900 / 1000 consistently before scheduling real exam
**Cadence:** 30 min/day weekdays + dedicated hands-on weekends

---

## Why this plan

The cert is partner-only, **one attempt**, $99 after Early Access. The 4 hands-on exercises in the official Exam Guide are the actual prep path — not just watching videos. Daily 30-min slots cover theory; weekends cover the hands-on builds.

**Total time investment:**
- 14 weekdays × 30 min = **7 hours theory**
- 4 weekend exercises × ~4 hours each = **16 hours hands-on**
- 5 practice exam loops × 1.5 hours each (test + review) = **7.5 hours**
- **Total ≈ 30 hours over ~3 weeks**

---

## Domain weights (memorize)

| Domain | Weight | Notes |
|---|---|---|
| 1. Agentic Architecture & Orchestration | **27%** | Biggest. Coordinator-subagent, parallel Task calls, hooks |
| 2. Tool Design & MCP Integration | 18% | Tool descriptions, structured errors, MCP scoping |
| 3. Claude Code Configuration & Workflows | 20% | CLAUDE.md hierarchy, rules, slash commands, plan mode, CI |
| 4. Prompt Engineering & Structured Output | 20% | tool_use + JSON schema, few-shot, batches API |
| 5. Context Management & Reliability | 15% | Provenance, escalation, lost-in-the-middle, scratchpads |

**Spend study time roughly proportional to weights.** Domain 1 is where points are won/lost.

---

## Daily 30-min schedule (Weeks 1-2)

### Week 1 — Theory & Anthropic Academy

| Day | 30-min focus |
|---|---|
| **Mon** | Anthropic Academy → **Introduction to Claude Cowork** (part 1) |
| **Tue** | Anthropic Academy → **Introduction to Claude Cowork** (part 2) |
| **Wed** | Anthropic Academy → **Claude Code in Action** (part 1) |
| **Thu** | Anthropic Academy → **Claude Code in Action** (part 2) |
| **Fri** | Re-read Exam Guide Domain 1 (Agentic Architecture) — list every "Skills in" bullet |
| **Sat** | **WEEKEND HANDS-ON: Exercise 4** (multi-agent research, ~4 hrs) |
| **Sun** | Practice Exam #1 — review every wrong answer, write down the pattern |

### Week 2 — Domain deep-dives + hands-on

| Day | 30-min focus |
|---|---|
| **Mon** | [Building Effective Agents](https://www.anthropic.com/research/building-effective-agents) blog post — read fully |
| **Tue** | MCP spec ([modelcontextprotocol.io](https://modelcontextprotocol.io)) — focus on tools, resources, isError |
| **Wed** | Exam Guide Domain 2 (Tool Design) re-read |
| **Thu** | Exam Guide Domain 4 (Prompt Engineering) re-read |
| **Fri** | Exam Guide Domain 5 (Context Management) re-read |
| **Sat** | **WEEKEND HANDS-ON: Exercise 1** (multi-tool agent + escalation, ~4 hrs) |
| **Sun** | **WEEKEND HANDS-ON: Exercise 3** (extraction + Batches API, ~4 hrs) |

### Week 3 — Practice exam loop

| Day | Activity |
|---|---|
| **Mon** | Practice Exam #2 — review |
| **Tue** | 30 min: re-read weakest domain identified by Practice #2 |
| **Wed** | Practice Exam #3 — review |
| **Thu** | 30 min: re-read second-weakest domain |
| **Fri** | Practice Exam #4 — review |
| **Sat** | **Exercise 2** (CLAUDE.md / rules / skills config, ~3 hrs) + Practice Exam #5 |
| **Sun** | **Real exam** if scoring 900+ on Practice #4 and #5. Else: extend by a week. |

---

## The 4 hands-on exercises (do in this order)

These come straight from the Exam Guide. Doing all 4 = your hands-on prep.

### Exercise 4 — Multi-Agent Research (do FIRST, biggest weight)

**Why first:** Domain 1 = 27%, this is your weakest area. Biggest leverage.

**Build:** Coordinator agent + 2-3 subagents (web search + document analysis + synthesizer).

**Must demonstrate:**
- `allowedTools` includes "Task" on coordinator
- Subagent context passed explicitly via prompt (no auto-inheritance)
- Multiple `Task` tool calls in a single coordinator response (parallel)
- Each subagent returns structured output: claim, evidence excerpt, source, date
- Simulate a subagent timeout → coordinator receives structured error context (failure type, attempted query, partial results) → coordinator proceeds with partial results + annotates coverage gaps
- Synthesis with conflicting source data preserves both values + source attribution

### Exercise 1 — Customer Support Agent with Escalation

**Build:** Single agent with 3-4 MCP tools (`get_customer`, `lookup_order`, `process_refund`, `escalate_to_human`).

**Must demonstrate:**
- Agentic loop checking `stop_reason` (`tool_use` continues, `end_turn` terminates)
- Tool descriptions clearly differentiate similar tools (e.g., `get_customer` vs `lookup_order`)
- Structured error responses with `errorCategory` (transient/validation/permission), `isRetryable` boolean
- **Programmatic hook** that blocks `process_refund` until `get_customer` has returned a verified ID — this is the Q1 pattern from sample questions
- PostToolUse hook for normalising heterogeneous timestamp formats
- Multi-concern message handling (decompose, parallel investigate, unified response)

### Exercise 3 — Structured Extraction Pipeline

**Build:** Document extractor using `tool_use` + JSON schema + retry loops + Batches API.

**Must demonstrate:**
- JSON schema with required, optional, nullable fields, enum + "other" + detail string
- `tool_choice: "any"` for unknown doc types; forced selection for required first step
- Validation-retry: append validation errors to retry prompt
- Distinguish retryable errors (format) from non-retryable (info absent)
- 2-4 few-shot examples for varied document formats
- Batch submission of 100 docs via Message Batches API; handle failures by `custom_id`
- Field-level confidence scores → human review routing

### Exercise 2 — Claude Code Team Workflow Config

**Build:** Real project (use the Panda Patches CRM repo) with proper config.

**Must demonstrate:**
- Project-level CLAUDE.md with universal standards
- `.claude/rules/` files with `paths:` glob frontmatter (e.g., `paths: ["**/*.test.tsx"]`)
- Project-scoped skill in `.claude/skills/SKILL.md` with `context: fork`, `allowed-tools`, `argument-hint`
- `.mcp.json` with `${ENV_VAR}` expansion + a personal server in `~/.claude.json`
- Plan mode used for a multi-file refactor; direct execution for a single-file fix

---

## The 5 practice exam strategy

Anthropic provides a Practice Exam in the partner portal. Strategy:

| Attempt # | When | Goal | Action after |
|---|---|---|---|
| **1** | End Week 1 | Baseline. Don't expect to pass. | Identify weakest domain. Spend Week 2 evening reading on it. |
| **2** | Start Week 3 | Improvement on weakest domain | Review every wrong answer; note the pattern (was it "use programmatic not prompt"? "simpler is better"? etc.) |
| **3** | Mid Week 3 | Target 800+ | Address remaining gaps |
| **4** | Late Week 3 | Target 900+ | If <900, do NOT schedule real exam — add a week |
| **5** | Sat before real exam | Confirm 900+ | If 900+, schedule real exam Sunday |

**Review protocol after each practice:**
1. For every wrong answer: read the explanation, write the lesson in 1 sentence
2. Save the lesson list — reread before each subsequent practice
3. Identify the domain → re-read that domain's task statements in the Exam Guide

If practice scores plateau below 900 after attempt #4, **don't take the real exam yet**. Extend by a week, add another hands-on exercise.

---

## Meta-pattern: how the exam thinks

After reviewing 12 sample questions, the right answer almost always follows ONE of these principles:

| Principle | When to apply |
|---|---|
| **Programmatic > prompt** | When you need a guarantee (e.g., verify customer before refund) |
| **Specific criteria > vague instructions** | "Flag X when condition Y" beats "be conservative" |
| **Simpler fix first** | Improve tool descriptions before adding routing layers |
| **Match API to workload** | Batches API for overnight, sync for blocking |
| **Source attribution > confidence scores** | LLM self-confidence is unreliable |
| **Structured error context > generic errors** | Coordinator can recover with detail |
| **Honor explicit user requests immediately** | Don't try to resolve when they asked for human |
| **Address root cause, not symptoms** | Coordinator decomposition is wrong → fix decomposition, not subagents |

**If two answers seem right, pick the one that:**
- Uses the simpler mechanism with the stronger guarantee
- Addresses the actual root cause stated in the question
- Doesn't over-engineer (no new ML classifier when prompt fix works)

---

## Out-of-scope (do NOT study)

The Exam Guide explicitly says these are NOT tested:
- Fine-tuning, RLHF, Constitutional AI
- API auth, billing, rate limiting, pricing math
- Streaming / SSE
- Computer Use, vision, embeddings, vector DBs
- Token counting algorithms
- Cloud provider configs (AWS/GCP/Azure)
- Prompt caching internals (just know it exists)

If a topic isn't in the "In-Scope Topics" appendix of the Exam Guide, skip it.

---

## Resources

| Resource | Use for |
|---|---|
| [Anthropic Academy](https://anthropic.skilljar.com) | Cowork + Claude Code in Action courses |
| [Building Effective Agents](https://www.anthropic.com/research/building-effective-agents) | Domain 1 conceptual foundation |
| [MCP spec](https://modelcontextprotocol.io) | Domain 2 — tools, resources, errors |
| [Anthropic API docs](https://docs.anthropic.com) | Tool use, JSON schemas, Batches API |
| [Agent SDK docs](https://docs.claude.com/en/docs/agents) | Coordinator-subagent patterns |
| [Anthropic Cookbook](https://github.com/anthropics/anthropic-cookbook) | Working code patterns |
| Exam Guide PDF (in repo root) | Source of truth for what's tested |

---

## Daily ritual (the 30 min)

1. Open this doc. Look at today's row in the schedule.
2. Set a 25-min timer (Pomodoro). Last 5 min = note-taking.
3. Read / watch / re-read the assigned material.
4. End the session by writing one sentence in the **Lessons Log** below — what's the most important thing you learned today?
5. Update the **Status** field at the top of this doc.

If you miss a day, don't double up — just resume the next day. Consistency > catch-up.

---

## Lessons log (append daily)

<!-- Format: YYYY-MM-DD — one-line lesson -->

- _example: 2026-04-28 — Programmatic enforcement (hooks) is required when business rules need guaranteed compliance; prompts are probabilistic._

---

## Status

- [ ] Week 1 complete
- [ ] Exercise 4 done
- [ ] Practice Exam #1 taken
- [ ] Week 2 complete
- [ ] Exercise 1 done
- [ ] Exercise 3 done
- [ ] Practice Exams #2-#5 taken
- [ ] Exercise 2 done
- [ ] Practice scoring 900+ consistently
- [ ] Real exam scheduled
- [ ] **PASSED** ✅

---

## Decision log

- **2026-04-28** — Started prep. Chose 30 min/day weekdays + weekend hands-on after reading the official Exam Guide. Pass score 720; practice target 900 to leave headroom for real-exam variance.
