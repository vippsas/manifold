# Project-Aware Background Agent

Status: Draft
Date: 2026-03-30

## Purpose

This document captures a working product direction for a background agent that supports a developer from PM and architect altitude rather than only from the code level.

It is intended to be a living document. The goal is to define what kind of proactive AI system is actually useful: one that understands the current project, researches the outside world, and suggests relevant ideas with clear reasoning.

## Core Thesis

The most valuable proactive AI may not be a code suggestion engine at all.

A stronger product direction is a project-aware background agent that:

- understands the current project deeply enough to know what matters
- researches how similar tools, teams, and communities solve related problems
- proposes new feature ideas, architectural improvements, and strategic questions
- explains why each suggestion is relevant now, for this project, under these constraints

This is a higher-altitude assistant. It should think more like a PM, architect, and technical strategist than like a local autocomplete or narrow coding skill.

## Product Shape

The right product is not just a set of reactive skills that run on code artifacts.

It is a persistent background agent with four core capabilities:

- project understanding
- external research
- cross-source synthesis
- selective proactive delivery

Skills may still exist underneath as implementation mechanisms, but they are not the main product abstraction here. The main product abstraction is a background research and synthesis agent that continuously connects outside signals to the local project.

## What The Agent Must Understand

The agent cannot operate from code retrieval alone. It needs a durable model of the project.

That model should include:

- product goals and positioning
- current user problems and target audience
- roadmap themes and open questions
- codebase structure and technical constraints
- architecture and service boundaries
- delivery model and operational constraints
- recent changes, incidents, and friction points
- team conventions and non-goals
- dependency stack and external integrations

The system should understand not only how the software is built, but what it is trying to become.

## External Research Inputs

External research is a first-class input, not a secondary enrichment step.

Relevant sources may include:

- documentation and changelogs for similar tools
- open source repositories and issue discussions
- engineering blogs, design writeups, and postmortems
- forums and practitioner communities
- adjacent product launches and competitor changes
- standards, platform changes, and dependency ecosystem shifts
- benchmark reports, case studies, and public implementation notes

The value comes from connecting these outside signals back to the local project instead of simply summarizing trends.

## What The Agent Should Suggest

The output should sit above the level of line-by-line coding advice.

Strong suggestion categories:

### 1. New Feature Ideas

Suggest features that fit the current product direction because similar tools solved adjacent problems in ways that appear relevant.

### 2. Architectural Design Improvements

Suggest structural changes when outside examples reveal a better pattern for scalability, maintainability, extensibility, or user experience.

### 3. Pattern Transfer

Point out when another tool, framework, or team has solved a similar workflow problem in a way that may transfer well here.

### 4. Ecosystem Watch

Surface important external changes such as new platform capabilities, dependency shifts, community expectations, or emerging defaults that should affect planning.

### 5. Strategic Questions

Raise questions that the team may not be asking yet, for example:

- are we missing a feature category users are starting to expect?
- are we solving a workflow in a more complicated way than peers?
- is our current architecture limiting a likely future direction?
- are we ignoring an external pattern that now appears mature enough to adopt?

## Core Reasoning Loop

The agent should run a continuous loop:

1. Maintain a current model of the project.
2. Gather external signals from the web, communities, repos, docs, and discussions.
3. Match external signals against the project's goals, gaps, architecture, and current trajectory.
4. Generate hypotheses, not just observations.
5. Rank those hypotheses by relevance, novelty, feasibility, and confidence.
6. Deliver only the strongest suggestions, with sources and reasoning.
7. Learn from developer feedback over time.

This is not generic research. It is research filtered through project context.

## Why This Is Different From Skills

Skills are useful for bounded tasks with a clear trigger and a narrow output.

This product is different:

- the inputs are open-ended and cross-source
- the output is strategic and hypothesis-driven
- the timing is proactive rather than user-invoked
- the value comes from synthesis, prioritization, and taste

Skills may still be part of the implementation, but a skills-only framing is too small for this product direction.

## Delivery Model

The system should not interrupt constantly. Delivery matters as much as content.

Good delivery shapes:

- a weekly or daily strategic digest
- suggestion cards tied to major recent project changes
- event-triggered alerts for important ecosystem shifts
- deeper research briefs when a high-potential topic emerges

Each suggestion should answer:

- what is the idea?
- why does it matter for this project?
- what external evidence supports it?
- why now?
- what is the likely impact and cost?

## Trust Requirements

This kind of agent will fail if it becomes a stream of vague innovation theater.

To stay useful, it should:

- cite sources and dates for external claims
- distinguish facts from inferences
- connect every suggestion to known project context
- explain why the recommendation is timely
- avoid generic trend summaries without local relevance
- avoid repeating obvious ideas
- be highly selective about what it surfaces

Trust will depend more on relevance and judgment than on volume.

## Recommended MVP

The first version should be narrow but directionally correct.

### Phase 1: Build The Project Model

Ingest:

- key docs
- architecture notes
- roadmap material
- issues and discussions
- recent pull requests and major changes
- explicit product goals and constraints when available

### Phase 2: Add External Research

Continuously gather source material from:

- similar products
- open source communities
- relevant technical forums
- engineering blogs and design notes
- dependency and platform updates

### Phase 3: Ship A Curated Suggestion Feed

Start with a limited set of suggestion types:

- feature opportunities
- architecture improvement ideas
- ecosystem shifts worth responding to
- pattern-transfer suggestions from comparable tools

### Phase 4: Add Feedback And Personalization

Let developers mark suggestions as:

- useful
- not relevant
- obvious
- not feasible
- weakly supported
- badly timed

Use this to improve ranking, source selection, and delivery timing.

## Evaluation

The success metric is not how much the system writes. It is whether the developer consistently sees ideas they would not have found as quickly on their own.

Good evaluation dimensions:

- relevance to the current project
- novelty
- actionability
- source quality
- follow-up rate
- low noise and low mute rate

The strongest signal of value is simple: the system regularly causes good product or architecture decisions that would otherwise have been delayed or missed.

## Summary

The right background agent is not primarily a code reviewer or a bundle of reactive skills.

It is a project-aware research and strategy partner. It understands what the current project is, watches the surrounding ecosystem, and brings back source-backed ideas about what to build next, what to improve structurally, and which external patterns are now worth taking seriously.

The product bar is not breadth. It is relevance, timing, and judgment.
